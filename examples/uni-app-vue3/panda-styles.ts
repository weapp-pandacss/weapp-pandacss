import type { Warning } from 'postcss'
import type { Plugin } from 'vite'
import fs from 'node:fs/promises'
import panda from '@pandacss/dev/postcss'
import postcss from 'postcss'
import postcssImport from 'postcss-import'
import pandaAdapter from './panda-postcss.cjs'

const virtualId = '\0virtual:panda-styles.css'

export function createPandaStyles({ cwd, entry, target }: { cwd: string, entry: string, target: 'web' | 'weapp' }): Plugin {
  // Tailwind's Vite generator removes layer-order-only inputs. Expand Panda's
  // independent entry first, using its physical path for import resolution.
  // Mini-program layers must be compiled before Tailwind records this source;
  // Web stays native here and uses the framework's PostCSS adapter instead.
  const processor = postcss([
    postcssImport(),
    panda({ cwd }),
    ...(target === 'weapp' ? [pandaAdapter({ target })] : []),
  ])
  return {
    name: 'example-panda-styles',
    enforce: 'pre',
    resolveId(id) {
      if (id === 'virtual:panda-styles.css') {
        return virtualId
      }
    },
    async load(id) {
      if (id !== virtualId) {
        return
      }
      this.addWatchFile(entry)
      const code = await fs.readFile(entry, 'utf8')
      const result = await processor.process(code, { from: entry, map: { inline: false, annotation: false } })
      for (const message of result.messages) {
        if (message.type === 'dependency') {
          this.addWatchFile(message['file'])
        }
        else if (message.type === 'dir-dependency') {
          this.addWatchFile(message['dir'])
        }
        else if (message.type === 'warning') {
          // Early compilation consumed the layers, so later PostCSS cannot
          // recreate these diagnostics. Forward them with the imported source.
          const warning = message as Warning
          const file = warning.node?.source?.input.file
          this.warn({
            message: warning.text,
            plugin: warning.plugin,
            ...(file && warning.line ? { loc: { file, line: warning.line, column: Math.max(0, (warning.column ?? 1) - 1) } } : {}),
          })
        }
      }
      const map = result.map?.toJSON()
      return { code: result.css, map: map ? { ...map, version: Number(map.version) } : null }
    },
  }
}
