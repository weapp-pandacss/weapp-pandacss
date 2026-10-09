import type { MiniProgramNode } from '@mpcore/test'
import type { WeappViteTestArtifact } from '@mpcore/weapp-vite'
import fs from 'node:fs/promises'
import path from 'node:path'
import { createTestProject } from '@mpcore/test'
import { buildWeappViteTestArtifact } from '@mpcore/weapp-vite'
import { encodeClassName } from '@weapp-pandacss/runtime'
import postcss from 'postcss'

const exampleRoot = path.resolve(import.meta.dirname, '..')
let artifact: WeappViteTestArtifact

beforeAll(async () => {
  artifact = await buildWeappViteTestArtifact({ cwd: exampleRoot })
})

it('isolates page state between independent runtimes and resets it on a fresh launch', async () => {
  const first = createTestProject({ artifact })
  const second = createTestProject({ artifact })
  try {
    const a = await first.renderPage('/pages/index/index')
    const b = await second.renderPage('/pages/index/index')
    const original = b.screen.getByRole('button').getAttribute('class')
    for (let cycle = 0; cycle < 4; cycle++) {
      await a.user.tap(a.screen.getByRole('button'))
      expect(a.screen.getByAttribute('id', 'status')).toHaveTextContent(cycle % 2 === 0 ? 'accent' : 'neutral')
      expect(b.screen.getByAttribute('id', 'status')).toHaveTextContent('neutral')
      expect(b.screen.getByRole('button').getAttribute('class')).toBe(original)
    }
    await b.user.tap(b.screen.getByRole('button'))
    expect(b.screen.getByAttribute('id', 'status')).toHaveTextContent('accent')
    expect(a.screen.getByAttribute('id', 'status')).toHaveTextContent('neutral')
  }
  finally {
    await Promise.all([first.close(), second.close()])
  }
  const relaunched = createTestProject({ artifact })
  try {
    const { screen } = await relaunched.renderPage('/pages/index/index')
    expect(screen.getByAttribute('id', 'status')).toHaveTextContent('neutral')
    expect(screen.getByAttribute('id', 'manual').getAttribute('class')).toBe(encodeClassName('manual/中文_wp_2e_'))
  }
  finally {
    await relaunched.close()
  }
})

it('renders real Wevu output and keeps changing Panda classes in sync with WXSS', async () => {
  const stylesheet = await fs.readFile(path.join(artifact.miniprogramRootPath, 'app.wxss'), 'utf8')
  const classes = new Set<string>()
  postcss.parse(stylesheet).walkRules((rule) => {
    for (const match of rule.selector.matchAll(/\.([\w-]+)/g)) {
      classes.add(match[1]!)
    }
  })
  expect(stylesheet).not.toContain('@layer')
  expect(stylesheet).not.toContain(':where')
  expect(stylesheet).not.toContain(':not(#')
  expect(stylesheet).not.toContain(':not(n)')
  expect(stylesheet).toContain('16rpx')
  expect(stylesheet).toContain('_wp_2e_')
  for (const reference of stylesheet.matchAll(/var\(\s*(--[^,\s)]+)/g)) {
    expect(reference[1]).toMatch(/^--[\w-]+$/)
  }

  function expectMatchingClasses(node: MiniProgramNode) {
    const tokens = node.getAttribute('class').split(/\s+/).filter(Boolean)
    expect(tokens.length).toBeGreaterThan(0)
    for (const token of tokens) {
      expect(token).toMatch(/^[\w-]+$/)
      expect(classes.has(token), `Missing WXSS selector for ${token}`).toBe(true)
    }
  }

  const project = createTestProject({ artifact })
  try {
    const { screen, user } = await project.renderPage('/pages/index/index')
    expect(screen.getByAttribute('id', 'title')).toHaveTextContent('Panda CSS + Wevu')
    expectMatchingClasses(screen.getByAttribute('id', 'title'))
    expectMatchingClasses(screen.getByAttribute('id', 'card'))
    expectMatchingClasses(screen.getByAttribute('id', 'token'))
    expectMatchingClasses(screen.getByAttribute('id', 'layer-normal'))
    expectMatchingClasses(screen.getByAttribute('id', 'layer-important'))
    const manual = screen.getByAttribute('id', 'manual')
    expect(manual.getAttribute('class')).toBe(encodeClassName('manual/中文_wp_2e_'))
    expectMatchingClasses(manual)
    const button = screen.getByRole('button', { name: '点击切换按钮样式' })
    expectMatchingClasses(button)
    const initialClasses = button.getAttribute('class')

    await user.tap(button)
    expect(screen.getByAttribute('id', 'status')).toHaveTextContent('accent')
    const activeButton = screen.getByRole('button', { name: '已切换到强调样式' })
    expect(activeButton.getAttribute('class')).not.toBe(initialClasses)
    expectMatchingClasses(activeButton)
    expect(screen.getByAttribute('id', 'layer-normal').getAttribute('class')).toBe('layer-normal-accent')
    expect(screen.getByAttribute('id', 'layer-important').getAttribute('class')).toBe('layer-important-accent')
    expectMatchingClasses(screen.getByAttribute('id', 'layer-normal'))
    expectMatchingClasses(screen.getByAttribute('id', 'layer-important'))

    await user.tap(activeButton)
    expect(screen.getByAttribute('id', 'status')).toHaveTextContent('neutral')
    expect(screen.getByRole('button').getAttribute('class')).toBe(initialClasses)
    expect(screen.getByAttribute('id', 'layer-normal').getAttribute('class')).toBe('layer-normal-neutral')
    expect(screen.getByAttribute('id', 'layer-important').getAttribute('class')).toBe('layer-important-neutral')
  }
  finally {
    await project.close()
  }
})

