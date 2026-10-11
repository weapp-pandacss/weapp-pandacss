// import 'core-js'
import type { PropsWithChildren } from 'react'
import { useLaunch } from '@tarojs/taro'
import './app.css'
import './preprocessors/sass.scss'
import './preprocessors/less.less'
import './preprocessors/stylus.styl'

function App({ children }: PropsWithChildren<any>) {
  useLaunch(() => {
    console.log('App launched.')
  })

  // children 是将要会渲染的页面
  return children
}

export default App
