import path from 'node:path'
import { getPackageInfoSync } from 'local-pkg'

export function getPandaVersion() {
  return getPackageInfoSync('@pandacss/dev', {
    paths: [path.resolve(import.meta.dirname, '..')],
  })?.version
}
