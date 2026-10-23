import process from 'node:process'

export const documentationUrls = {
  preview: 'https://preview.panda.weapp.dev',
  stable: 'https://panda.weapp.dev',
} as const

export function resolveDocumentationDeployment(environment: Record<string, string | undefined>) {
  const channel = environment.REPO_DOCS_CHANNEL ?? 'preview'
  if (channel !== 'preview' && channel !== 'stable') {
    throw new Error('REPO_DOCS_CHANNEL must be preview or stable.')
  }
  const site = documentationUrls[channel]
  const configured = new URL(environment.REPO_DOCS_URL ?? site)
  if (configured.href !== `${site}/`) {
    throw new Error(`REPO_DOCS_URL must be ${site} for the ${channel} channel.`)
  }
  return { channel, site, preview: channel === 'preview' }
}

export const documentationDeployment = resolveDocumentationDeployment(process.env)
