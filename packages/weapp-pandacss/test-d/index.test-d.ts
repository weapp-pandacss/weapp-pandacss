import type { PandaPlugin } from '@pandacss/types'
import type { PluginCreator } from 'postcss'
import type { UserConfig } from 'weapp-pandacss'
import { expectAssignable, expectType } from 'tsd'
import {
  createContext,
  defineConfig,
  postcssPlugin,
} from 'weapp-pandacss'
import { weappPanda } from 'weapp-pandacss/panda'
import { encodeClassList, encodeClassName } from 'weapp-pandacss/runtime'

expectAssignable<UserConfig>(defineConfig({
  context: {
    escapePredicate: 'true',
  },
}))
expectAssignable<PluginCreator<any>>(postcssPlugin)
expectType<Promise<Awaited<ReturnType<typeof createContext>>>>(createContext())
expectAssignable<PandaPlugin>(weappPanda())
expectType<string>(encodeClassName('a.b'))
expectType<string>(encodeClassList('a.b c'))
expectAssignable<PluginCreator<any>>(postcssPlugin)
postcssPlugin({ target: 'web', naming: 'portable' })
