import type { Plugin, PluginCreator } from 'postcss'
import type {
  Root,
  Selector,
} from 'postcss-selector-parser'
import type { IPostcssPluginOptions } from '@/types'
import type { Ref } from '@/utils'
import createCascadeLayersPlugin from '@csstools/postcss-cascade-layers'
import createIsPseudoClassPlugin from '@csstools/postcss-is-pseudo-class'
import { escape } from '@weapp-core/escape'
import selectorParser from 'postcss-selector-parser'
import valueParser from 'postcss-value-parser'
import { escapePostcssPlugin, wrapperPostcssPlugin } from '@/constants'
import { getPostcssPluginDefaults } from '@/defaults'
import { encodeClassName } from '@/runtime'
import { merge, normalizeString, ref } from '@/utils'

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
    selectors.walk((selector) => {
      if (selector.type === 'class') {
        if (optionsRef?.value.naming === 'legacy') {
          selector.value = escape(selector.value)
        }
      }
      // https://developer.mozilla.org/en-US/docs/Web/CSS/Adjacent_sibling_combinator
      if (selector.type === 'combinator') {
        // ' ', + , > , ~
        // has :not() and ~
        // General sibling combinator

        if (selector.value === '~' && selector.parent) {
          const idx = selector.parent.nodes.indexOf(selector)
          if (idx > -1) {
            const beforeNode = selector.parent.nodes[idx - 1]
            if (beforeNode && beforeNode.type !== 'class') {
              selector.value = '+'
            }
          }
        }
      }
      if (
        selector.type === 'universal'
        && selector.parent?.type === 'selector'
      ) {
        if (Array.isArray(sr.universal)) {
          const parent = selector.parent as Selector
          const idx = parent.nodes.indexOf(selector)
          if (idx > -1) {
            const rests = parent.nodes.slice(idx + 1)
            // root
            const root = parent.parent as Root | undefined
            if (root) {
              const pidx = root.nodes.indexOf(parent)
              if (pidx > -1) {
                root.nodes.splice(
                  pidx,
                  1,
                  ...sr.universal.map((x) => {
                    return slt({
                      nodes: [
                        tag({
                          value: x,
                        }),
                        ...rests,
                      ],
                      value: '',
                    })
                  }),
                )
              }
            }
          }
        }
        else {
          selector.value = sr.universal
        }
      }

      if (selector.type === 'pseudo' && selector.parent) {
        // where case
        if (selector.value === ':where' && selector.parent.parent) {
          // :root,:host
          const vals = selector.nodes.map(x => x.toString())
          vals.length === 2 && vals[0] === ':root' && vals[1] === ':host'
            ? (selector.parent.parent.nodes = [
                tag({
                  value: normalizeString(sr.root),
                }),
              ])
            : (selector.parent.parent.nodes = selector.nodes)
        }
        else if (selector.value === ':root' || selector.value === ':host') {
          selector.parent.nodes = [
            tag({
              value: normalizeString(sr.root),
            }),
          ]
        }
      }
    })
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
        Declaration(decl) {
          if (optionsRef?.value.disabled) {
            return
          }
          if (optionsRef?.value.naming === 'legacy') {
            decl.prop = escape(decl.prop)
          }
        },
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
      const marked = root as typeof root & { [namingMarker]?: string }
      const naming = optionsRef.value.naming
      const hasCssMarker = root.nodes.some(node => node.type === 'comment' && node.text === portableCssMarker)
      if (hasCssMarker) {
        marked[namingMarker] = 'portable'
      }
      if (marked[namingMarker]) {
        if (marked[namingMarker] !== naming) {
          throw root.error('Cannot mix portable and legacy weapp-pandacss naming in one stylesheet.')
        }
      }
      if (naming === 'portable') {
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
      }
      marked[namingMarker] = naming
      if (naming === 'portable' && !hasCssMarker) {
        // Persist the generation marker across parse/serialize boundaries too.
        root.prepend({ text: portableCssMarker })
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
