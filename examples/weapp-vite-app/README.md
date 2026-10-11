# Weapp Vite + Wevu + Panda CSS

微信小程序示例，使用 weapp-vite 7.4.0、wevu 7.4.0 和 Panda CSS 2.1.2。
手写 class 使用 `@weapp-pandacss/runtime`；Panda 与 PostCSS 配置继续使用主包。
页面展示 `css()`、特殊字符类名、`cva()` 按钮变体及响应式切换。

完整配置见[中文接入指南](https://panda.weapp.dev/zh/frameworks/weapp-vite/) / [English guide](https://panda.weapp.dev/frameworks/weapp-vite/)。
查阅 [API 参考](https://panda.weapp.dev/zh/api/)、[场景处理](https://panda.weapp.dev/zh/guides/)与[排错步骤](https://panda.weapp.dev/zh/troubleshooting/)。

在仓库根目录运行：

```bash
pnpm install
pnpm exec turbo run build --filter=weapp-pandacss
pnpm --filter @weapp-pandacss/weapp-vite-app build
pnpm --filter @weapp-pandacss/weapp-vite-app dev
```

运行 `pnpm --filter @weapp-pandacss/weapp-vite-app open`，或者在微信开发者工具
中导入本示例目录。`project.config.json` 默认使用游客 AppID；需要平台功能时
在本地配置自己的 AppID。

构建和开发脚本先运行 `wv prepare`，生成 TypeScript 支持文件，再执行 Panda
codegen。`weappPanda()` 在同步 `codegen:prepare` hook 转换 artifacts，
由 Panda 一次写入 runtime；无需适配 CLI、备份或 rollback。
Weapp Vite 先解析本地 CSS import，单个 `adapter()` 默认完成剩余 import 展开 → Panda → 小程序适配，随后内置 `units: { rules: [{ from: 'rem', to: 'rpx', factor: 32 }] }` 转换，`1rem = 32rpx`，无需另装转换器；空配置默认不转换单位。
源码可使用普通 import，进入 ordered 编译前必须展开完整导入图；导入文件同样编码 class 并参与层顺序。
残留远程导入应本地化或提前解析，不能删除规则绕过校验。见[CSS 兼容指南](https://panda.weapp.dev/zh/guides/css-compatibility/)。

Vue SFC 使用 `<script setup lang="ts">`，响应式 API 从 `wevu` 导入。
按钮组件通过 `styleIsolation: 'apply-shared'` 使用全局 Panda 样式。
新示例关闭 Tailwind 集成，保留默认分包、chunk 和 HMR 策略。

```bash
pnpm --filter @weapp-pandacss/weapp-vite-app lint
pnpm --filter @weapp-pandacss/weapp-vite-app typecheck
pnpm --filter @weapp-pandacss/weapp-vite-app test
```

测试通过 mpcore 执行真实编译后的页面与组件，检查交互后的类名、WXSS 选择器
和重复生成的 runtime。它不验证像素布局；微信开发者工具用于视觉检查。
`styled-system`、`.weapp-vite` 和 `dist` 是生成文件，不提交到仓库。
