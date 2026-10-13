import type { PackedPackages, PandaVersion } from './packed-consumer'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import postcss from 'postcss'
import selectorParser from 'postcss-selector-parser'
import { transformArtifacts } from '@/panda/transform'
import { encodeClassName } from '@/runtime'
import { adapterRoot, linkDependency, packedConsumer, packPackages, pandaVersions, run } from './packed-consumer'

const exampleRoot = path.resolve(adapterRoot, '../../examples/react-app')
let packedRoot: string
let packages: PackedPackages

beforeAll(async () => {
  packedRoot = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'panda-packed-cohorts-')))
  packages = await packPackages(packedRoot)
}, 60_000)

afterAll(async () => {
  if (packedRoot) {
    await fs.rm(packedRoot, { recursive: true, force: true })
  }
})

function pandaBin(root: string) {
  return path.join(root, 'node_modules/@pandacss/dev/bin.js')
}

async function fixture(version: PandaVersion, extension: string, hash = false, prefix?: string | { className: string, cssVar: string }) {
  const root = await fs.mkdtemp(path.join(packedRoot, `panda-${version}-`))
  try {
    await packedConsumer(root, packages, version)
    for (const name of ['react', 'react-dom']) {
      await linkDependency(root, name, name, exampleRoot)
    }
    await fs.writeFile(path.join(root, 'panda.config.mjs'), `import { weappPanda } from 'weapp-pandacss/panda'; import fs from 'node:fs';
      export default {
        plugins: [{name:'capture',hooks:{'codegen:prepare':({artifacts})=>{fs.writeFileSync(${JSON.stringify(path.join(root, 'artifacts.json'))},JSON.stringify(artifacts))}}},weappPanda()],
        ${prefix === undefined ? '' : `prefix: ${JSON.stringify(prefix)},`}
        presets: ['@pandacss/preset-base', '@pandacss/preset-panda'],
        include: ['./src/**/*.tsx'], outdir: 'styled-system', outExtension: '${extension}',
        forceImportExtension: true, jsxFramework: 'react', hash: {className: ${hash}, cssVar: false},
        theme: { extend: {
          tokens: { spacing: { '中文/值': {value:'2rem'} } },
          semanticTokens: { colors: { 'brand/主色': {value:'{colors.red.500}'} } },
          recipes: { button: {className:'2demo/button', base:{color:'red.500'}, variants:{size:{'1/2':{padding:'0.5'}}}, compoundVariants:[{size:'1/2',css:{color:'blue.500'}}]} },
          slotRecipes: { card: {className:'demo/card', slots:['root','icon'], base:{root:{color:'red.500'},icon:{color:'blue.500'}}, variants:{size:{'1/2':{root:{padding:'0.5'},icon:{padding:'0.5'}}}}, compoundVariants:[{size:'1/2',css:{root:{color:'green.500'}}}]} },
        } },
      }`)
    await fs.mkdir(path.join(root, 'src'))
    await fs.writeFile(path.join(root, 'src/styles.tsx'), `
      import { css, cva, sva, cx } from '../styled-system/css/index.${extension}';
      import { token } from '../styled-system/tokens/index.${extension}';
      import { box } from '../styled-system/patterns/index.${extension}';
      import { button, card } from '../styled-system/recipes/index.${extension}';
      import { styled } from '../styled-system/jsx/index.${extension}';
      export const atomic = css({ color:'red.500', padding:'0.5', margin:'-0.5', _hover:{color:'blue.500'}, width:'50%', height:'中文', fontSize:'1.5rem', backgroundColor:'red.500 !important' });
      export const fromToken = css({padding:token.var('spacing.0.5')});
      export const fromValue = css({padding:token('spacing.0.5')});
      export const semantic = css({color:'brand/主色'});
      export const variation = cva({base:{color:'red.500'},variants:{size:{'1/2':{padding:'0.5'}}}});
      export const variant = variation({size:'1/2'});
      export const slots = sva({className:'inline/card',slots:['root','icon'],base:{root:{color:'red.500'},icon:{color:'blue.500'}}});
      export const slotClasses = slots({});
      export const named = button({size:'1/2'});
      export const namedSlots = card({size:'1/2'});
      export const patterned = box({color:'red.500'});
      export const joined = cx(atomic, 'authored');
      export const Styled = () => <styled.div css={{color:'red.500'}} className="authored" />;
      export { css, token, button };
    `)
    // Runtime evaluation uses JS; Panda extracts the TSX source above.
    return root
  }
  catch (error) {
    await fs.rm(root, { recursive: true, force: true })
    throw error
  }
}

