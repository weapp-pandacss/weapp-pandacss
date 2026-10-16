<script setup lang="ts">
import { encodeClassList } from '@weapp-pandacss/runtime'
import { css } from 'styled-system/css/index.mjs'
import { computed, ref } from 'vue'
import IceButtonPanda from '@/components/ButtonPanda.vue'
import IceButtonTw from '@/components/ButtonTw.vue'
import { scenarioImports, scenarioRecipe, scenarioSlots, scenarioTokenClass } from '../../scenarios'

const scenarioActive = ref(false)
const scenarioClass = computed(() => scenarioRecipe({ active: scenarioActive.value }))
const scenarioSlotClasses = computed(() => scenarioSlots({ active: scenarioActive.value }))
const scenarioStyle = computed(() => `--scenario-tone:${scenarioActive.value ? '#be123c' : '#0f766e'};--scenario-space:${scenarioActive.value ? '12px' : '8px'}`)

const preprocessors = ['sass', 'less', 'stylus'].map(language => ({ language, className: encodeClassList(`preprocess/${language}-中文 active preprocess/import-${language}`) }))
const title = ref('Hello')
const aaa = css({
  color: 'red.300',
  bg: 'blue.800',
  fontWeight: 'semibold',
})

const styles = css({
  backgroundColor: 'gainsboro',
  borderRadius: '9999px',
  fontSize: 'lg',
  padding: '10px 15px',
})

const style0 = css({
  fontSize: '2xl',
  paddingTop: '10px',
})
</script>

<template>
  <view class="content">
    <view id="scenario-panel" class="scenario-panel">
      <button id="scenario-toggle" @tap="scenarioActive = !scenarioActive">
        Switch styles
      </button>
      <text id="scenario-status">
        {{ scenarioActive ? 'accent' : 'neutral' }}
      </text>
      <view id="scenario-recipe" :class="scenarioClass">
        Recipe compound
      </view>
      <IceButtonPanda probe-id="scenario-props" :intent="scenarioActive ? 'primary' : 'secondary'" :size="scenarioActive ? 'medium' : 'small'">
        {{ scenarioActive ? 'accent' : 'neutral' }}
      </IceButtonPanda>
      <IceButtonTw probe-id="scenario-props-tailwind" :intent="scenarioActive ? 'primary' : 'secondary'" :size="scenarioActive ? 'medium' : 'small'">
        {{ scenarioActive ? 'accent' : 'neutral' }}
      </IceButtonTw>
      <view id="scenario-slot-root" :class="scenarioSlotClasses.root">
        <text id="scenario-slot-label" :class="scenarioSlotClasses.label">
          Slot recipe
        </text>
      </view>
      <view id="scenario-variable" class="scenario-variable" :style="scenarioStyle">
        Dynamic CSS variables
      </view>
      <text id="scenario-normal" :class="scenarioActive ? 'scenario-normal-accent' : 'scenario-normal-neutral'">
        Cascade layers
      </text>
      <text id="scenario-important" :class="scenarioActive ? 'scenario-important-accent' : 'scenario-important-neutral'">
        Important layers
      </text>
      <view id="scenario-token" :class="scenarioTokenClass">
        Spacing token
      </view>
      <view v-for="item in scenarioImports" :id="item.id" :key="item.id" :class="item.className">
        {{ item.id }}
      </view>
    </view>
    <view v-for="item in preprocessors" :id="`preprocess-${item.language}`" :key="item.language" :class="item.className">
      {{ item.language }} variables, mixins, nesting and CSS imports
    </view>
    <view class="text-area pb-2">
      <text
        class="title" :class="css({
          'bg': 'red.400',
          '&:hover': {
            bg: 'orange.400',
          },
        })"
      >
        {{ title }}
      </text>
    </view>
    <view :class="[style0, aaa]">
      aaa
    </view>
    <div :class="styles">
      <p>Hello World</p>
    </div>
    <view class="flex justify-around w-full">
      <IceButtonTw>asdfg</IceButtonTw>
      <IceButtonPanda>zxcvb</IceButtonPanda>
    </view>
  </view>
</template>

<style>
.content {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.logo {
  width: 200rpx;
  height: 200rpx;
  margin: 200rpx auto 50rpx;
}

.text-area {
  display: flex;
  justify-content: center;
}

.title {
  font-size: 36rpx;
  color: #8f8f94;
}
</style>
