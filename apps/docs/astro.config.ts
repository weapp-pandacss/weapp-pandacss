import nimbus, { defineConfig as defineNimbusConfig } from '@cloudflare/nimbus-docs'
import { defineConfig } from 'astro/config'

function markdownLabel(value: string | boolean | undefined): string {
  return typeof value === 'string'
    ? value.replace(/\s+/g, ' ').trim().replace(/([\\`*_[\]<>])/g, '\\$1')
    : ''
}

function markdownLink(title: string | boolean | undefined, href: string | boolean | undefined, base: string): string {
  const label = markdownLabel(title)
  if (typeof href !== 'string' || !href) {
    return `**${label}**`
  }
  const target = href.startsWith('/') && !href.startsWith('//')
    ? base.replace(/\/$/, '') + href
    : href
  return `[${label}](${target.replace(/[\s()<>`]/g, character => encodeURIComponent(character))})`
}

export default defineConfig({
  output: 'static',
  trailingSlash: 'always',
  // Keep the Pagefind loader external so Vite finalizes dynamic imports before Astro renders it.
  vite: { build: { assetsInlineLimit: 0 } },
  integrations: [nimbus(defineNimbusConfig({
    site: 'https://panda.weapp.dev',
    title: 'weapp-pandacss',
    description: 'Panda CSS 2.1.2 for mini-programs and Web. 小程序与 Web 的 Panda CSS 生成期适配。',
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
      componentMap: {
        Aside: {
          revision: '2',
          render: ({ attrs, children }) => [attrs.title ? `**${markdownLabel(attrs.title)}**` : '', children].filter(Boolean).join('\n\n'),
        },
        DocIcon: { revision: '1', render: () => '' },
        IconControl: { revision: '1', render: ({ attrs, base }) => markdownLink(attrs.label, attrs.href, base) },
        LinkGrid: { revision: '1', render: ({ children }) => children },
        LinkCard: {
          revision: '1',
          render: ({ attrs, children, base }) => [markdownLink(attrs.title, attrs.href, base), children].filter(Boolean).join('\n\n'),
        },
        BuildFlow: { revision: '1', render: ({ children }) => children },
        FlowStep: {
          revision: '1',
          render: ({ attrs, children }) => [`**${markdownLabel(attrs.title)}**`, children].filter(Boolean).join('\n\n'),
        },
      },
    },
  })],
})
