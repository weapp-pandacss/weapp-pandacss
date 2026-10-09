interface SearchResult {
  url: string
  meta: { title?: string }
  excerpt?: string
}

interface Pagefind {
  init: () => Promise<void>
  search: (query: string) => Promise<{ results: { data: () => Promise<SearchResult> }[] }>
}

/** Load the production Pagefind index only after the reader searches. */
export function mountSearch(root: HTMLDialogElement) {
  const form = root.querySelector('form')!
  const input = root.querySelector('input')!
  const status = root.querySelector<HTMLElement>('[role="status"]')!
  const results = root.querySelector('ul')!
  let api: Promise<Pagefind> | undefined
  let request = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  const triggers = [...document.querySelectorAll<HTMLButtonElement>('[data-open-search]')]
  let returnFocus: HTMLElement | undefined

  const open = (trigger?: HTMLElement) => {
    document.querySelector<HTMLDialogElement>('#navigation-dialog')?.close()
    if (!root.open) {
      returnFocus = trigger ?? (document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : triggers[0])
      root.showModal()
    }
    input.focus()
  }
  triggers.forEach(button => button.addEventListener('click', () => open(button)))
  root.querySelector('[data-close-search]')!.addEventListener('click', () => root.close())
  root.addEventListener('close', () => {
    const target = returnFocus?.isConnected && returnFocus.getClientRects().length ? returnFocus : triggers[0]
    target?.focus()
  })
  root.addEventListener('click', (event) => {
    if (event.target === root) {
      const rect = root.getBoundingClientRect()
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) {
        root.close()
      }
    }
  })
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && root.open) {
      event.preventDefault()
      root.close()
      return
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault()
      open()
    }
  })

  const search = async () => {
    clearTimeout(timer)
    const current = ++request
    results.replaceChildren()
    const query = input.value.trim()
    if (!query) {
      status.textContent = ''
      return
    }
    status.textContent = root.dataset.loading ?? ''
    try {
      const base = (root.dataset.base ?? '/').replace(/\/$/, '')
      api ??= import(/* @vite-ignore */ `${base}/pagefind/pagefind.js`).then(async (module: Pagefind) => {
        await module.init()
        return module
      })
      const response = await (await api).search(query)
      const pages = await Promise.all(response.results.slice(0, 10).map(result => result.data()))
      if (current !== request) {
        return
      }
      status.textContent = pages.length ? '' : root.dataset.empty ?? ''
      for (const page of pages) {
        const url = new URL(page.url, window.location.origin)
        if (url.origin !== window.location.origin) {
          continue
        }
        const item = document.createElement('li')
        const link = document.createElement('a')
        link.href = url.href
        link.textContent = page.meta.title ?? page.url
        item.append(link)
        results.append(item)
      }
    }
    catch {
      api = undefined
      if (current === request) {
        status.textContent = root.dataset.unavailable ?? ''
      }
    }
  }
  form.addEventListener('submit', (event) => {
    event.preventDefault()
    void search()
  })
  input.addEventListener('input', () => {
    ++request
    clearTimeout(timer)
    if (!input.value.trim()) {
      results.replaceChildren()
      status.textContent = ''
      return
    }
    timer = setTimeout(() => void search(), 180)
  })
}
