import type { PluginCreator } from 'postcss'
import { expectAssignable } from 'tsd'
// The CommonJS consumer must resolve the require condition and .d.cts declarations.
// eslint-disable-next-line ts/no-require-imports
import api = require('weapp-pandacss')
// eslint-disable-next-line ts/no-require-imports
import postcssPlugin = require('weapp-pandacss/postcss')

expectAssignable<api.UserConfig>(api.defineConfig({ context: { escapePredicate: 'true' } }))
expectAssignable<PluginCreator<any>>(postcssPlugin)
