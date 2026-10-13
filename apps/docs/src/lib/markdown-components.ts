import type { GeneratedMarkdownComponentTransform } from '@cloudflare/nimbus-docs/types'

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

export const markdownComponents = {
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
} satisfies Record<string, GeneratedMarkdownComponentTransform>
