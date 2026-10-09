import type { Specificity } from '@csstools/selector-specificity'
import type { AtRule, ChildNode, Container, Declaration, Plugin, Result, Root, Rule } from 'postcss'
import { compare, selectorSpecificity } from '@csstools/selector-specificity'
import propertyData from 'mdn-data/css/properties.json' with { type: 'json' }
import selectorParser from 'postcss-selector-parser'
import valueParser from 'postcss-value-parser'

interface Layer {
  label: string
  children: Map<string | symbol, Layer>
  normal: ChildNode[]
  important: ChildNode[]
}

interface Style {
  rule: Rule
  layer: Layer
  specificity: Specificity[]
  declarations: Declaration[]
}

const atomic = /^(?:(?:-\w+-)?keyframes|font-face|property|counter-style|font-feature-values|page)$/i
const groups = new Set(['media', 'supports', 'container', 'document', 'scope', 'starting-style'])
const knownFunctions = new Set([':is', ':where', ':not', ':has', ':nth-child', ':nth-last-child'])
// These shorthands also reset properties absent from MDN's computed lists.
const resetShorthands = new Set(['border', 'font', 'mask', 'animation'])
const properties = propertyData as Record<string, { computed: string | string[] }>

function createLayer(label: string): Layer {
  return { label, children: new Map(), normal: [], important: [] }
}

function isGroup(node: AtRule) {
  return groups.has(node.name.toLowerCase()) || (!atomic.test(node.name) && node.nodes!.some(child => child.type === 'rule' || child.type === 'atrule'))
}

// MDN's computed-property lists recursively describe shorthand constituents.
// Unknown properties and logical/physical aliases are deliberately conservative.
function affectedProperties(prop: string): string[] {
  if (prop.startsWith('--')) {
    return [prop]
  }
  const name = prop.toLowerCase().replace(/^-(?:webkit|moz|ms|o)-/, '')
  if (name === 'all' || resetShorthands.has(name) || !properties[name]) {
    return ['*']
  }
  const computed = properties[name].computed
  if (Array.isArray(computed)) {
    return [...new Set(computed.flatMap(affectedProperties))]
  }
  if (/^(?:margin|padding|inset|border)-(?:block|inline)/.test(name)) {
    return ['*']
  }
  return [name]
}

function orderedLayers(rootLayer: Layer): Layer[] {
  return [...rootLayer.children.values()].flatMap(orderedLayers).concat(rootLayer)
}

function wrap(node: ChildNode, wrappers: AtRule[]): ChildNode {
  let output = node
  for (const wrapper of wrappers.toReversed()) {
    // Append through PostCSS so child.parent points at the cloned wrapper.
    // Supplying nodes as clone overrides leaves detached children downstream.
    const outer = wrapper.clone({ nodes: [] })
    outer.append(output)
    output = outer
  }
  return output
}

