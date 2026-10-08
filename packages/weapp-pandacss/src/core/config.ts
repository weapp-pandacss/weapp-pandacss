import type { PandacssConfigFileOptions, UserConfig } from '@/types'
import process from 'node:process'
import { loadConfig as loadConfigFile } from '@pandacss/config'
import { createDefineConfig, loadConfig } from 'c12'
import { getCreateContextDefaults, getPostcssPluginDefaults } from '@/defaults'
import { defu } from '@/utils'

type LoadConfigResult = import('@pandacss/config', { with: { 'resolution-mode': 'import' } }).LoadConfigResult
type UserInputConfig = import('c12', { with: { 'resolution-mode': 'import' } }).UserInputConfig
type ResolvedUserConfig = import('c12', { with: { 'resolution-mode': 'import' } }).ResolvedConfig<UserConfig>
type DefineUserConfig = import('c12', { with: { 'resolution-mode': 'import' } }).DefineConfig<UserConfig>

export function getPandacssConfig(
  options?: Partial<PandacssConfigFileOptions>,
): Promise<LoadConfigResult> {
  const opt = defu<PandacssConfigFileOptions, PandacssConfigFileOptions[]>(
    options,
    {
      cwd: process.cwd(),
    },
  )

  return loadConfigFile(opt)
}

export function getUserConfig(options?: Pick<UserInputConfig, 'cwd'>): Promise<ResolvedUserConfig> {
  return loadConfig<UserConfig>({
    name: 'weapp-pandacss', // `${name}.config` //
    rcFile: false,
    globalRc: false,
    cwd: options?.cwd,
    defaults: {
      context: getCreateContextDefaults(),
      postcss: getPostcssPluginDefaults(),
    },
  })
}
/** @deprecated Legacy adapter configuration; new PostCSS options are passed directly to the plugin. */
export const defineConfig: DefineUserConfig = createDefineConfig<UserConfig>()
