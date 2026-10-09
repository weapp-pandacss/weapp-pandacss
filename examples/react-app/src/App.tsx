import { encodeClassName } from '@weapp-pandacss/runtime'
import { useState } from 'react'
import { css, cva, cx, sva } from '../styled-system/css/index.mjs'
import { token } from '../styled-system/tokens/index.mjs'

const button = cva({
  base: { padding: '0.5rem 1rem', borderRadius: '0.5rem', color: '#ffffff' },
  variants: {
    tone: { neutral: { bg: '#334155' }, accent: { bg: '#0284c7' } },
  },
  compoundVariants: [{ tone: 'accent', css: { outline: '3px solid #0c4a6e' } }],
  defaultVariants: { tone: 'neutral' },
})
const card = sva({
  slots: ['root', 'label'],
  base: { root: { borderWidth: '1px', padding: '1rem' }, label: { fontWeight: 'bold' } },
  variants: { active: { true: { root: { borderColor: '#0284c7' }, label: { color: '#0284c7' } } } },
})

function App() {
  const [active, setActive] = useState(false)
  const slots = card({ active })
  return (
    <main className={css({ p: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' })}>
      <h1 className={css({ fontSize: '2xl', fontWeight: 'bold', color: '#0284c7' })}>Panda CSS on the Web</h1>
      <section data-testid="card" className={slots.root}>
        <span data-testid="slot-label" className={slots.label}>Shared portable classes</span>
      </section>
      <button type="button" aria-pressed={active} className={button({ tone: active ? 'accent' : 'neutral' })} onClick={() => setActive(value => !value)}>
        {active ? 'Accent' : 'Neutral'}
      </button>
      <p data-testid="token" className={css({ padding: token.var('spacing.0.5') })}>Hashed CSS variable</p>
      <p data-testid="hover" className={css({ bg: '#ffffff', _hover: { bg: '#fde047' } })}>Hover keeps Web semantics</p>
      <p data-testid="manual" className={cx(encodeClassName('manual/中文_wp_2e_'), css({ fontSize: '1.25rem' }))}>Manual special class</p>
      <p data-testid="collision-a" className={encodeClassName('a.b')}>Dotted name</p>
      <p data-testid="collision-b" className={encodeClassName('a_wp_2e_b')}>Literal marker</p>
    </main>
  )
}

export default App
