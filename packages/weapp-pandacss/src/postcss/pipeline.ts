import type { Plugin, Result, Root } from 'postcss'
import type { IPostcssPluginOptions, PandaPostcssOptions, PostcssImportOptions } from '@/types'
import type { Ref } from '@/utils'
import { Buffer } from 'node:buffer'
import { readFile } from 'node:fs/promises'
import { dirname, extname, isAbsolute, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import postcss from 'postcss'
import postcssImport from 'postcss-import'
import { namingMarker, portableCssMarker } from '@/constants'

const pluginName = 'weapp-pandacss-pipeline'
const preprocessorExtension = /\.(?:scss|sass|less|styl|stylus)$/i

/** Resolve physical stylesheet names without treating virtual IDs as files. */
export function resolveInputFile(value?: string): string | undefined {
  if (!value || value.includes('\0') || /(?:^|[/\\])(?:virtual:|<input\b|@id[/\\]|__x00__)/i.test(value)) {
    return
  }
  if (value.startsWith('file:')) {
    try {
      return fileURLToPath(new URL(value))
    }
    catch {
      return
    }
  }
  if (/^[a-z][\w+.-]*:/i.test(value) && !isAbsolute(value)) {
    return
  }
  return resolve(value.split(/[?#]/, 1)[0]!)
}

/** Only CONFIG_NOT_FOUND permits inferred discovery to try another root. */
async function findInferredConfig(cwd: string): Promise<string | undefined> {
  const { findConfig } = await import('@pandacss/dev/node')
  try {
    return findConfig({ cwd })
  }
  catch (error) {
    if ((error as { code?: string }).code !== 'ERR_PANDA_CONFIG_NOT_FOUND') {
      throw error
    }
  }
}

export async function resolvePandaOptions(options: PandaPostcssOptions, from: string): Promise<PandaPostcssOptions | undefined> {
  if (options.configPath !== undefined || options.cwd !== undefined) {
    // Explicit roots are intentional: let Panda report missing/invalid config.
    return { ...options, cwd: resolve(options.cwd ?? process.cwd()) }
  }
  const nearby = await findInferredConfig(dirname(from))
  const configPath = nearby ?? await findInferredConfig(process.cwd())
  if (configPath) {
    return { ...options, configPath, cwd: dirname(configPath) }
  }
}

function assertPluginOrder(result: Result, options: Required<IPostcssPluginOptions>, self: Plugin) {
  const plugins = result.processor.plugins
  const position = plugins.indexOf(self)
  for (const [index, plugin] of plugins.entries()) {
    const name = typeof plugin === 'object' ? plugin.postcssPlugin : undefined
    if (name === 'pandacss') {
      if (options.panda !== false) {
        throw result.root.error('Panda is registered twice. Remove the official Panda PostCSS plugin, or set panda: false in weapp-pandacss/postcss.', { plugin: pluginName })
      }
      if (options.adapter && index > position) {
        throw result.root.error('The official Panda PostCSS plugin must run before weapp-pandacss/postcss. Move it earlier, or enable the built-in panda stage.', { plugin: pluginName })
      }
      const imports = result.root.nodes.some(node => node.type === 'atrule' && node.name === 'import')
      const earlierImporter = plugins.slice(0, index).some(candidate => typeof candidate === 'object' && candidate.postcssPlugin === 'postcss-import')
      if (index < position && imports && !earlierImporter && (options.imports !== false || options.adapter)) {
        throw result.root.error('CSS imports must be expanded before the external Panda PostCSS plugin. Place postcss-import before Panda and set imports: false, or remove the external Panda plugin and enable the built-in panda stage.', { plugin: pluginName })
      }
    }
    // Taro appends its own importer after project plugins. It is harmless
    // when our importer already expanded the graph; external-only imports
    // must still precede both generation and adaptation.
    if (name === 'postcss-import' && index > position && options.imports === false && (options.panda !== false || options.adapter)) {
      throw result.root.error('postcss-import must run before Panda and the adapter. Remove the later importer and use the built-in imports stage, or move it earlier and set imports: false.', { plugin: pluginName })
    }
  }
}

function assertImportContext(root: Root, options: PostcssImportOptions, uri: string, from?: string) {
  if (from || options.root !== undefined || isAbsolute(uri) || /^(?:[a-z][\w+.-]*:|\/\/)/i.test(uri)) {
    return
  }
  const source = root.nodes.find(node => node.type === 'atrule' && node.name === 'import' && node.params.includes(uri)) ?? root
  throw source.error('Relative CSS imports require a physical process({ from }) stylesheet or imports.root. Virtual IDs and string-only inputs do not provide a directory.', { plugin: pluginName })
}

function createImporter(root: Root, options: PostcssImportOptions, from?: string): Plugin {
  return postcssImport({
    ...options,
    filter(uri) {
      // Let the native importer decide which URLs are processable, and invoke
      // the caller's filter exactly once, including in nested import graphs.
      if (options.filter?.(uri) === false) {
        return false
      }
      assertImportContext(root, options, uri, from)
      return true
    },
    load: options.load ?? (async (filename) => {
      if (preprocessorExtension.test(filename)) {
        throw root.error(`Cannot import raw preprocessor stylesheet "${filename}". Compile Sass/Less/Stylus through your framework first, then pass its CSS output to weapp-pandacss/postcss; a custom imports.load may provide compiled CSS.`, { plugin: pluginName })
      }
      // Match postcss-import's supported CSS data URLs while reading physical
      // files afresh on every process, so watch builds never reuse stale text.
      if (/^data:text\/css(?:;(?:base64|plain))?,/i.test(filename)) {
        const comma = filename.indexOf(',')
        const content = filename.slice(comma + 1)
        return /;base64,/i.test(filename)
          ? Buffer.from(content, 'base64').toString()
          : decodeURIComponent(content)
      }
      return readFile(filename, 'utf8')
    }),
  }) as Plugin
}

async function runStages(root: Root, result: Result, stages: Plugin[], from?: string) {
  let stageResult!: Result
  const capture: Plugin = {
    postcssPlugin: 'weapp-pandacss-stage-result',
    prepare(value) {
      stageResult = value
      return {}
    },
  }
  try {
    // Child processors run the real lifecycle on the same AST. The outer
    // processor owns the final map; sources and every stage message survive.
    // annotation:false is essential: even map:false removes sourceMappingURL
    // comments while stringifying. Discard the child map and preserve the AST
    // for the outer processor's final map and annotation policy.
    const stageOptions = { ...result.opts, from, map: { annotation: false, inline: false, sourcesContent: false }, css: undefined }
    await postcss([capture, ...stages]).process(root, stageOptions)
  }
  finally {
    result.messages.push(...stageResult.messages)
  }
}

export function pipelinePlugin(optionsRef: Ref<Required<IPostcssPluginOptions>>): Plugin {
  const plugin: Plugin = {
    postcssPlugin: pluginName,
    prepare(result) {
      // PostCSS calls prepare for every plugin before any Once hook. Invalid
      // external registrations therefore fail before either Panda can run.
      assertPluginOrder(result, optionsRef.value, plugin)
      return {
        Once(root) {
          const options = optionsRef.value
          // A previously adapted entry is an output artifact, not a fresh
          // Panda source. Capture this before imports can introduce their own
          // markers, and mark existing rules to survive compiler AST clones.
          const portable = root.nodes.some(node => node.type === 'comment' && node.text === portableCssMarker)
          if (portable) {
            root.walkRules((rule) => {
              (rule as typeof rule & { [namingMarker]?: boolean })[namingMarker] = true
            })
          }
          const from = resolveInputFile(result.opts.from) ?? resolveInputFile(root.source?.input.file)
          const input = root.source?.input
          if (input?.file) {
            // Import resolution uses Input.file rather than result.opts.from.
            // Preserve virtual source names as IDs for diagnostics/maps only.
            if (from) {
              input.file = from
            }
            else {
              input.id = input.file
              delete input.file
            }
          }
          const stages: Plugin[] = []
          if (options.imports !== false) {
            stages.push(createImporter(root, typeof options.imports === 'object' ? options.imports : {}, from))
          }
          // Panda's own entry guard requires a real .css input. Do not invent
          // a filename for strings or rewrite a framework's preprocessor file.
          if (options.panda !== false && !portable && from && extname(from) === '.css') {
            stages.push({
              postcssPlugin: 'weapp-pandacss-panda',
              async Once(cssRoot) {
                if (!cssRoot.toString().includes('@layer')) {
                  return
                }
                const pandaOptions = await resolvePandaOptions(typeof options.panda === 'object' ? options.panda : {}, from)
                if (pandaOptions) {
                  const { default: panda } = await import('@pandacss/dev/postcss')
                  await runStages(cssRoot, result, [panda(pandaOptions) as Plugin], from)
                }
              },
            })
          }
          if (stages.length) {
            return runStages(root, result, stages, from)
          }
        },
      }
    },
  }
  return plugin
}
