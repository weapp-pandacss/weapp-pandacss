import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

assert(process.argv.length <= 3, 'Usage: node scripts/check-deployment.mjs [dist-directory]')
const dist = path.resolve(process.argv[2] ?? fileURLToPath(new URL('../dist/', import.meta.url)))
const source = new URL('../src/content/docs/', import.meta.url)
const metadata = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const site = new URL(`${metadata.homepage.replace(/\/$/, '')}/`)
const decoder = new TextDecoder('utf-8', { fatal: true })

function assetPath(value) {
  const url = new URL(value, site)
  assert.equal(url.origin, site.origin, `Discovery URL must stay on the documentation origin: ${url}`)
  assert(!url.search && !url.hash && !url.username && !url.password, `Unexpected discovery URL suffix: ${url}`)
  const target = path.resolve(dist, `.${decodeURIComponent(url.pathname)}`, url.pathname.endsWith('/') ? 'index.html' : '')
  assert(target.startsWith(`${dist}${path.sep}`), `Discovery URL must resolve inside dist: ${url}`)
  return target
}

async function textAsset(value) {
  const text = decoder.decode(await readFile(assetPath(value)))
  assert(text.trim(), `Deployment asset must not be empty: ${value}`)
  return text
}

// Check the generated Cloudflare rules themselves. HTTP application of these
// rules remains a deployment/runtime check; this script does not emulate it.
const rules = []
let rule
for (const line of (await textAsset('/_headers')).split(/\r?\n/)) {
  if (!line.trim() || line.trimStart().startsWith('#')) {
    continue
  }
  if (!/^\s/.test(line)) {
    assert(line.startsWith('/') && !line.includes(':'), `Unsupported header route: ${line}`)
    const pattern = line.split('*').map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*')
    rule = { route: new RegExp(`^${pattern}$`), headers: [] }
    rules.push(rule)
  }
  else {
    assert(rule, 'Header declarations must follow a route')
    const separator = line.indexOf(':')
    const name = line.slice(0, separator).trim().toLowerCase()
    const value = line.slice(separator + 1).trim()
    assert(separator > 0 && /^[\da-z-]+$/.test(name) && value, `Invalid header declaration: ${line}`)
    rule.headers.push([name, value])
  }
}
function headerValues(route, name) {
  return rules.filter(rule => rule.route.test(route)).flatMap(rule => rule.headers).filter(([header]) => header === name).map(([, value]) => value)
}
function expectHeader(route, name, value) {
  assert.deepEqual(headerValues(route, name), [value], `${route}: generated ${name} rule`)
}

for (const route of ['/.well-known/ard.json', '/.well-known/ai-catalog.json']) {
  expectHeader(route, 'content-type', 'application/json')
  expectHeader(route, 'access-control-allow-origin', '*')
}
const ard = JSON.parse(await textAsset('/.well-known/ard.json'))
assert.deepEqual(JSON.parse(await textAsset('/.well-known/ai-catalog.json')), ard, 'ARD aliases must describe the same capabilities')
assert.equal(ard.specVersion, '1.0')
assert.equal(ard.host.identifier, site.href)
assert.equal(ard.host.documentationUrl, site.href)
assert(Array.isArray(ard.entries) && ard.entries.length > 0, 'ARD must expose documentation capabilities')
assert.equal(new Set(ard.entries.map(entry => entry.identifier)).size, ard.entries.length, 'ARD entry identifiers must be unique')
for (const entry of ard.entries) {
  assert(typeof entry.identifier === 'string' && entry.identifier.trim(), 'ARD entry identifiers must be non-empty strings')
  await textAsset(entry.url)
  assert(headerValues(new URL(entry.url).pathname, 'content-type').some(value => value.split(';')[0] === entry.type), `ARD content type must have a matching header rule: ${entry.url}`)
}
for (const [route, type] of [['/llms.txt', 'text/plain'], ['/index.md', 'text/markdown']]) {
  assert(ard.entries.some(entry => entry.url === new URL(route, site).href && entry.type === type), `ARD must advertise ${route} as ${type}`)
}
const links = headerValues('/', 'link').map((value) => {
  const match = /^<([^>]+)>;\s*rel="([^"]+)"(?:;\s*type="([^"]+)")?$/.exec(value)
  assert(match, `Invalid homepage discovery link: ${value}`)
  return { url: match[1], rel: match[2], type: match[3] }
})
for (const [rel, route, type] of [
  ['ard', '/.well-known/ard.json', undefined],
  ['describedby', '/llms.txt', 'text/plain'],
  ['alternate', '/index.md', 'text/markdown'],
]) {
  assert.deepEqual(links.filter(link => link.rel === rel), [{ url: new URL(route, site).href, rel, type }], `Homepage ${rel} link must identify the deployed asset`)
}

