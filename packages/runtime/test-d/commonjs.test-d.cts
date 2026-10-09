// eslint-disable-next-line ts/no-require-imports
import runtime = require('@weapp-pandacss/runtime')
import { expectError, expectType } from 'tsd'

expectType<string>(runtime.encodeClassName('a.b'))
expectType<string>(runtime.encodeClassList('a.b 中文'))
expectType<string>(runtime.createPortableRuntime().encodeClassName('a.b'))
expectError(runtime.encodeClassName(1))
