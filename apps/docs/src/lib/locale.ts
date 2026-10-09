import type { SidebarItem } from '@cloudflare/nimbus-docs/types'

export function isChinese(path: string) {
  return path === '/zh' || path.startsWith('/zh/')
}

export function alternatePath(path: string) {
  return isChinese(path) ? path.slice(3) || '/' : `/zh${path}`
}

export function localizeSidebar(items: SidebarItem[], chinese: boolean): SidebarItem[] {
  return items.flatMap((item): SidebarItem[] => {
    if (item.type !== 'group') {
      return item.type === 'external' || isChinese(item.href) === chinese ? [item] : []
    }
    const children = localizeSidebar(item.children, chinese)
    const indexHref = item.indexHref && isChinese(item.indexHref) === chinese ? item.indexHref : undefined
    if (!children.length && !indexHref) {
      return []
    }
    return [{ ...item, indexHref, children }]
  })
}

export const labels = {
  en: {
    navigation: 'On this site',
    contents: 'On this page',
    skip: 'Skip to content',
    search: 'Search documentation',
    submit: 'Search',
    empty: 'No matching pages.',
    loading: 'Searching…',
    unavailable: 'Search is unavailable. Refresh the page or use the navigation.',
    markdown: 'Read Markdown',
    index: 'Documentation index',
    github: 'GitHub repository',
    language: 'Switch to 简体中文',
    close: 'Close',
    menu: 'Open navigation',
    theme: 'Color theme',
    system: 'System',
    light: 'Light',
    dark: 'Dark',
    previous: 'Previous',
    next: 'Next',
    copy: 'Copy code',
    copied: 'Copied',
    selection: 'Code selected. Copy with your keyboard.',
    searchPlaceholder: 'Search APIs, frameworks and common problems…',
    searchHint: 'Esc to close · Tab to navigate results',
  },
  zh: {
    navigation: '站点导航',
    contents: '本页目录',
    skip: '跳转到正文',
    search: '搜索文档',
    submit: '搜索',
    empty: '没有找到匹配的页面。',
    loading: '正在搜索…',
    unavailable: '搜索暂不可用，请刷新页面或通过导航查找。',
    markdown: '阅读 Markdown',
    index: '文档索引',
    github: 'GitHub 仓库',
    language: '切换到 English',
    close: '关闭',
    menu: '打开导航',
    theme: '颜色主题',
    system: '跟随系统',
    light: '浅色',
    dark: '深色',
    previous: '上一篇',
    next: '下一篇',
    copy: '复制代码',
    copied: '已复制',
    selection: '代码已选中，请使用键盘复制。',
    searchPlaceholder: '搜索 API、框架和常见问题…',
    searchHint: 'Esc 关闭 · Tab 选择搜索结果',
  },
} as const
