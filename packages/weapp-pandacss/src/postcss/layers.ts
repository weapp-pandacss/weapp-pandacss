import type { CascadeLayerDiagnostic, CascadeLayerDiagnosticCode, CascadeLayerSource } from '@weapp-tailwindcss/css-compat/diagnostics'
import type { Node, Plugin, Root } from 'postcss'
import { CascadeLayerError } from '@weapp-tailwindcss/css-compat/diagnostics'
import { compileCascadeLayers } from '@weapp-tailwindcss/css-compat/layers'
import selectorParser from 'postcss-selector-parser'

const pluginName = 'weapp-pandacss-ordered-layers'
const compatibilityCodes: Partial<Record<CascadeLayerDiagnosticCode, string>> = {
  LAYER_CONDITIONAL_ORDER: 'WP_LAYER_CONDITIONAL_ORDER',
  LAYER_SPECIFICITY: 'WP_LAYER_SPECIFICITY',
  LAYER_SELECTOR_UNKNOWN: 'WP_LAYER_SELECTOR_UNKNOWN',
}

function diagnosticText(diagnostic: CascadeLayerDiagnostic) {
  return `[${compatibilityCodes[diagnostic.code] ?? diagnostic.code}] ${diagnostic.message} ${diagnostic.suggestion}`
}

function sourceKey(source: CascadeLayerSource) {
  return JSON.stringify([source.file, source.line, source.column])
}

function sourceNodes(root: Root) {
  const nodes = new Map<string, Node>()
  root.walk((node) => {
    if (node.source?.start) {
      nodes.set(sourceKey({ file: node.source.input.file, line: node.source.start.line, column: node.source.start.column }), node)
    }
  })
  return (diagnostic: CascadeLayerDiagnostic) => nodes.get(sourceKey(diagnostic.source)) ?? root
}

// Panda's old polyfill leaves recognizable placeholders. Keep this adapter's
// migration guard: the shared compiler deliberately does not guess provenance.
function rejectPandaPolyfill(root: Root) {
  root.walkRules((rule) => {
    let selectors
    try {
      selectors = selectorParser().astSync(rule.selector)
    }
    catch {
      // The shared compiler reports malformed selectors with source metadata.
      return
    }
    selectors.walkPseudos((pseudo) => {
      if (pseudo.value === ':not' && pseudo.nodes.some(selector => selector.nodes.length === 1 && selector.nodes[0]!.type === 'id' && selector.nodes[0]!.value === '#')) {
        throw rule.error('Upstream cascade layer polyfill output has lost its layer information. Disable Panda polyfill and regenerate CSS, or explicitly select cascadeLayers.mode "legacy".')
      }
    })
  })
}

/** Share ordered compilation while retaining Panda's diagnostic compatibility. */
export function orderedLayersPlugin(onConflict: 'warning' | 'error'): Plugin {
  return {
    postcssPlugin: pluginName,
    OnceExit(root, { result }) {
      rejectPandaPolyfill(root)
      const diagnosticNode = sourceNodes(root)
      let compilation
      try {
        compilation = compileCascadeLayers(root, { mode: 'ordered', onConflict, inputStage: 'native' })
      }
      catch (error) {
        if (!(error instanceof CascadeLayerError)) {
          throw error
        }
        const diagnostic = error.diagnostics.find(diagnostic => diagnostic.severity === 'error')!
        throw Object.assign(diagnosticNode(diagnostic).error(error.diagnostics.map(diagnosticText).join('\n'), { plugin: pluginName }), {
          cause: error,
          code: diagnostic.code,
          diagnostic,
          diagnostics: error.diagnostics,
        })
      }
      for (const diagnostic of compilation.diagnostics) {
        const warning = result.warn(diagnosticText(diagnostic), { plugin: pluginName, node: diagnosticNode(diagnostic) })
        Object.assign(warning, { code: diagnostic.code, diagnostic })
      }
    },
  }
}
