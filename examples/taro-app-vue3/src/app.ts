import { createApp } from 'vue'
import './app.css'
import './preprocessors/sass.scss'
import './preprocessors/less.less'
import './preprocessors/stylus.styl'

const App = createApp({
  onShow(_options) {},
  // 入口组件不需要实现 render 方法，即使实现了也会被 taro 所覆盖
})

export default App
