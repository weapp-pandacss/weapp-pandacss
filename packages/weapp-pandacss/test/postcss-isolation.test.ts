import { createRequire } from 'node:module'
import postcss from 'postcss'

const require = createRequire(import.meta.url)
const pandaAdapter = require('../../../examples/uni-app-vue3/panda-postcss.cjs')

it.each(['weapp', 'web'])('keeps the Uni-app Tailwind runtime naming separate from Panda for %s', async (target) => {
  const source = '.hover\\:bg-blue-600:hover { color: red }'
  const plugins = [pandaAdapter({ target })]
  const tailwind = await postcss(plugins).process(source, { from: '/src/tailwind.css' })
  expect(tailwind.css).toBe(source)
  const panda = await postcss(plugins).process(source, { from: '/src/app.css' })
  expect(panda.css).toContain('.hover_wp_3a_bg-blue-600:hover')
})