function compile(root: Root, result: Result, onConflict: 'warning' | 'error') {
  function diagnostic(node: ChildNode, code: string, message: string) {
    const text = `[${code}] ${message}`
    if (onConflict === 'error') {
      throw node.error(text)
    }
    node.warn(result, text)
  }

  let hasLayers = false
  root.walkAtRules((node) => {
    if (node.name.toLowerCase() === 'layer') {
      hasLayers = true
      let parent = node.parent
      while (parent && parent.type !== 'root') {
        if (parent.type === 'rule' || (parent.type === 'atrule' && atomic.test(parent.name))) {
          throw node.error('Expand CSS nesting before weapp-pandacss; @layer must be outside style rules and descriptor at-rules.')
        }
        parent = parent.parent
      }
    }
    if (node.name.toLowerCase() === 'import') {
      valueParser(node.params).walk((part) => {
        if ((part.type === 'function' || part.type === 'word') && part.value.toLowerCase() === 'layer') {
          throw node.error('Inline @import with layer using an import processor before weapp-pandacss; unresolved layer imports cannot be ordered.')
        }
      })
    }
  })
  root.walkDecls((node) => {
    valueParser(node.value).walk((part) => {
      if (part.type === 'word' && part.value.toLowerCase() === 'revert-layer') {
        throw node.error('revert-layer cannot be compiled to WXSS layer order. Replace it with an explicit value or use native layers on Web.')
      }
    })
  })
  root.walkRules((rule) => {
    let parent = rule.parent
    while (parent && parent.type !== 'root') {
      if (parent.type === 'rule') {
        throw rule.error('Expand CSS nesting before weapp-pandacss; nested style rules cannot be ordered.')
      }
      parent = parent.parent
    }
    const ast = selectorParser().astSync(rule.selector)
    ast.walkNesting(() => {
      throw rule.error('Expand CSS nesting before weapp-pandacss; nesting selectors cannot be ordered.')
    })
    ast.walkPseudos((pseudo) => {
      if (pseudo.value === ':not' && pseudo.nodes.some(selector => selector.nodes.length === 1 && selector.nodes[0]!.type === 'id' && selector.nodes[0]!.value === '#')) {
        throw rule.error('Upstream cascade layer polyfill output has lost its layer information. Disable Panda polyfill and regenerate CSS, or explicitly select cascadeLayers.mode "legacy".')
      }
    })
  })
  if (!hasLayers) {
    return
  }

  const rootLayer = createLayer('<unlayered>')
  const styles: Style[] = []
  const prologue: ChildNode[] = []
  let anonymous = 0

  function register(node: AtRule, parent: Layer, conditional: boolean): Layer[] {
    if (!node.params.trim()) {
      if (!node.nodes) {
        throw node.error('An anonymous @layer must have a block.')
      }
      const layer = createLayer(`${parent.label}.<anonymous:${++anonymous}>`)
      parent.children.set(Symbol(layer.label), layer)
      if (conditional) {
        diagnostic(node, 'WP_LAYER_CONDITIONAL_ORDER', 'An anonymous layer is first registered inside a condition; its order can vary between environments.')
      }
      return [layer]
    }
    const names = selectorParser().astSync(node.params)
    if (node.nodes && names.nodes.length !== 1) {
      throw node.error('A @layer block must have exactly one layer name.')
    }
    let introduced = false
    const layers = names.nodes.map((name) => {
      if (name.nodes[0]?.type !== 'tag' || name.nodes.some(part => part.type !== 'tag' && part.type !== 'class')) {
        throw node.error('Invalid @layer name. Use a CSS identifier or a dotted layer path.')
      }
      let layer = parent
      for (const part of name.nodes) {
        const key = part.value!
        let child = layer.children.get(key)
        if (!child) {
          child = createLayer(`${layer.label}.${key}`)
          layer.children.set(key, child)
          introduced = true
        }
        layer = child
      }
      return layer
    })
    if (introduced && conditional) {
      diagnostic(node, 'WP_LAYER_CONDITIONAL_ORDER', `Layer "${node.params}" is first registered inside a condition. Declare its order outside conditional rules first.`)
    }
    return layers
  }

  function visit(container: Container, layer: Layer, wrappers: AtRule[]) {
    for (const node of container.nodes!) {
      if (node.type === 'atrule' && node.name.toLowerCase() === 'layer') {
        const layers = register(node, layer, wrappers.length > 0)
        if (node.nodes) {
          visit(node, layers[0]!, wrappers)
        }
      }
      else if (node.type === 'atrule' && node.nodes && isGroup(node)) {
        visit(node, layer, [...wrappers, node])
      }
      else if (node.type === 'rule') {
        const normal = node.clone()
        const important = node.clone()
        normal.walkDecls((decl) => {
          if (decl.important) {
            decl.remove()
          }
        })
        important.removeAll()
        for (const decl of node.nodes) {
          if (decl.type === 'decl' && decl.important) {
            important.append(decl.clone())
          }
        }
        if (normal.nodes.length > 0 || node.nodes.length === 0) {
          layer.normal.push(wrap(normal, wrappers))
        }
        if (important.nodes.length > 0) {
          layer.important.push(wrap(important, wrappers))
        }
        const ast = selectorParser().astSync(node.selector)
        ast.walkPseudos((pseudo) => {
          if (pseudo.nodes.length > 0 && !knownFunctions.has(pseudo.value.toLowerCase())) {
            diagnostic(node, 'WP_LAYER_SELECTOR_UNKNOWN', `Cannot reliably analyze functional selector "${pseudo}" in layer "${layer.label}".`)
          }
        })
        styles.push({ rule: node, layer, specificity: ast.nodes.map(selector => selectorSpecificity(selector)), declarations: node.nodes.filter((part): part is Declaration => part.type === 'decl') })
      }
      else if (node.type === 'decl') {
        throw node.error('Expand CSS nesting before weapp-pandacss; declarations must belong to a style rule or descriptor at-rule.')
      }
      else {
        const copy = wrap(node.clone(), wrappers)
        if (node.type === 'atrule' && /^(?:charset|import|namespace)$/i.test(node.name)) {
          if (layer !== rootLayer || wrappers.length > 0) {
            throw node.error(`@${node.name} cannot appear inside a layer or condition.`)
          }
          prologue.push(copy)
        }
        else {
          layer.normal.push(copy)
        }
      }
    }
  }
  visit(root, rootLayer, [])
  const layers = orderedLayers(rootLayer)
  const rank = new Map(layers.map((layer, index) => [layer, index]))

  for (const important of [false, true]) {
    const index = new Map<string, Style[]>()
    const sorted = styles.toSorted((a, b) => (rank.get(a.layer)! - rank.get(b.layer)!) * (important ? -1 : 1))
    for (const style of sorted) {
      const props = new Set(style.declarations.filter(decl => Boolean(decl.important) === important).flatMap(decl => affectedProperties(decl.prop)))
      const reported = new Set<Style>()
      for (const prop of props) {
        const candidates = prop === '*'
          ? [...index.entries()].filter(([key]) => !key.startsWith('--') && key !== 'direction' && key !== 'unicode-bidi').flatMap(([, values]) => values)
          : [...(index.get(prop) ?? []), ...(!prop.startsWith('--') && prop !== 'direction' && prop !== 'unicode-bidi' ? index.get('*') ?? [] : [])]
        for (const lower of candidates) {
          if (lower.layer !== style.layer && !reported.has(lower) && lower.specificity.some(a => style.specificity.some(b => compare(a, b) > 0))) {
            diagnostic(style.rule, 'WP_LAYER_SPECIFICITY', `Potential ${important ? 'important' : 'normal'} specificity conflict for "${prop}": lower-priority layer "${lower.layer.label}" selector "${lower.rule.selector}" can override layer "${style.layer.label}" selector "${style.rule.selector}" after flattening. Layer order does not override selector specificity in WXSS.`)
            reported.add(lower)
          }
        }
        const existing = index.get(prop) ?? []
        existing.push(style)
        index.set(prop, existing)
      }
    }
  }

  root.removeAll()
  root.append(...prologue, ...layers.flatMap(layer => layer.normal), ...layers.toReversed().flatMap(layer => layer.important))
}

/** Compile layer order, without manufacturing selector specificity. */
export function orderedLayersPlugin(onConflict: 'warning' | 'error'): Plugin {
  return {
    postcssPlugin: 'weapp-pandacss-ordered-layers',
    OnceExit(root, { result }) {
      compile(root, result, onConflict)
    },
  }
}
