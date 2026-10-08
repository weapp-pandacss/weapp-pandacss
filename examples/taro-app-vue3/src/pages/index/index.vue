<script>
import { Dongdong } from '@nutui/icons-vue-taro'
import { css } from 'styled-system/css/index.mjs'
import { reactive, toRefs } from 'vue'

export default {
  name: 'Index',
  components: {
    Dongdong,
  },
  setup() {
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
      styles,
    }
  },
}
</script>

<template>
  <view class="index">
    <view>
      <img src="" alt="">
    </view>
    <view :class="styles">
      {{ msg }}
    </view>

    <Dongdong />
    <view class="btn">
      <nut-button type="primary" @click="handleClick('text', msg2, true)">
        点我
      </nut-button>
    </view>
    <nut-toast v-model:visible="show" :msg="msg2" :type="type" :cover="cover" />
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
