import { readFile, writeFile } from 'node:fs/promises'
import nimbus, { defineConfig as defineNimbusConfig } from '@cloudflare/nimbus-docs'
import { defineConfig } from 'astro/config'
import { documentationDeployment } from './src/lib/deployment'
import { markdownComponents } from './src/lib/markdown-components'

export default defineConfig({
  output: 'static',
  trailingSlash: 'always',
  site: documentationDeployment.site,
  // Keep the Pagefind loader external so Vite finalizes dynamic imports before Astro renders it.
  vite: { build: { assetsInlineLimit: 0 } },
  integrations: [nimbus(defineNimbusConfig({
    site: documentationDeployment.site,
    title: 'weapp-pandacss',
    description: 'Panda CSS 2.2.0 for mini-programs and Web. 小程序与 Web 的 Panda CSS 生成期适配。',
    locale: 'en',
    github: 'https://github.com/weapp-pandacss/weapp-pandacss',
    socialImage: '/avatar.png',
    socialImageAlt: 'weapp-pandacss logo',
  }), {
    icons: { iconDir: 'src/icons', include: {} },
    rules: {
      'nimbus/frontmatter-shape': 'error',
      'nimbus/internal-link': 'error',
      'nimbus/single-h1': 'error',
    },
    markdown: {
      componentMap: markdownComponents,
    },
  }), {
    name: 'documentation-channel-headers',
    hooks: {
      'astro:build:done': async ({ dir }) => {
        // Nimbus owns the discovery and content-type rules. Only replace our
        // marked policy block so repeated builds cannot retain preview robots.
        const target = new URL('_headers', dir)
        const generated = await readFile(target, 'utf8')
        const preserved = generated.replace(/^# BEGIN weapp-pandacss documentation channel\r?\n[\s\S]*?^# END weapp-pandacss documentation channel\r?\n?/gm, '')
        const policy = documentationDeployment.preview
          ? '# BEGIN weapp-pandacss documentation channel\n/*\n  X-Robots-Tag: noindex, nofollow\n# END weapp-pandacss documentation channel\n'
          : ''
        await writeFile(target, `${preserved}${preserved.endsWith('\n') ? '' : '\n'}${policy}`)
      },
    },
  }],
})
