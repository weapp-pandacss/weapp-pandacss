import type { Plugin, PluginCreator } from 'postcss'
import type {
  Node,
  Selector,
} from 'postcss-selector-parser'
import type { IPostcssPluginOptions } from '@/types'
import type { Ref } from '@/utils'
import createCascadeLayersPlugin from '@csstools/postcss-cascade-layers'
import createIsPseudoClassPlugin from '@csstools/postcss-is-pseudo-class'
import selectorParser from 'postcss-selector-parser'
import valueParser from 'postcss-value-parser'
import { escapePostcssPlugin, wrapperPostcssPlugin } from '@/constants'
import { getPostcssPluginDefaults } from '@/defaults'
import { encodeClassName } from '@/runtime'
import { merge, ref } from '@/utils'

// postcss-selector-parser is a CommonJS package. Access its node factories
// through the default export so the ESM build does not rely on synthetic named
// exports that Node cannot provide for CommonJS modules.
const { selector: slt, tag } = selectorParser

export function useOptions(options?: IPostcssPluginOptions) {
  const optionsRef = ref(
    merge.recursive(
      true,
      getPostcssPluginDefaults(),
      options,
    ) as Required<IPostcssPluginOptions>,
  )

  function mergeOptions(options?: IPostcssPluginOptions) {
    optionsRef.value = merge.recursive(true, optionsRef.value, options)
  }

  return {
    optionsRef,
    mergeOptions,
  }
}

export const innerPlugin: PluginCreator<
  Ref<Required<IPostcssPluginOptions>>
> = (optionsRef) => {
  function getSelectorReplacement() {
    return optionsRef?.value.selectorReplacement as Required<
      Required<IPostcssPluginOptions>['selectorReplacement']
    >
  }
  function getRemoveNegationPseudoClass() {
    return optionsRef?.value.removeNegationPseudoClass
  }

  const utilitiesTransformer = selectorParser((selectors) => {
    const sr = getSelectorReplacement()
    function expandSelector(selector: Selector): Selector[] {
      let alternatives: Node[][] = [[]]
      let previous: Node | undefined
      for (const node of selector.nodes) {
        let replacements: Node[][]
        if (node.type === 'universal') {
          const values = Array.isArray(sr.universal) ? sr.universal : [sr.universal]
          replacements = values.map(value => [tag({ value })])
        }
        else if (node.type === 'pseudo' && (node.value === ':root' || node.value === ':host')) {
          const values = Array.isArray(sr.root) ? sr.root : [sr.root]
          replacements = values.map(value => [tag({ value })])
        }
        else if (node.type === 'pseudo' && node.value === ':where') {
          const values = node.nodes.map(x => x.toString())
          if (values.length === 2 && values[0] === ':root' && values[1] === ':host') {
            const roots = Array.isArray(sr.root) ? sr.root : [sr.root]
            replacements = roots.map(value => [tag({ value })])
          }
          else {
            replacements = node.nodes.flatMap(child => expandSelector(child).map(x => x.nodes))
          }
        }
        else {
          const copy = node.clone()
          if (copy.type === 'pseudo' && copy.nodes.length > 0) {
            const children = copy.nodes.flatMap(expandSelector)
            copy.removeAll()
            for (const child of children) {
              copy.append(child)
            }
          }
          if (copy.type === 'combinator' && copy.value === '~' && previous && previous.type !== 'class') {
            copy.value = '+'
          }
          replacements = [[copy]]
        }
        // Expand at the node's position, preserving both sides. Never mutate
        // the container being traversed or share nodes between alternatives.
        alternatives = alternatives.flatMap(prefix => replacements.map(nodes => [...prefix, ...nodes]))
        previous = node
      }
      return alternatives.map(nodes => slt({ nodes: nodes.map(node => node.clone()), value: '' }))
    }
    const expanded = selectors.nodes.flatMap(expandSelector)
    selectors.removeAll()
    for (const selector of expanded) {
      selectors.append(selector)
    }
  })

  const atLayerTransformer = selectorParser((selectors) => {
    const removeNegationPseudoClass = getRemoveNegationPseudoClass()
    const sr = getSelectorReplacement()
    selectors.walk((selector) => {
      if (selector.type === 'pseudo' && selector.value === ':not') {
        for (const x of selector.nodes) {
          if (
            x.nodes.length === 1
            && x.nodes[0]?.type === 'id'
            && x.nodes[0]?.value === '#'
          ) {
            if (removeNegationPseudoClass) {
              selector.remove()
            }
            else {
              x.nodes = [
                tag({
                  value: sr.cascadeLayers,
                }),
              ]
            }
          }
        }
      }
    })
  })

  return {
    postcssPlugin: escapePostcssPlugin,
    prepare() {
      if (optionsRef?.value.disabled) {
        return {}
      }
      return {
        Rule(rule) {
          if (optionsRef?.value.disabled) {
            return
          }
          utilitiesTransformer.transformSync(rule, {
            lossless: false,
            updateSelector: true,
          })
        },
        OnceExit(root) {
          if (optionsRef?.value.disabled) {
            return
          }
          root.walkRules(/:not\(#\\#\)/, (rule) => {
            atLayerTransformer.transformSync(rule, {
              lossless: false,
              updateSelector: true,
            })
          })
        },
      }
    },
  }
}

