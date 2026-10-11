import { fileURLToPath } from 'node:url'
import { defineStylelintConfig } from 'repoctl/tooling'

// Resolve the shared project settings independently of the package command cwd.
export default await defineStylelintConfig({ cwd: fileURLToPath(new URL('../..', import.meta.url)) })
