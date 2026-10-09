import type { CodegenPrepareArtifact } from '@pandacss/types'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { portableMarker, transformArtifacts } from '@/panda/transform'
import { encodeClassName } from '@/runtime'

function batch(helpers = 'export function createSerializeCss() {}\nexport function getCompoundVariantClassNames() {}', slots = 'const classNameMap = {}; classNameMap.root = recipe.className;', extension = 'mjs'): CodegenPrepareArtifact[] {
  return [{
    id: 'runtime',
    files: [
      { path: `helpers.${extension}`, code: helpers, dependencies: ['outExtension'] },
      { path: `css/sva.${extension}`, code: slots, dependencies: ['outExtension'] },
      { path: 'tokens/index.d.ts', code: 'export declare const token: unknown;', dependencies: [] },
    ],
  }]
}

describe('artifact contract and diagnostics', () => {
  it.each(['js', 'mjs'])('transforms a complete %s batch without mutating Panda artifacts', (extension) => {
    const artifacts = batch(undefined, undefined, extension)
    const original = structuredClone(artifacts)
    const transformed = transformArtifacts(artifacts)
    expect(artifacts).toEqual(original)
    expect(transformed[0]!.files[2]).toEqual(original[0]!.files[2])
    expect(transformed[0]!.files[0]!.dependencies).toEqual(['outExtension'])
    expect(transformed.at(-1)!.files[0]!.path).toBe(`weapp-panda/runtime.${extension}`)
    expect(transformed[0]!.files[0]!.code).toContain(`./weapp-panda/runtime.${extension}`)
    expect(transformed[0]!.files[1]!.code).toContain(`../weapp-panda/runtime.${extension}`)
    expect(transformArtifacts(transformed)).toBe(transformed)
  })

  it('supports non-exported helper declarations used by a runtime barrel', () => {
    expect(transformArtifacts(batch('function createSerializeCss() {}\nfunction getCompoundVariantClassNames() {}'))[0]!.files[0]!.code)
      .toContain('__weappPandaPortable_getCompoundVariantClassNames')
  })

  it('reports a missing slot runtime before parsing helper code', () => {
    const artifacts = batch()
    artifacts[0]!.files.splice(1, 1)
    expect(() => transformArtifacts(artifacts)).toThrow('missing css/sva runtime')
  })

  it.each(['const createSerializeCss = () => {};', 'export function createCss() {}', 'export function createSerializeCss() {}'])('rejects unsupported helper declarations: %s', (helpers) => {
    expect(() => transformArtifacts(batch(helpers))).toThrow('Unsupported Panda 2.1.2 runtime: missing')
  })

  it.each([
    'const classNameMap = {};',
    'classNameMap.root = recipe.className; classNameMap.icon = recipe.className;',
    'classNameMap.root = "raw";',
    'classNameMap.root = recipe.other;',
  ])('rejects changed slot producers: %s', (slots) => {
    expect(() => transformArtifacts(batch(undefined, slots))).toThrow('Unsupported Panda 2.1.2 sva')
  })

  it('ignores unrelated assignments when locating the slot producer', () => {
    expect(transformArtifacts(batch(undefined, 'const other = {}; other.root = "plain"; classNameMap.root = recipe.className;'))[0]!.files[1]!.code)
      .toContain('other.root = "plain"')
  })

  it.each(['__weappPandaOriginal_css', './weapp-panda/index.mjs'])('rejects legacy patches: %s', (legacy) => {
    expect(() => transformArtifacts(batch(`// ${legacy}`))).toThrow('Legacy weapp-panda patch detected')
  })

  it.each(['__weappPandaPortable_css', 'weapp-panda/runtime.mjs'])('rejects wrappers that lost their marker: %s', (wrapper) => {
    expect(() => transformArtifacts(batch(undefined, `// ${wrapper}`))).toThrow('missing generation markers')
  })

  it.each(['helper', 'slot', 'module', 'all-with-unmarked-module'])('rejects partially converted batches: %s', (scenario) => {
    const artifacts = batch()
    if (scenario === 'helper' || scenario === 'all-with-unmarked-module') {
      artifacts[0]!.files[0]!.code = `// ${portableMarker}`
    }
    if (scenario === 'slot' || scenario === 'all-with-unmarked-module') {
      artifacts[0]!.files[1]!.code = `// ${portableMarker}`
    }
    if (scenario === 'module' || scenario === 'all-with-unmarked-module') {
      artifacts.push({ id: 'adapter', files: [{
        path: 'weapp-panda/runtime.mjs',
        code: '',
        dependencies: [],
      }] })
    }
    expect(() => transformArtifacts(artifacts)).toThrow('Incomplete or incompatible')
  })

  it('propagates syntax errors instead of returning an unadapted batch', () => {
    expect(() => transformArtifacts(batch('export function {'))).toThrow(SyntaxError)
  })
})

it('preserves serializer descriptors, raw results, symbols and slot metadata in executable output', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'panda-descriptors-'))
  try {
    const artifacts = batch(`
      export function createSerializeCss() {
        const serializer = (...styles) => styles.join(' ');
        Object.defineProperties(serializer, {
          raw: { value: (...styles) => styles, enumerable: false },
          metadata: { get: () => 'metadata', enumerable: true },
          [Symbol.for('panda-test')]: { value: 42, writable: false }
        });
        return serializer;
      }
      export function getCompoundVariantClassNames() { return 'compound/中文'; }
    `, `const classNameMap = {}; const recipe = {className: 'slot/中文'}; classNameMap.root = recipe.className; export {classNameMap};`)
    for (const artifact of transformArtifacts(artifacts)) {
      for (const file of artifact.files) {
        const destination = path.join(root, file.path)
        await fs.mkdir(path.dirname(destination), { recursive: true })
        await fs.writeFile(destination, file.code)
      }
    }
    const helpers = await import(pathToFileURL(path.join(root, 'helpers.mjs')).href)
    const serializer = helpers.createSerializeCss()
    expect(serializer('a.b', '中文')).toBe(`${encodeClassName('a.b')} ${encodeClassName('中文')}`)
    expect(serializer.raw('a.b', '中文')).toEqual(['a.b', '中文'])
    expect(serializer.metadata).toBe('metadata')
    expect(Object.getOwnPropertyDescriptor(serializer, 'raw')!.enumerable).toBe(false)
    expect(Object.getOwnPropertyDescriptor(serializer, Symbol.for('panda-test'))).toMatchObject({ value: 42, writable: false })
    expect(helpers.getCompoundVariantClassNames()).toBe(encodeClassName('compound/中文'))
    const slots = await import(pathToFileURL(path.join(root, 'css/sva.mjs')).href)
    expect(slots.classNameMap.root).toBe(encodeClassName('slot/中文'))
  }
  finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})
