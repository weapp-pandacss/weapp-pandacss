<script setup>
import { computed } from 'vue'
import { scenarioRecipe } from '../scenarios'

const props = defineProps({ active: Boolean })
const className = computed(() => scenarioRecipe({ active: props.active }))
</script>

<template>
  <view id="scenario-props" :class="className">
    {{ active ? 'accent' : 'neutral' }}
  </view>
</template>
