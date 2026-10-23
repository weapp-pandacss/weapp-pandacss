import { withBase } from '@cloudflare/nimbus-docs/runtime'
import { config } from 'virtual:nimbus/config'
import { documentationDeployment } from '../lib/deployment'

export const prerender = true

export function GET() {
  const body = [
    'User-agent: *',
    documentationDeployment.preview ? 'Disallow: /' : 'Allow: /',
    '',
    `Sitemap: ${new URL(withBase('/sitemap-index.xml', import.meta.env.BASE_URL), config.site).href}`,
    '',
  ].join('\n')

  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
