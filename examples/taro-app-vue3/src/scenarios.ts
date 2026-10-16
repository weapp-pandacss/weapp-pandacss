import { encodeClassName } from '@weapp-pandacss/runtime'
import { css, cva, sva } from 'styled-system/css/index.mjs'
import './scenarios.css'

export const scenarioRecipe = cva({
  // Taro H5's unlayered universal reset owns padding: 0 unless the recipe
  // explicitly overrides it, while Panda keeps native layers on the Web.
  base: { backgroundColor: '#e2e8f0', color: '#334155', padding: '0.5rem !important' },
  variants: { active: { true: { backgroundColor: '#0284c7' } } },
  compoundVariants: [{ active: true, css: { color: '#ffffff' } }],
})

export const scenarioSlots = sva({
  className: 'scenario/卡片',
  slots: ['root', 'label'],
  base: { root: { backgroundColor: '#f1f5f9' }, label: { color: '#475569' } },
  variants: { active: { true: { root: { backgroundColor: '#e0f2fe' }, label: { color: '#0284c7' } } } },
})

// Native H5 resets set unlayered padding: 0, so token spacing opts in explicitly.
export const scenarioTokenClass = css({ paddingLeft: 'unit-fixture !important' })
export const scenarioImports = [
  { id: 'scenario-import-normal', className: 'import-normal' },
  { id: 'scenario-import-important', className: 'import-important' },
  { id: 'scenario-import-unlayered', className: 'import-unlayered' },
  { id: 'scenario-import-same-layer', className: 'import-same-layer' },
  { id: 'scenario-import-nested', className: 'import-nested' },
  { id: 'scenario-units', className: 'import-units' },
  { id: 'scenario-unicode', className: encodeClassName('import/中文') },
  { id: 'scenario-marker', className: encodeClassName('import_wp_2f_中文') },
  { id: 'scenario-collision-a', className: encodeClassName('import.a') },
  { id: 'scenario-collision-b', className: encodeClassName('import_wp_2e_a') },
]
