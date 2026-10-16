import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import vm from 'node:vm'

type Handler = (...args: unknown[]) => unknown

export interface TaroHtmlElement {
  nodeName: string
  props: Record<string, unknown>
  className: string
  __handlers: Record<string, Handler[]>
  addEventListener: (type: string, handler: Handler) => void
  removeEventListener: (type: string, handler: Handler) => void
}

interface HydratedNode extends Record<string, unknown> {
  nn: string
  cl?: string
}

interface HookRegistry {
  hooks: unknown
  call: (name: string, ...args: unknown[]) => unknown
}

interface SharedModule extends Record<string, unknown> {
  TaroHooks: new (hooks: unknown) => HookRegistry
  hooks: HookRegistry
  getComponentsAlias: unknown
}

const requireExample = createRequire(new URL('../../../../examples/taro-app-vue3/package.json', import.meta.url))
const pluginRoot = path.dirname(requireExample.resolve('@tarojs/plugin-html/package.json'))
const runtimeRoot = path.dirname(requireExample.resolve('@tarojs/runtime/package.json'))
const shared = requireExample('@tarojs/shared') as SharedModule

function withoutModuleDeclarations(source: string) {
  return source.replace(/^import .*;\r?\n/gm, '').replace(/^export \{.*\};?\r?\n?/gm, '')
}

export function readHtmlRuntime() {
  return readFileSync(path.join(pluginRoot, 'dist/runtime.js'), 'utf8')
}

// Run the installed core hydrator, event target, helpers, and HTML hooks together.
// Only the DOM node and mini-program update queue are represented by a fixture.
export function createTaroHtmlRuntime(pluginSource = readHtmlRuntime()) {
  const hooks = new shared.TaroHooks(shared.hooks.hooks)
  const context = vm.createContext({
    ...shared,
    hooks,
    getComponentsAlias$1: shared.getComponentsAlias,
    process: { env: { NODE_ENV: 'production', TARO_ENV: 'weapp' } },
  })
  function evaluate(source: string, exports: string[]) {
    return vm.runInContext(`(() => {\n${withoutModuleDeclarations(source)}\nreturn { ${exports.join(', ')} };\n})()`, context)
  }
  function loadCore(file: string, exports: string[]) {
    const result = evaluate(readFileSync(path.join(runtimeRoot, file), 'utf8'), exports)
    Object.assign(context, result)
    return result
  }
  loadCore('dist/constants/index.js', ['VIEW', 'PURE_VIEW', 'CLICK_VIEW', 'CLASS', 'STYLE', 'ID', 'CATCHMOVE', 'COMPILE_MODE', 'CATCH_VIEW', 'COMMENT', 'UID', 'ROOT_STR'])
  const utils = loadCore('dist/utils/index.js', ['getComponentsAlias', 'isText', 'isComment', 'isHasExtractProp']) as {
    getComponentsAlias: () => Record<string, { _num: string }>
  }
  const { TaroEventTarget } = loadCore('dist/dom/event-target.js', ['TaroEventTarget']) as {
    TaroEventTarget: new () => TaroHtmlElement
  }

  // The plugin's build hook injects these default tag arrays into runtime.js.
  // Read its authored defaults so this regression is independent of prior builds.
  const pluginIndex = readFileSync(path.join(pluginRoot, 'dist/index.js'), 'utf8')
  for (const name of ['inlineElements', 'blockElements']) {
    const declaration = pluginIndex.match(new RegExp(`const ${name} = (\\[[^\\n]+\\]);`))
    if (!declaration) {
      throw new Error(`Missing Taro HTML ${name} defaults`)
    }
    pluginSource = pluginSource.replace(new RegExp(`const ${name} = new Set\\([^\\n]+\\);`), `const ${name} = new Set(${declaration[1]});`)
  }
  evaluate(pluginSource, [])
  const { hydrate } = loadCore('dist/hydrate.js', ['hydrate']) as {
    hydrate: (node: TaroHtmlElement) => HydratedNode
  }
  const aliases = utils.getComponentsAlias()

  return {
    aliases,
    hydrate,
    createElement(nodeName = 'view', props: Record<string, unknown> = {}) {
      return Object.assign(new TaroEventTarget(), {
        nodeName,
        props,
        nodeType: 1,
        sid: 'scenario',
        uid: 'scenario',
        _path: 'root.cn[0]',
        childNodes: [],
        className: 'scenario-generated',
        cssText: '',
        style: { cssText: '' },
        enqueueUpdate() {},
      })
    },
    updateClass(node: TaroHtmlElement, value: string) {
      const payload = { path: 'root.cn[0].cl', value }
      node.className = value
      hooks.call('modifySetAttrPayload', node, 'cl', payload, aliases)
      return payload
    },
  }
}