const robots = await textAsset('/robots.txt')
expectHeader('/robots.txt', 'content-type', 'text/plain; charset=utf-8')
const sitemapIndexes = [...robots.matchAll(/^Sitemap:\s*(\S+)\s*$/gm)].map(match => match[1])
assert.deepEqual(sitemapIndexes, [new URL('/sitemap-index.xml', site).href], 'Robots must advertise the documentation sitemap index')
const sitemaps = new Set()
const locations = []
async function collectSitemap(url) {
  assert(!sitemaps.has(url), `Duplicate or cyclic sitemap: ${url}`)
  sitemaps.add(url)
  const xml = await textAsset(url)
  const entries = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1].replaceAll('&amp;', '&'))
  assert(entries.length > 0, `Sitemap must contain URLs: ${url}`)
  if (/<sitemapindex\b/.test(xml)) {
    for (const child of entries) {
      await collectSitemap(child)
    }
  }
  else {
    assert(/<urlset\b/.test(xml), `Expected a sitemap index or URL set: ${url}`)
    locations.push(...entries)
  }
}
await collectSitemap(sitemapIndexes[0])
assert.equal(new Set(locations).size, locations.length, 'Sitemap page URLs must be unique')
const pages = (await readdir(source, { recursive: true })).filter(file => /\.mdx?$/.test(file))
const expectedPages = []
for (const file of pages) {
  const body = await readFile(new URL(file.split(path.sep).join('/'), source), 'utf8')
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(body)?.[1] ?? ''
  assert(!/^(?:slug|draft)\s*:/m.test(frontmatter), `Adapt source route discovery before adding slug or draft: ${file}`)
  const slug = file.split(path.sep).join('/').replace(/\.mdx?$/, '').replace(/(^|\/)index$/, '').replace(/\/$/, '')
  expectedPages.push(new URL(`${slug}${slug ? '/' : ''}`, site).href)
}
assert.deepEqual([...locations].sort(), expectedPages.sort(), 'Sitemap must include every published source page exactly once')
for (const url of locations) {
  await textAsset(url)
  for (const extension of ['md', 'mdx']) {
    await textAsset(new URL(`index.${extension}`, url))
  }
  expectHeader(new URL('index.md', url).pathname, 'content-type', 'text/markdown; charset=utf-8')
}

// Traverse the generated directory graph so nested locale/category indexes and
// every linked Markdown document must point to an existing deployment asset.
const directories = new Set()
async function collectDirectory(route) {
  if (directories.has(route)) {
    return
  }
  directories.add(route)
  const text = await textAsset(route)
  expectHeader(new URL(route, site).pathname, 'content-type', 'text/plain; charset=utf-8')
  const links = [...text.matchAll(/\]\((https?:\/\/[^\s)]+)\)/g)].map(match => match[1])
  assert(links.length > 0, `LLM directory must expose documentation links: ${route}`)
  for (const link of links) {
    await textAsset(link)
    if (new URL(link).pathname.endsWith('/llms.txt')) {
      await collectDirectory(link)
    }
  }
}
await collectDirectory(new URL('/llms.txt', site).href)
const full = await textAsset('/llms-full.txt')
expectHeader('/llms-full.txt', 'content-type', 'text/plain; charset=utf-8')
for (const url of locations) {
  assert(full.includes(`Source: ${url} · Markdown: ${new URL('index.md', url).href}`), `Full LLM export must contain the sitemap page: ${url}`)
}
console.log(`Deployment artifacts checked: ${locations.length} sitemap pages, ${locations.length * 2} text exports, ${directories.size} LLM directories and ${ard.entries.length} discovery entries; generated header rules verified.`)
