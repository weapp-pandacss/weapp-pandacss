<script>
import { Dongdong } from '@nutui/icons-vue-taro'
import { Button as NutButton, Toast as NutToast } from '@nutui/nutui-taro'
import { encodeClassList } from '@weapp-pandacss/runtime'
import { css } from 'styled-system/css/index.mjs'
import { reactive, toRefs } from 'vue'
import '@nutui/nutui-taro/dist/packages/button/style/index.mjs'
import '@nutui/nutui-taro/dist/packages/toast/style/index.mjs'

export default {
  name: 'Index',
  components: {
    Dongdong,
    NutButton,
    NutToast,
  },
  setup() {
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
    }
  },
}
</script>

<template>
  <view class="index">
    <view v-for="item in preprocessors" :id="`preprocess-${item.language}`" :key="item.language" :class="item.className">
      {{ item.language }} variables, mixins, nesting and CSS imports
    </view>
    <view>
      <img src="" alt="">
    </view>
    <view :class="styles">
      {{ msg }}
    </view>

    <Dongdong />
    <view class="btn">
      <NutButton type="primary" @click="handleClick('text', msg2, true)">
        点我
      </NutButton>
    </view>
    <NutToast v-model:visible="show" :msg="msg2" :type="type" :cover="cover" />
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
