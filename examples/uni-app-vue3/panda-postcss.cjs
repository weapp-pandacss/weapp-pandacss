const path = require('node:path')
const postcss = require('postcss')
const adapter = require('weapp-pandacss/postcss')

// Tailwind owns the class names in its separate entry; Panda and authored CSS
// use portable naming. Each runtime must share its own stylesheet's contract.
module.exports = function pandaAdapter(options = {}) {
  const pandaProcessor = postcss([adapter(options)])
  const unitsProcessor = postcss([adapter({ ...options, imports: false, panda: false, adapter: false })])
  const resumeProcessor = postcss([{ postcssPlugin: 'example-resume-framework' }])
  return {
    postcssPlugin: 'example-panda-adapter',
    async Once(root, { result }) {
      const source = (result.opts.from || '').split('?')[0]
      const processor = path.basename(source) === 'tailwind.css' ? unitsProcessor : pandaProcessor
      const adapted = await processor.process(root, result.opts)
      result.messages.push(...adapted.messages)
      // Child processors finish traversal themselves. Restore the outer
      // framework's visitors so Uni can apply its final platform unit rules.
      resumeProcessor.process(root, result.opts).sync()
    },
  }
}
