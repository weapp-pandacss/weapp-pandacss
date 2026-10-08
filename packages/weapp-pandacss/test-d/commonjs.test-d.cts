import type { PluginCreator } from 'postcss'
import { expectAssignable } from 'tsd'
// The CommonJS consumer must resolve the require condition and .d.cts declarations.
// eslint-disable-next-line ts/no-require-imports
import api = require('weapp-pandacss')
// eslint-disable-next-line ts/no-require-imports
import panda = require('weapp-pandacss/panda')
// eslint-disable-next-line ts/no-require-imports
import postcssPlugin = require('weapp-pandacss/postcss')
// eslint-disable-next-line ts/no-require-imports
import runtime = require('weapp-pandacss/runtime')

expectAssignable<api.UserConfig>(api.defineConfig({ context: { escapePredicate: 'true' } }))
expectAssignable<PluginCreator<any>>(postcssPlugin)
expectAssignable<NonNullable<import('@pandacss/dev', { with: { 'resolution-mode': 'import' } }).Config['plugins']>[number]>(panda.weappPanda())
expectAssignable<string>(runtime.encodeClassName('a.b'))
