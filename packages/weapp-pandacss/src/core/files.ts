import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import { dirname } from 'node:path'

// Bundlers can read these modules while PostCSS runs codegen. Preserve existing
// files when their content matches and publish changed files with one rename.
export async function writeGeneratedFile(filename: string, content: string | Uint8Array) {
  const next = Buffer.from(content)
  try {
    if ((await fs.readFile(filename)).equals(next)) {
      return
    }
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error
    }
  }
  await fs.mkdir(dirname(filename), { recursive: true })
  const temporary = `${filename}.${randomUUID()}.tmp`
  try {
    await fs.writeFile(temporary, next, { flag: 'wx' })
    await fs.rename(temporary, filename)
  }
  finally {
    await fs.rm(temporary, { force: true })
  }
}
