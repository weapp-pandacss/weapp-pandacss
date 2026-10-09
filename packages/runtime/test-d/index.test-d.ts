import { createPortableRuntime, encodeClassList, encodeClassName } from '@weapp-pandacss/runtime'
import { expectError, expectType } from 'tsd'

expectType<string>(encodeClassName('a.b'))
expectType<string>(encodeClassList('a.b 中文'))
expectType<string>(createPortableRuntime().encodeClassName('a.b'))
expectType<string>(createPortableRuntime().encodeClassList('a.b 中文'))
expectError(encodeClassName(1))
expectError(encodeClassList(['a', 'b']))
