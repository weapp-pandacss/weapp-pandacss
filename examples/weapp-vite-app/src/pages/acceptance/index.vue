<script setup lang="ts">
import { encodeClassName } from '@weapp-pandacss/runtime'
import { computed, ref } from 'wevu'
import { css, cva, cx, sva } from '../../../styled-system/css/index.mjs'
import { box } from '../../../styled-system/patterns/index.mjs'
import { e2eButton, e2eCard } from '../../../styled-system/recipes/index.mjs'
import { token } from '../../../styled-system/tokens/index.mjs'

definePageJson({ navigationBarTitleText: 'Panda runtime acceptance' })

const active = ref(false)
const atomic = css({ color: '#dc2626', fontSize: '1.5rem', padding: '0.5rem', width: '50%' })
const variableToken = css({ padding: token.var('spacing.0.5') })
const valueToken = css({ padding: token('spacing.0.5') })
const semanticToken = css({ color: token.var('colors.brand/主色'), marginLeft: '-0.5' })
const important = css({ color: '#7c3aed !important' })
const merged = cx(css({ color: '#dc2626' }, { color: '#16a34a' }), css({ fontWeight: 'bold' }))
const pattern = box({ display: 'flex', alignItems: 'center', padding: '0.5rem' })
const recipe = cva({
  base: { backgroundColor: '#e2e8f0', color: '#334155' },
  variants: { active: { true: { backgroundColor: '#0284c7' } } },
  compoundVariants: [{ active: true, css: { color: '#ffffff' } }],
})
const slots = sva({
  className: 'inline/card',
  slots: ['root', 'label'],
  base: { root: { backgroundColor: '#f1f5f9' }, label: { color: '#475569' } },
  variants: { active: { true: { root: { backgroundColor: '#e0f2fe' }, label: { color: '#0284c7' } } } },
})
const variantClass = computed(() => recipe({ active: active.value }))
const slotClasses = computed(() => slots({ active: active.value }))
const namedClass = computed(() => e2eButton({ tone: active.value ? 'accent' : 'neutral' }))
const namedSlots = computed(() => e2eCard({ active: active.value ? true : undefined }))
const collisionA = encodeClassName('a.b')
const collisionB = encodeClassName('a_wp_2e_b')
const leading = encodeClassName('2leading/中文')
const marked = encodeClassName('-leading_wp_')
</script>

<template>
  <view :class="css({ padding: '0.5rem' })">
    <view id="atomic" :class="atomic">
      Decimal / percentage
    </view>
    <view id="variable-token" :class="variableToken">
      token.var
    </view>
    <view id="value-token" :class="valueToken">
      token value
    </view>
    <view id="semantic-token" :class="semanticToken">
      Semantic / negative token
    </view>
    <view id="important" :class="important">
      Important atomic
    </view>
    <view id="merged" :class="merged">
      css merge + cx
    </view>
    <view id="pattern" :class="pattern">
      Pattern
    </view>
    <view id="variant" :class="variantClass">
      cva compound
    </view>
    <view id="slot-root" :class="slotClasses.root">
      <text id="slot-label" :class="slotClasses.label">
        sva slot
      </text>
    </view>
    <view id="named" :class="namedClass">
      Named compound recipe
    </view>
    <view id="named-root" :class="namedSlots.root">
      <text id="named-label" :class="namedSlots.label">
        Named slot compound
      </text>
    </view>
    <text id="collision-a" :class="collisionA">
      Dotted name
    </text>
    <text id="collision-b" :class="collisionB">
      Literal marker
    </text>
    <text id="leading" :class="leading">
      Leading digit / Unicode
    </text>
    <text id="marked" :class="marked">
      Leading hyphen / marker
    </text>
    <button id="toggle" @tap="active = !active">
      {{ active ? 'Accent' : 'Neutral' }}
    </button>
    <text id="acceptance-status">
      {{ active ? 'accent' : 'neutral' }}
    </text>
  </view>
</template>
