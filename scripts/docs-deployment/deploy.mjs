import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { deployDocumentation } from './deployment.mjs'

const result = await deployDocumentation({
  root: fileURLToPath(new URL('../../', import.meta.url)),
  env: process.env,
  channel: process.argv[2],
})
console.log(JSON.stringify(result))
