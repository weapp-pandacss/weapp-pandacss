import path from 'node:path'
import { defineEslintConfig } from 'repoctl/tooling'

export default await defineEslintConfig({ cwd: path.resolve(import.meta.dirname, '../..') })
