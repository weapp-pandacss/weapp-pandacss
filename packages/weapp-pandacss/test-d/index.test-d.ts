import type { PandaPlugin } from '@pandacss/types'
import type { PluginCreator } from 'postcss'
import type { IPostcssPluginOptions } from 'weapp-pandacss'
import { expectAssignable, expectError, expectType } from 'tsd'
import * as api from 'weapp-pandacss'
import {
  postcssPlugin,
} from 'weapp-pandacss'
import { weappPanda } from 'weapp-pandacss/panda'
import { encodeClassList, encodeClassName } from 'weapp-pandacss/runtime'

expectAssignable<PluginCreator<any>>(postcssPlugin)
expectAssignable<PandaPlugin>(weappPanda())
expectAssignable<PandaPlugin>(api.weappPanda())
expectType<string>(encodeClassName('a.b'))
expectType<string>(encodeClassList('a.b c'))
expectAssignable<IPostcssPluginOptions>({ target: 'web', disabled: true })
postcssPlugin({ target: 'web' })
postcssPlugin({ cascadeLayers: { mode: 'ordered', onConflict: 'error' } })
postcssPlugin({ cascadeLayers: { mode: 'legacy' }, removeNegationPseudoClass: false })
expectError(postcssPlugin({ cascadeLayers: { mode: 'native' } }))
expectError(postcssPlugin({ cascadeLayers: { onConflict: 'ignore' } }))
expectError(postcssPlugin({ naming: 'legacy' }))
expectError(api.createContext())
expectError(api.defineConfig({}))

postcssPlugin()
postcssPlugin({ imports: true, panda: true, adapter: true })
postcssPlugin({ imports: false, panda: false, adapter: false })
postcssPlugin({ imports: { root: '/project', path: ['styles'], skipDuplicates: false, filter: (id: string) => id.endsWith('.css'), load: async () => '.a {}' }, panda: { cwd: '/project', configPath: 'panda.config.ts', outdir: 'styled-system', allow: [/node_modules/] } })
expectError(postcssPlugin({ imports: 'auto' }))
expectError(postcssPlugin({ panda: { unsupported: true } }))
expectError(postcssPlugin({ adapter: {} }))

expectAssignable<api.UnitConversionOptions>({ rules: api.composeUnitRules(api.unitPresets.remToRpx({ rootValue: 32 })) })
postcssPlugin({ units: false })
postcssPlugin({ units: { rules: [{ from: /rem/g, to: 'rpx', factor: 32 }], propList: ['*', '!border*'], selectorBlackList: [/^\.third-party/], mediaQuery: true, exclude: file => file.includes('vendor') } })
postcssPlugin({ units: { rules: [{ from: unit => unit === 'em', transform: (value, context) => ({ value: value * 16, unit: context.fromUnit === 'em' ? 'px' : context.rawUnit }) }], replace: false, unitPrecision: 3, minValue: 0.1, keepZeroUnit: true } })
expectAssignable<api.ConversionRule[]>(api.composeUnitRules(api.unitPresets.pxToRem(), api.unitPresets.rpxPresetGroup()))
expectAssignable<api.PresetFactory<api.RemBasedPresetOptions>>(api.unitPresets.remToRpx)
expectAssignable<api.PresetGroupFactory<api.RpxPresetGroupOptions>>(api.unitPresets.rpxPresetGroup)
expectAssignable<api.PresetFactory>(api.unitPresets.pxToRem)
expectError(postcssPlugin({ units: true }))
expectError(postcssPlugin({ units: { rootValue: 32 } }))
