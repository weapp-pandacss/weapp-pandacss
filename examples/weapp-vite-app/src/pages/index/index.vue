<script setup lang="ts">
import { encodeClassName } from '@weapp-pandacss/runtime'
import { computed, ref } from 'wevu'
import { css } from '../../../styled-system/css/index.mjs'
import { token } from '../../../styled-system/tokens/index.mjs'
import PandaButton from '../../components/PandaButton.vue'

definePageJson({ navigationBarTitleText: 'Panda CSS + Wevu' })

const selected = ref(false)
const label = computed(() => selected.value ? '已切换到强调样式' : '点击切换按钮样式')
const pageClass = css({ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' })
const titleClass = css({ color: 'sky.600', fontSize: '2xl', fontWeight: 'bold' })
// Decimal tokens and arbitrary values exercise mini-program class escaping.
const cardClass = css({ bg: 'white', padding: '0.5rem', borderRadius: '1.5rem', borderWidth: '1px' })
const descriptionClass = css({ color: 'slate.600', fontSize: '1.25rem' })
const tokenClass = css({ padding: token.var('spacing.0.5') })
const manualClass = encodeClassName('manual/中文_wp_2e_')
</script>

<template>
  <view :class="pageClass">
    <text id="title" :class="titleClass">
      Panda CSS + Wevu
    </text>
    <view id="card" :class="cardClass">
      <text :class="descriptionClass">
        用 Panda 编写样式，用 Wevu 响应交互。
      </text>
    </view>
    <text id="manual" :class="manualClass">
      手写特殊 class
    </text>
    <text id="token" :class="tokenClass">
      token.var() 也保持 CSS 匹配
    </text>
    <PandaButton :active="selected" @toggle="selected = !selected">
      {{ label }}
    </PandaButton>
    <text id="status">
      {{ selected ? 'accent' : 'neutral' }}
    </text>
  </view>
</template>
