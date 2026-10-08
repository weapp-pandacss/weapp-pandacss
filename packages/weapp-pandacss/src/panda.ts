import type { PandaPlugin } from '@pandacss/types'
import { transformArtifacts } from './panda/transform'
import { getPandaVersion } from './panda/version'
import { encodeClassName } from './runtime'

// Panda 2.1.2 can emit ambiguous hexadecimal CSS escapes for numeric heads.
// Canonicalize configured identifiers before that escape step; the final runtime
// and CSS encoding then treat the canonical identifier as their shared input.
function normalizeClassIdentifier(value: string) {
  return /^[0-9-]/.test(value) || value.includes('_wp_') ? encodeClassName(value) : value
}

function normalizeRecipeNames<T extends { className?: string }>(recipes: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.entries(recipes).map(([name, recipe]) => [
    name,
    recipe.className ? { ...recipe, className: normalizeClassIdentifier(recipe.className) } : recipe,
  ]))
}

function normalizeTheme<T extends {
  recipes?: Record<string, { className?: string }>
  slotRecipes?: Record<string, { className?: string }>
}>(theme: T): T {
  return {
    ...theme,
    ...(theme.recipes ? { recipes: normalizeRecipeNames(theme.recipes) } : {}),
    ...(theme.slotRecipes ? { slotRecipes: normalizeRecipeNames(theme.slotRecipes) } : {}),
  }
}

/** Panda 2.1.2 generation plugin. CSS must also pass through weapp-pandacss/postcss. */
export function weappPanda(): PandaPlugin {
  const version = getPandaVersion()
  if (version !== '2.1.2') {
    throw new Error(`weappPanda requires Panda CSS 2.1.2; found ${version ?? 'no installed Panda'}.`)
  }
  return {
    name: 'weapp-pandacss',
    hooks: {
      'config:resolved': ({ config }) => {
        const className = typeof config.hash === 'boolean' ? config.hash : config.hash?.className ?? false
        const resolved = { ...config, hash: { className, cssVar: true } }
        if (typeof config.prefix === 'string') {
          resolved.prefix = { className: normalizeClassIdentifier(config.prefix), cssVar: encodeClassName(config.prefix) }
        }
        else if (config.prefix) {
          resolved.prefix = { ...config.prefix }
          if (config.prefix.className) {
            resolved.prefix.className = normalizeClassIdentifier(config.prefix.className)
          }
          if (config.prefix.cssVar) {
            resolved.prefix.cssVar = encodeClassName(config.prefix.cssVar)
          }
        }
        if (config.theme) {
          resolved.theme = normalizeTheme(config.theme)
          if (config.theme.extend) {
            resolved.theme.extend = normalizeTheme(config.theme.extend)
          }
        }
        return resolved
      },
      'codegen:prepare': ({ artifacts }) => transformArtifacts(artifacts),
    },
  }
}