it('covers the runtime acceptance page, named compounds and slot transitions with real emitted selectors', async () => {
  const stylesheet = await fs.readFile(path.join(artifact.miniprogramRootPath, 'app.wxss'), 'utf8')
  const classes = new Set([...stylesheet.matchAll(/\.([\w-]+)/g)].map(match => match[1]!))
  // Inline sva slot markers are metadata; the remaining classes carry styles.
  const markers = new Set(['root', 'label'].map(slot => encodeClassName(`inline/card__${slot}`)))
  const project = createTestProject({ artifact })
  try {
    const { screen, user } = await project.renderPage('/pages/acceptance/index')
    const ids = ['atomic', 'variable-token', 'value-token', 'semantic-token', 'important', 'merged', 'pattern', 'variant', 'slot-root', 'slot-label', 'named', 'named-root', 'named-label', 'collision-a', 'collision-b', 'leading', 'marked']
    const changing = ['variant', 'slot-root', 'slot-label', 'named', 'named-root', 'named-label']
    const initial = Object.fromEntries(changing.map(id => [id, screen.getByAttribute('id', id).getAttribute('class')]))
    for (let cycle = 0; cycle <= 4; cycle++) {
      expect(screen.getByAttribute('id', 'acceptance-status')).toHaveTextContent(cycle % 2 ? 'accent' : 'neutral')
      for (const id of ids) {
        const value = screen.getByAttribute('id', id).getAttribute('class')
        for (const name of value.trim().split(/\s+/)) {
          expect(name).toMatch(/^[A-Z_][\w-]*$/i)
          expect(classes.has(name) || markers.has(name), `${id}: missing ${name}`).toBe(true)
        }
        if (changing.includes(id)) {
          if (cycle % 2) {
            expect(value).not.toBe(initial[id])
          }
          else {
            expect(value).toBe(initial[id])
          }
        }
      }
      expect(screen.getByAttribute('id', 'collision-a').getAttribute('class')).toBe(encodeClassName('a.b'))
      expect(screen.getByAttribute('id', 'collision-b').getAttribute('class')).toBe(encodeClassName('a_wp_2e_b'))
      expect(screen.getByAttribute('id', 'leading').getAttribute('class')).toBe(encodeClassName('2leading/中文'))
      expect(screen.getByAttribute('id', 'marked').getAttribute('class')).toBe(encodeClassName('-leading_wp_'))
      if (cycle < 4) {
        await user.tap(screen.getByAttribute('id', 'toggle'))
      }
    }
  }
  finally {
    await project.close()
  }
})
