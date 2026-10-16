import { createTaroHtmlRuntime } from './fixtures/taro-html-runtime'

it.each([
  { event: undefined, props: {}, mappedType: 'pure-view' },
  { event: undefined, props: { hoverClass: 'hover' }, mappedType: 'static-view' },
  { event: 'tap', props: {}, mappedType: 'click-view' },
  { event: 'touchstart', props: {}, mappedType: 'view' },
  { event: undefined, props: { catchMove: true }, mappedType: 'catch-view' },
])('keeps native view classes stable across $mappedType hydration and updates', ({ event, props, mappedType }) => {
  const runtime = createTaroHtmlRuntime()
  const node = runtime.createElement('view', props)
  if (event) {
    node.addEventListener(event, () => {})
  }

  const initial = runtime.hydrate(node)
  expect(initial.nn).toBe(runtime.aliases[mappedType]!._num)
  expect(initial.cl).toBe('h5-view scenario-generated')
  expect(runtime.updateClass(node, 'scenario-accent').value).toBe('h5-view scenario-accent')
  expect(runtime.updateClass(node, 'scenario-generated').value).toBe(initial.cl)
})

it('preserves native view click-to-tap mapping used by NutUI overlays', () => {
  const runtime = createTaroHtmlRuntime()
  const node = runtime.createElement()
  const closeOverlay = vi.fn()
  node.addEventListener('click', closeOverlay)

  expect(runtime.hydrate(node).cl).toBe('h5-view scenario-generated')
  const handlers = node.__handlers['tap']
  expect(handlers).toHaveLength(1)
  handlers![0]!({ type: 'tap' })
  expect(closeOverlay).toHaveBeenCalledExactlyOnceWith({ type: 'tap' })

  node.removeEventListener('click', closeOverlay)
  expect(node.__handlers['tap']).toHaveLength(0)
})

it('preserves ordinary HTML tag mapping and stable classes', () => {
  const runtime = createTaroHtmlRuntime()
  const node = runtime.createElement('div')
  const initial = runtime.hydrate(node)
  expect(initial.nn).toBe(runtime.aliases['pure-view']!._num)
  expect(initial.cl).toBe('h5-div scenario-generated')
  expect(runtime.updateClass(node, 'scenario-generated').value).toBe(initial.cl)
})
