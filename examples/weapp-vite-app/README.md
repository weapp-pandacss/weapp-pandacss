# Weapp Vite + Wevu + Panda CSS

微信小程序示例，使用 weapp-vite 7.4.0、wevu 7.4.0 和 Panda CSS 2.1.2。
页面展示 `css()`、特殊字符类名、`cva()` 按钮变体及响应式切换。

在仓库根目录运行：

```bash
pnpm install
pnpm --filter weapp-pandacss build
pnpm --filter @weapp-pandacss/weapp-vite-app build
pnpm --filter @weapp-pandacss/weapp-vite-app dev
```

运行 `pnpm --filter @weapp-pandacss/weapp-vite-app open`，或者在微信开发者工具
中导入本示例目录。`project.config.json` 默认使用游客 AppID；需要平台功能时
在本地配置自己的 AppID。

构建和开发脚本先运行 `wv prepare`，生成 TypeScript 支持文件，再执行 Panda
codegen。Panda 2 的本地 plugin 使用同步 `codegen:done` hook 调用
`weapp-panda codegen`，每次重新生成 runtime 都会完成小程序转义补丁。
PostCSS 按 Panda → weapp 适配器 → rem/rpx 转换执行，`1rem = 32rpx`。

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
