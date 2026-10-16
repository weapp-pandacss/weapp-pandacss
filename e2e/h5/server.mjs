import { statSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import path from 'node:path'
import process from 'node:process'

const roots = {
  'taro-app': 'dist/h5',
  'taro-app-vue3': 'dist/h5',
  'uni-app-vue3': 'dist/build/h5',
}
const [app, port] = process.argv.slice(2)
if (!Object.hasOwn(roots, app) || !/^\d+$/.test(port)) {
  throw new Error('Usage: node e2e/h5/server.mjs <example> <port>')
}
const root = path.resolve(import.meta.dirname, '../../examples', app, roots[app])
statSync(path.join(root, 'index.html'))
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
}
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname)
    const file = path.resolve(root, `.${pathname}`)
    if (file !== root && !file.startsWith(`${root}${path.sep}`)) {
      response.writeHead(403).end()
      return
    }
    const target = path.extname(file) ? file : path.join(root, 'index.html')
    const content = await readFile(target)
    response.writeHead(200, { 'content-type': types[path.extname(target)] ?? 'application/octet-stream', 'cache-control': 'no-store' }).end(content)
  }
  catch {
    response.writeHead(404).end('Not found')
  }
})
server.listen(Number(port), '127.0.0.1')
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => server.close())
}