innerPlugin.postcss = true

// https://github.com/csstools/postcss-plugins/blob/main/plugins/postcss-cascade-layers/src/index.ts
// https://github.com/csstools/postcss-plugins/blob/main/plugins/postcss-cascade-layers/src/adjust-selector-specificity.ts
// ':not(#\\#)' raw: :not(#\\\\#)
const namingMarker = Symbol.for('weapp-pandacss.postcss.naming')
const portableCssMarker = '! weapp-pandacss:portable-v1'

export const creator: PluginCreator<IPostcssPluginOptions> = (options) => {
  const { optionsRef } = useOptions(options)
  if (optionsRef.value.disabled) {
    return { postcssPlugin: wrapperPostcssPlugin }
  }
  const namingPlugin: Plugin = {
    postcssPlugin: 'weapp-pandacss-portable-naming',
    Once(root) {
      const marked = root as typeof root & { [namingMarker]?: boolean }
      const hasCssMarker = root.nodes.some(node => node.type === 'comment' && node.text === portableCssMarker)
      if (hasCssMarker) {
        marked[namingMarker] = true
      }
      if (!marked[namingMarker]) {
        const parser = selectorParser(selectors => selectors.walkClasses((node) => {
          node.value = encodeClassName(node.value)
        }))
        root.walkRules((rule) => {
          parser.transformSync(rule, { lossless: false, updateSelector: true })
        })
      }
      if (optionsRef.value.target === 'weapp') {
        function assertVariable(name: string, node: { error: (message: string) => Error }) {
          if (!/^--[\w-]+$/.test(name)) {
            throw node.error(`Unsupported mini-program CSS variable "${name}". Use an ASCII identifier or a Panda token with hash.cssVar enabled.`)
          }
        }
        root.walkDecls((decl) => {
          if (decl.prop.startsWith('--')) {
            assertVariable(decl.prop, decl)
          }
          valueParser(decl.value).walk((node) => {
            if (node.type === 'function' && node.value.toLowerCase() === 'var') {
              const argument = node.nodes.find(part => part.type !== 'space' && part.type !== 'comment')
              if (argument?.type === 'word') {
                assertVariable(argument.value, decl)
              }
            }
          })
        })
        root.walkAtRules('property', rule => assertVariable(rule.params.trim(), rule))
      }
      marked[namingMarker] = true
      if (!hasCssMarker) {
        // Persist the generation marker across parse/serialize boundaries too.
        root.prepend({ text: portableCssMarker, raws: { left: '', right: ' ' } })
      }
    },
  }
  if (optionsRef.value.target === 'web') {
    return { postcssPlugin: wrapperPostcssPlugin, plugins: [namingPlugin] }
  }
  // cascadeLayersPluginOptions 和 isPseudoClassPluginOptions
  const cascadeLayersPlugin = createCascadeLayersPlugin(
    optionsRef?.value.cascadeLayersPluginOptions,
  ) as Plugin
  const isPseudoClassPlugin = createIsPseudoClassPlugin(
    optionsRef?.value.isPseudoClassPluginOptions,
  ) as Plugin

  return {
    postcssPlugin: wrapperPostcssPlugin,
    plugins: [
      namingPlugin,
      cascadeLayersPlugin,
      isPseudoClassPlugin,
      innerPlugin(optionsRef),
    ],
  }
}

creator.postcss = true
