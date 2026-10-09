import nimbus, { defineConfig as defineNimbusConfig } from '@cloudflare/nimbus-docs'
import { defineConfig } from 'astro/config'

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
    icons: false,
    rules: {
      'nimbus/frontmatter-shape': 'error',
      'nimbus/internal-link': 'error',
      'nimbus/single-h1': 'error',
    },
    markdown: {
      componentMap: {
        Aside: { revision: '1', render: ({ children }) => children },
      },
    },
  })],
})
