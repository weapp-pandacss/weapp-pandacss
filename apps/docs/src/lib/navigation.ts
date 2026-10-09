import type { Breadcrumb, PrevNext, SidebarGroupItem, SidebarItem, SidebarLinkItem } from '@cloudflare/nimbus-docs/types'
import type { IconName } from './icons'

function linksFrom(items: SidebarItem[]): SidebarLinkItem[] {
  return items.flatMap((item): SidebarLinkItem[] => {
    if (item.type === 'group') {
      const landing: SidebarLinkItem[] = item.indexHref
        ? [{ type: 'link', label: item.label, href: item.indexHref, order: item.order, isCurrent: item.indexIsCurrent }]
        : []
      return [...landing, ...linksFrom(item.children)]
    }
    return item.type === 'link' ? [item] : []
  })
}

export function documentationSections(chinese: boolean) {
  return [
    { id: 'start', icon: 'rocket', label: chinese ? '快速开始' : 'Get started', href: 'get-started/', roots: ['', 'get-started', 'panda', 'postcss', 'runtime'] },
    { id: 'frameworks', icon: 'blocks', label: chinese ? '框架接入' : 'Frameworks', href: 'frameworks/', roots: ['frameworks'] },
    { id: 'guides', icon: 'route', label: chinese ? '使用场景' : 'Guides', href: 'guides/', roots: ['guides'] },
    { id: 'api', icon: 'braces', label: chinese ? 'API 参考' : 'API reference', href: 'api/', roots: ['api'] },
    { id: 'troubleshooting', icon: 'wrench', label: chinese ? '迁移与排错' : 'Migration & troubleshooting', href: 'troubleshooting/', roots: ['migration', 'troubleshooting'] },
  ] satisfies { id: string, icon: IconName, label: string, href: string, roots: string[] }[]
}

const pageIcons: Record<string, IconName> = {
  '': 'home',
  'get-started': 'rocket',
  'panda': 'puzzle',
  'postcss': 'file-cog',
  'runtime': 'code',
  'migration': 'workflow',
  'troubleshooting': 'wrench',
  'frameworks/web': 'monitor',
  'frameworks/native': 'code',
  'api/panda-plugin': 'puzzle',
  'api/postcss-plugin': 'file-cog',
  'api/runtime': 'code',
  'api/styling': 'braces',
  'api/recipes': 'component',
  'api/tokens-patterns': 'palette',
  'guides/class-names': 'tag',
  'guides/dynamic-styles': 'sliders',
  'guides/component-styles': 'component',
  'guides/build-targets': 'workflow',
  'guides/css-compatibility': 'layers',
}

function documentationSlug(href: string) {
  return href.replace(/^\/zh(?=\/)/, '').replace(/^\/|\/$/g, '')
}

export function sectionIcon(href: string): IconName {
  const root = documentationSlug(href).split('/')[0]
  return documentationSections(false).find(section => section.roots.includes(root))?.icon ?? 'file-text'
}

export function pageIcon(href: string): IconName {
  return pageIcons[documentationSlug(href)] ?? sectionIcon(href)
}

/** Group Nimbus's generated links without maintaining a second page inventory. */
export function documentationNavigation(items: SidebarItem[], pathname: string, chinese: boolean) {
  const base = chinese ? '/zh/' : '/'
  const sections = documentationSections(chinese)
  const unique = [...new Map(linksFrom(items).map(link => [link.href, link])).values()]
  const rootOf = (link: SidebarLinkItem) => link.href.slice(base.length).split('/')[0] ?? ''
  const grouped = sections.map((section, order): SidebarGroupItem => ({
    type: 'group',
    label: section.label,
    order,
    children: unique.filter(link => section.roots.includes(rootOf(link))).sort((a, b) => {
      const aLanding = a.href.slice(base.length).split('/').filter(Boolean).length <= 1
      const bLanding = b.href.slice(base.length).split('/').filter(Boolean).length <= 1
      return Number(bLanding) - Number(aLanding) || a.order - b.order || a.href.localeCompare(b.href)
    }),
  })).filter(group => group.children.length)
  const ungrouped = unique.filter(link => !sections.some(section => section.roots.includes(rootOf(link))))
  if (ungrouped.length) {
    grouped.push({ type: 'group', label: chinese ? '更多文档' : 'More documentation', order: sections.length, children: ungrouped })
  }

  const ordered = linksFrom(grouped)
  const index = ordered.findIndex(link => link.href === pathname)
  const current = ordered[index]
  const section = grouped.find(group => group.type === 'group' && group.children.some(link => link.type === 'link' && link.href === pathname))
  const breadcrumbs: Breadcrumb[] = [{ label: chinese ? '文档' : 'Documentation', href: base }]
  if (section?.type === 'group' && pathname !== base) {
    breadcrumbs.push({ label: section.label })
  }
  if (current && pathname !== base) {
    breadcrumbs.push({ label: current.label })
  }
  const prevNext: PrevNext = {}
  if (index > 0) {
    prevNext.prev = ordered[index - 1]
  }
  if (index >= 0 && index < ordered.length - 1) {
    prevNext.next = ordered[index + 1]
  }
  return { sidebar: grouped, breadcrumbs, prevNext }
}