function collectClasses(css: string) {
  const classes = new Set<string>()
  postcss.parse(css).walkRules((rule) => {
    selectorParser(selectors => selectors.walkClasses((node) => {
      classes.add(node.value)
    })).processSync(rule.selector)
  })
  return classes
}

describe.each(pandaVersions)('packed Panda %s generation plugin', (version) => {
  it.each([['js', false], ['mjs', false], ['js', true], ['mjs', true]] as const)('generates matching %s runtime with class hash=%s', async (extension, hash) => {
    const root = await fixture(version, extension, hash)
    try {
      await run(process.execPath, [pandaBin(root), 'codegen'], { cwd: root })
      const helper = path.join(root, `styled-system/helpers.${extension}`)
      const generated = await fs.readFile(helper, 'utf8')
      const portable = await fs.readFile(path.join(root, `styled-system/weapp-panda/runtime.${extension}`), 'utf8')
      expect(portable).not.toContain('@weapp-pandacss/runtime')
      const artifacts = JSON.parse(await fs.readFile(path.join(root, 'artifacts.json'), 'utf8'))
      const transformed = transformArtifacts(artifacts)
      expect(transformArtifacts(transformed)).toBe(transformed)
      expect(JSON.stringify(artifacts)).not.toContain('weapp-pandacss:portable-v1')
      expect(generated).toContain('// weapp-pandacss:portable-v1')
      expect(await fs.readdir(path.join(root, 'styled-system'))).not.toContain(`_helpers.backup.${extension}`)
      await run(process.execPath, [pandaBin(root), 'codegen'], { cwd: root })
      expect(await fs.readFile(helper, 'utf8')).toBe(generated)
      await run(process.execPath, [pandaBin(root), 'cssgen', '--outfile', 'raw.css'], { cwd: root })
      const { weapp, web } = JSON.parse((await run(process.execPath, ['--input-type=module', '-e', `
        import fs from 'node:fs/promises'; import postcss from 'postcss'; import plugin from 'weapp-pandacss/postcss';
        const raw = await fs.readFile('raw.css', 'utf8');
        const weapp = (await postcss([plugin()]).process(raw, {from:undefined})).css;
        const web = (await postcss([plugin({target:'web'})]).process(raw, {from:undefined})).css;
        console.log(JSON.stringify({weapp,web}));
      `], { cwd: root })).stdout)
      const classes = collectClasses(weapp)
      expect(collectClasses(web)).toEqual(classes)
      const entry = pathToFileURL(path.join(root, 'styled-system')).href
      const script = `
        import { createElement } from 'react'; import { renderToStaticMarkup } from 'react-dom/server';
        const {css,cva,sva,cx} = await import(process.argv[1]+'/css/index.${extension}');
        const {token} = await import(process.argv[1]+'/tokens/index.${extension}');
        const {button,card} = await import(process.argv[1]+'/recipes/index.${extension}');
        const {box} = await import(process.argv[1]+'/patterns/index.${extension}');
        const {styled} = await import(process.argv[1]+'/jsx/index.${extension}');
        const variation = cva({base:{color:'red.500'},variants:{size:{'1/2':{padding:'0.5'}}}});
        const slots = sva({className:'inline/card',slots:['root','icon'],base:{root:{color:'red.500'},icon:{color:'blue.500'}}});
        const atomic = css({color:'red.500',padding:'0.5',margin:'-0.5',_hover:{color:'blue.500'},width:'50%',height:'中文',fontSize:'1.5rem',backgroundColor:'red.500 !important'});
        console.log(JSON.stringify({ atomic, variant:variation({size:'1/2'}), named:button({size:'1/2'}), namedSlots:card({size:'1/2'}),
          slots:slots({}), slotMap:slots.classNameMap, patterned:box({color:'red.500'}), joined:cx(atomic,'authored'),
          variable:token.var('spacing.0.5'), unicodeVariable:token.var('spacing.中文/值'), semanticVariable:token.var('colors.brand/主色'), negative:token('spacing.-0.5'),
          fromToken:css({padding:token.var('spacing.0.5')}), fromValue:css({padding:token('spacing.0.5')}), semantic:css({color:'brand/主色'}),
          raw:css.raw({color:'red.500'}), variantRaw:variation.raw({size:'1/2'}), variantKeys:variation.variantKeys,
          merged:css({color:'red.500'},{color:'blue.500'}), winning:css({color:'blue.500'}),
          memo:variation.__memoizedRaw__({size:'1/2'})===variation.__memoizedRaw__({size:'1/2'}),
          styled:renderToStaticMarkup(createElement(styled.div,{css:{color:'red.500'},className:'authored'})) }));`
      const evaluated = await run(process.execPath, ['--input-type=module', '-e', script, entry], { cwd: root })
      const values = JSON.parse(evaluated.stdout)
      for (const name of ['atomic', 'variant', 'named', 'patterned', 'fromToken', 'fromValue', 'semantic']) {
        for (const className of values[name].split(' ')) {
          expect(className).toMatch(/^[A-Z_][\w-]*$/i)
          expect(classes.has(className), `missing ${name}: ${className}`).toBe(true)
        }
      }
      for (const list of Object.values(values.namedSlots) as string[]) {
        list.split(' ').forEach(name => expect(classes.has(name), `missing slot: ${name}`).toBe(true))
      }
      expect(values.slotMap.root).toBe(encodeClassName('inline/card__root'))
      expect(values.slots.root.split(' ')).toContain(values.slotMap.root)
      expect(values.joined).toBe(`${values.atomic} authored`)
      expect(values.raw).toEqual({ color: 'red.500' })
      expect(values.variantRaw).toEqual({ color: 'red.500', padding: '0.5' })
      expect(values.variantKeys).toEqual(['size'])
      expect(values.merged).toBe(values.winning)
      expect(values.memo).toBe(true)
      expect(values.styled).toContain('authored')
      const styledNames = /class="([^"]+)"/.exec(values.styled)![1]!.split(' ').filter(name => name !== 'authored')
      styledNames.forEach(name => expect(classes.has(name)).toBe(true))
      for (const name of ['variable', 'unicodeVariable', 'semanticVariable']) {
        expect(values[name]).toMatch(/^var\(--[\w-]+\)$/i)
        expect(weapp).toContain(`${values[name].slice(4, -1)}:`)
      }
      expect(values.negative).toContain(values.variable)
    }
    finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  it.each(['-中文/wp_', { className: '2demo/wp_', cssVar: '-中文/wp_' }])('normalizes CSS variable prefix %j while preserving class prefixes', async (prefix) => {
    const root = await fixture(version, 'mjs', true, prefix)
    try {
      await run(process.execPath, [pandaBin(root), 'codegen'], { cwd: root })
      await run(process.execPath, [pandaBin(root), 'cssgen', '--outfile', 'raw.css'], { cwd: root })
      const css = (await run(process.execPath, ['--input-type=module', '-e', `
        import fs from 'node:fs/promises'; import postcss from 'postcss'; import plugin from 'weapp-pandacss/postcss';
        console.log((await postcss([plugin()]).process(await fs.readFile('raw.css','utf8'), {from:undefined})).css);
      `], { cwd: root })).stdout
      const entry = pathToFileURL(path.join(root, 'styled-system')).href
      const script = `const {css}=await import(process.argv[1]+'/css/index.mjs'); const {token}=await import(process.argv[1]+'/tokens/index.mjs'); console.log(JSON.stringify({className:css({color:'red.500'}),variable:token.var('colors.red.500')}));`
      const values = JSON.parse((await run(process.execPath, ['--input-type=module', '-e', script, entry], { cwd: root })).stdout)
      expect(collectClasses(css).has(values.className), JSON.stringify({ values, classes: [...collectClasses(css)].slice(-15) })).toBe(true)
      expect(values.variable).toMatch(/^var\(--[\w-]+\)$/i)
      expect(css).toContain(`${values.variable.slice(4, -1)}:`)
      const originalPrefix = typeof prefix === 'string' ? prefix : prefix.className
      expect(values.className.startsWith(encodeClassName(`${encodeClassName(originalPrefix)}-`))).toBe(true)
    }
    finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  it('runs the packed import/Panda/adapter pipeline with source maps and config reload', async () => {
    const root = await fixture(version, 'mjs')
    try {
      await fs.writeFile(path.join(root, 'src/authored.css'), '@layer base { .authored\\/中文 { color: tomato; } }')
      const result = JSON.parse((await run(process.execPath, ['--input-type=module', '-e', `
        import fs from 'node:fs/promises'; import path from 'node:path';
        import postcss from 'postcss'; import plugin from 'weapp-pandacss/postcss';
        const root = process.cwd(); const from = path.join(root,'src/app.css');
        const input = '@layer reset,base,tokens,recipes,utilities;\\n@import "./authored.css";';
        const processor = postcss([plugin()]);
        const compile = () => processor.process(input, {from,to:path.join(root,'output.wxss'),map:{inline:false}});
        const first = await compile();
        const helper = path.join(root,'styled-system/helpers.mjs');
        const before = await fs.readFile(helper,'utf8');
        const config = path.join(root,'panda.config.mjs'); const previous = await fs.stat(config);
        await fs.writeFile(config,(await fs.readFile(config,'utf8')).replace('className: false','className: true'));
        await fs.utimes(config,previous.atime,new Date(previous.mtimeMs+2000));
        const second = await compile();
        console.log(JSON.stringify({css:first.css,messages:first.messages,sources:first.map.toJSON().sourcesContent,before,second:second.css}));
      `], { cwd: root })).stdout)
      const helper = path.join(root, 'styled-system/helpers.mjs')
      expect(result.css).toContain(`.${encodeClassName('authored/中文')}`)
      expect(result.css).not.toMatch(/@layer|@import|:not\(n\)/)
      expect(result.sources).toContain('@layer base { .authored\\/中文 { color: tomato; } }')
      expect(result.messages).toEqual(expect.arrayContaining([
        expect.objectContaining({ type: 'dependency', file: path.join(root, 'panda.config.mjs'), plugin: 'pandacss' }),
        expect.objectContaining({ type: 'dependency', file: path.join(root, 'src/authored.css'), plugin: 'postcss-import' }),
        expect.objectContaining({ type: 'dir-dependency', plugin: 'pandacss' }),
      ]))
      expect(result.before).toContain('weapp-pandacss:portable-v1')
      expect(collectClasses(result.second)).not.toEqual(collectClasses(result.css))
      expect(await fs.readFile(path.join(root, 'styled-system/css/css.mjs'), 'utf8')).toContain('hash: true')
      expect(await fs.readFile(helper, 'utf8')).toContain('weapp-pandacss:portable-v1')
      expect(await fs.readdir(path.join(root, 'styled-system'))).not.toContain('_helpers.backup.mjs')
    }
    finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  it('rejects incomplete, unknown, and TypeScript-only artifacts', () => {
    expect(() => transformArtifacts([])).toThrow('Cannot find Panda helpers')
    expect(() => transformArtifacts([{ id: 'helpers', files: [{ path: 'helpers.ts', code: '', dependencies: [] }] }])).toThrow('TypeScript-only')
    const files = [
      { path: 'helpers.mjs', code: 'export const changed = true', dependencies: [] },
      { path: 'css/sva.mjs', code: '', dependencies: [] },
    ]
    expect(() => transformArtifacts([{ id: 'test', files }])).toThrow('createSerializeCss')
    expect(() => transformArtifacts([{ id: 'test', files: files.map(file => ({ ...file, code: '// weapp-pandacss:portable-v1' })) }])).toThrow('Incomplete')
  })
})
