import type { CodegenPrepareArtifact } from '@pandacss/types'
import * as t from '@babel/types'
import { generate, parse, traverse } from '@/babel'
import { createPortableRuntime } from '@/runtime'

export const portableMarker = 'weapp-pandacss:portable-v1'

function appendWrapper(program: t.Program, name: string, factory: boolean) {
  const found = program.body.some(node => (t.isFunctionDeclaration(node) && node.id?.name === name)
    || (t.isExportNamedDeclaration(node) && t.isFunctionDeclaration(node.declaration) && node.declaration.id?.name === name))
  if (!found) {
    throw new Error(`Unsupported Panda 2.1.2 runtime: missing ${name}.`)
  }
  const original = `__weappPandaPortable_${name}`
  const body = factory
    ? `const serializer = ${original}(...args);
       const wrapped = (...styles) => encodeClassList(serializer(...styles));
       return Object.defineProperties(wrapped, Object.getOwnPropertyDescriptors(serializer));`
    : `return encodeClassList(${original}(...args));`
  program.body.push(...parse(`const ${original} = ${name}; ${name} = function (...args) { ${body} };`).program.body)
}

function addImport(program: t.Program, source: string, name: string) {
  program.body.unshift(t.importDeclaration([
    t.importSpecifier(t.identifier(name), t.identifier(name)),
  ], t.stringLiteral(source)))
}

function transformHelpers(code: string, extension: string) {
  const ast = parse(code, { sourceType: 'module' })
  addImport(ast.program, `./weapp-panda/runtime.${extension}`, 'encodeClassList')
  appendWrapper(ast.program, 'createSerializeCss', true)
  appendWrapper(ast.program, 'getCompoundVariantClassNames', false)
  return generate(ast).code
}

function transformSlots(code: string, extension: string) {
  const ast = parse(code, { sourceType: 'module' })
  let count = 0
  traverse(ast, {
    AssignmentExpression({ node }: { node: t.AssignmentExpression }) {
      if (t.isMemberExpression(node.left) && t.isIdentifier(node.left.object, { name: 'classNameMap' })) {
        if (!t.isMemberExpression(node.right) || !t.isIdentifier(node.right.property, { name: 'className' })) {
          throw new Error('Unsupported Panda 2.1.2 sva classNameMap structure.')
        }
        node.right = t.callExpression(t.identifier('encodeClassName'), [node.right])
        count++
      }
    },
  })
  if (count !== 1) {
    throw new Error('Unsupported Panda 2.1.2 sva runtime: expected one slot classNameMap producer.')
  }
  addImport(ast.program, `../weapp-panda/runtime.${extension}`, 'encodeClassName')
  return generate(ast).code
}

/** Transform complete artifact batches; the marker belongs to the batch, not the codec. */
export function transformArtifacts(artifacts: CodegenPrepareArtifact[]): CodegenPrepareArtifact[] {
  const runtimeFiles = artifacts.flatMap(artifact => artifact.files)
  const helper = runtimeFiles.find(file => /^helpers\.[^./]+$/.test(file.path))
  if (!helper) {
    throw new Error('Cannot find Panda helpers in codegen artifacts. Use the standard Panda codegen pipeline.')
  }
  const extension = helper.path.split('.').at(-1)!
  if (extension !== 'js' && extension !== 'mjs') {
    throw new Error(`weappPanda supports outExtension "js" or "mjs"; found "${extension}". TypeScript-only artifacts are not supported.`)
  }
  const slot = runtimeFiles.find(file => file.path === `css/sva.${extension}`)
  if (!slot) {
    throw new Error('Unsupported Panda 2.1.2 artifacts: missing css/sva runtime.')
  }
  const marked = [helper, slot].filter(file => file.code.includes(`// ${portableMarker}`))
  const modulePath = `weapp-panda/runtime.${extension}`
  const runtime = runtimeFiles.find(file => file.path === modulePath)
  if (marked.length || runtime) {
    if (marked.length === 2 && runtime?.code.includes(`// ${portableMarker}`)) {
      return artifacts
    }
    throw new Error('Incomplete or incompatible weappPanda artifacts. Delete the generated directory and run panda codegen.')
  }
  if (helper.code.includes('__weappPandaOriginal_') || helper.code.includes('./weapp-panda/index.')) {
    throw new Error('Legacy weapp-panda patch detected. Delete the generated directory before using weappPanda.')
  }
  if ([helper, slot].some(file => file.code.includes('__weappPandaPortable_') || file.code.includes('weapp-panda/runtime.'))) {
    throw new Error('Incomplete weappPanda artifacts: missing generation markers. Delete the generated directory and run panda codegen.')
  }

  return [
    ...artifacts.map(artifact => ({
      ...artifact,
      files: artifact.files.map(file => ({
        ...file,
        code: file === helper
          ? `// ${portableMarker}\n${transformHelpers(file.code, extension)}`
          : file === slot
            ? `// ${portableMarker}\n${transformSlots(file.code, extension)}`
            : file.code,
      })),
    })),
    {
      id: 'weapp-pandacss-runtime',
      files: [{
        path: modulePath,
        code: `// ${portableMarker}\nconst runtime = (${createPortableRuntime.toString()})();\nexport const encodeClassName = runtime.encodeClassName;\nexport const encodeClassList = runtime.encodeClassList;\n`,
        dependencies: ['outExtension', 'forceImportExtension'],
      }],
    },
  ]
}
