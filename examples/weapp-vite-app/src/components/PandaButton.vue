<script setup lang="ts">
import { computed } from 'wevu'
import { cva } from '../../styled-system/css/index.mjs'

const props = defineProps<{ active: boolean }>()

const emit = defineEmits<{ toggle: [] }>()

defineComponentJson({ component: true, styleIsolation: 'apply-shared' })

const button = cva({
  base: { padding: '0.5rem 1rem', borderRadius: '0.5rem', fontWeight: 'semibold' },
  variants: {
    tone: {
      neutral: { bg: 'slate.200', color: 'slate.900' },
      accent: { bg: 'sky.600', color: 'white' },
    },
  },
  defaultVariants: { tone: 'neutral' },
})
const buttonClass = computed(() => button({ tone: props.active ? 'accent' : 'neutral' }))
</script>

<template>
  <button id="variant-button" :class="buttonClass" @tap="emit('toggle')">
    <slot />
  </button>
</template>
