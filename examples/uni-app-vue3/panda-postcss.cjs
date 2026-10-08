const path = require('node:path')
const postcss = require('postcss')
const adapter = require('weapp-pandacss/postcss')

// Tailwind owns the class names in its separate entry; Panda and authored CSS
// use portable naming. Each runtime must share its own stylesheet's contract.
module.exports = function pandaAdapter(options) {
  const processor = postcss([adapter(options)])
  return {
    postcssPlugin: 'example-panda-adapter',
    async Once(root, { result }) {
      const source = (result.opts.from || '').split('?')[0]
      if (path.basename(source) === 'tailwind.css') {
        return
      }
      const adapted = await processor.process(root, result.opts)
      result.messages.push(...adapted.messages)
    },
  }
}
