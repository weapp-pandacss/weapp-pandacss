<script>
import { Dongdong } from '@nutui/icons-vue-taro'
import { Button as NutButton, Toast as NutToast } from '@nutui/nutui-taro'
import { encodeClassList } from '@weapp-pandacss/runtime'
import { css } from 'styled-system/css/index.mjs'
import { computed, reactive, ref, toRefs } from 'vue'
import ScenarioCard from '../../components/ScenarioCard.vue'
import { scenarioImports, scenarioRecipe, scenarioSlots, scenarioTokenClass } from '../../scenarios'
import '@nutui/nutui-taro/dist/packages/button/style/index.mjs'
import '@nutui/nutui-taro/dist/packages/toast/style/index.mjs'

export default {
  name: 'Index',
  components: {
    Dongdong,
    NutButton,
    NutToast,
    ScenarioCard,
  },
  setup() {
    const scenarioActive = ref(false)
    const scenarioClass = computed(() => scenarioRecipe({ active: scenarioActive.value }))
    const scenarioSlotClasses = computed(() => scenarioSlots({ active: scenarioActive.value }))
    const scenarioStyle = computed(() => `--scenario-tone:${scenarioActive.value ? '#be123c' : '#0f766e'};--scenario-space:${scenarioActive.value ? '12px' : '8px'}`)
    const preprocessors = ['sass', 'less', 'stylus'].map(language => ({ language, className: encodeClassList(`preprocess/${language}-中文 active preprocess/import-${language}`) }))
    const styles = css({
      bg: 'yellow.200',
      rounded: '9999px',
      fontSize: '90px',
      p: '10px 15px',
      color: 'pink.500',
    })
    const state = reactive({
      msg: '欢迎使用 NutUI4.0 开发小程序',
      msg2: '你成功了～',
      type: 'text',
      show: false,
      cover: false,
    })

    const handleClick = (type, msg, cover = false) => {
      state.show = true
      state.msg2 = msg
      state.type = type
      state.cover = cover
    }

    return {
      ...toRefs(state),
      handleClick,
      preprocessors,
      styles,
      scenarioActive,
      scenarioClass,
      scenarioSlotClasses,
      scenarioStyle,
      scenarioImports,
      scenarioTokenClass,
    }
  },
}
</script>

<template>
  <view class="index">
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
      <ScenarioCard :active="scenarioActive" />
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
    <view :class="styles">
      {{ msg }}
    </view>

    <Dongdong />
    <view class="btn">
      <NutButton id="scenario-nut-trigger" type="primary" @click="handleClick('text', msg2, true)">
        点我
      </NutButton>
    </view>
    <NutToast v-model:visible="show" custom-class="scenario-nut-toast" :duration="0" close-on-click-overlay :msg="msg2" :type="type" :cover="cover" />
    <text id="scenario-nut-status">
      {{ show ? 'open' : 'closed' }}
    </text>
  </view>
</template>

<style lang="scss">
.index {
  font-family: Avenir, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-align: center;
}
</style>
