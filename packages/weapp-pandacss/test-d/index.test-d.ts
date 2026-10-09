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
