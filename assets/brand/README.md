# weapp-pandacss Logo 方案

打开 `preview.html` 对比六版，可切换浅色/深色背景与显示大小。

- A：角标组合，推荐用作 GitHub 组织头像。
- B：并列双标，适合横向文档标识。
- C：双色圆章，适合图标与贴纸。
- D：开放组合，适合简洁的项目标识。
- E：熊猫徽章，适合社群头像。
- F：熊猫探头，适合轻松的社区风格。

`variants/` 包含每版透明 SVG 与 1024px PNG；`preview.png` 是总览。

素材出处：

- 用户提供的 `Vector.svg`，原样保存到 `sources/miniapp-original.svg`。
- Panda CSS 官方 Logo：<https://panda-css.com/panda-p-letter.svg>
- Panda CSS 官方吉祥物：<https://panda-css.com/panda-hello.svg>
- 官方素材页：<https://panda-css.com/brand>

已选 A「角标组合」作为 weapp-pandacss 的项目标识及 GitHub 组织头像。
`logo.svg` 是选定的矢量文件，`avatar.png` 是用于上传组织头像的白底 1024px 文件。

运行 `python3 assets/brand/build.py` 可重新生成 SVG、预览 HTML 与下载包。
PNG 是从对应 SVG 导出的 1024px 图；修改图形后请同时重新导出 PNG 和总览。
