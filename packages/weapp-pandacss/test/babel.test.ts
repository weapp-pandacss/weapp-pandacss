import babelGenerate from '@babel/generator'
import babelTraverse from '@babel/traverse'

it('accepts default-wrapped Babel exports and performs a complete AST round trip', async () => {
  // The compatibility boundary accepts both ESM functions (other suites) and
  // a CJS namespace wrapping its default. Exercise it with real Babel APIs.
  vi.doMock('@babel/generator', () => ({ default: { default: babelGenerate } }))
  vi.doMock('@babel/traverse', () => ({ default: { default: babelTraverse } }))
  vi.resetModules()
  try {
    const { generate, parse, traverse } = await import('@/babel')
    const ast = parse('const before = 1;')
    traverse(ast, { Identifier({
      node,
    }) {
      node.name = 'after'
    } })
    expect(generate(ast).code).toBe('const after = 1;')
  }
  finally {
    vi.doUnmock('@babel/generator')
    vi.doUnmock('@babel/traverse')
    vi.resetModules()
  }
})
