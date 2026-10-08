import type { MiniProgramNode } from '@mpcore/test'
import type { WeappViteTestArtifact } from '@mpcore/weapp-vite'
import fs from 'node:fs/promises'
import path from 'node:path'
import { createTestProject } from '@mpcore/test'
import { buildWeappViteTestArtifact } from '@mpcore/weapp-vite'
import postcss from 'postcss'

const exampleRoot = path.resolve(import.meta.dirname, '..')
let artifact: WeappViteTestArtifact

beforeAll(async () => {
  artifact = await buildWeappViteTestArtifact({ cwd: exampleRoot })
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
  expect(stylesheet).toContain('16rpx')

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
    const button = screen.getByRole('button', { name: '点击切换按钮样式' })
    expectMatchingClasses(button)
    const initialClasses = button.getAttribute('class')

    await user.tap(button)
    expect(screen.getByAttribute('id', 'status')).toHaveTextContent('accent')
    const activeButton = screen.getByRole('button', { name: '已切换到强调样式' })
    expect(activeButton.getAttribute('class')).not.toBe(initialClasses)
    expectMatchingClasses(activeButton)

    await user.tap(activeButton)
    expect(screen.getByAttribute('id', 'status')).toHaveTextContent('neutral')
    expect(screen.getByRole('button').getAttribute('class')).toBe(initialClasses)
  }
  finally {
    await project.close()
  }
})
