import type { PackedPackages, PandaVersion } from './packed-consumer.ts'
import fs from 'node:fs/promises'
import path from 'node:path'
import { runInstalledScenario, writeInstalledScenario } from './installed-scenarios.ts'
import { installPackedConsumer } from './packed-consumer.ts'

export interface NativeConsumerOptions {
  root: string
  packages: PackedPackages
  panda: PandaVersion
  node: string
  appid: string
  libVersion: string
}

/** Generates an independent native project from an actual installed package pair. */
export async function createNativeConsumerProject(options: NativeConsumerOptions) {
  const { root, packages, panda, node, appid, libVersion } = options
  await installPackedConsumer(root, packages, panda, node)
  await writeInstalledScenario(root)
  const scenario = await runInstalledScenario(root, node)
  const miniRoot = path.join(root, 'miniprogram')
  const pageRoot = path.join(miniRoot, 'pages/index')
  await fs.mkdir(pageRoot, { recursive: true })
  await fs.mkdir(path.join(miniRoot, 'generated'), { recursive: true })
  await fs.writeFile(path.join(miniRoot, 'generated/classes.js'), `module.exports=${JSON.stringify({ classes: scenario.classes, runtimeStyle: scenario.runtimeStyle })}\n`)
  await fs.writeFile(path.join(miniRoot, 'app.js'), 'App({})\n')
  await fs.writeFile(path.join(miniRoot, 'app.json'), JSON.stringify({ pages: ['pages/index/index'], window: { navigationBarTitleText: 'Packed Panda acceptance' } }, null, 2))
  await fs.copyFile(path.join(root, 'output.wxss'), path.join(miniRoot, 'app.wxss'))
  await fs.copyFile(path.join(root, 'output.wxss.map'), path.join(miniRoot, 'output.wxss.map'))
  await fs.writeFile(path.join(pageRoot, 'index.json'), JSON.stringify({ usingComponents: { 'shared-panda-probe': '/components/shared/index', 'isolated-panda-probe': '/components/isolated/index' } }, null, 2))
  const components = [
    { tag: 'shared-panda-probe', selector: '#component-value', isolation: 'apply-shared', className: scenario.classes.atomic, color: '#2463eb' },
    { tag: 'isolated-panda-probe', selector: '#component-value', isolation: 'isolated', className: scenario.classes.atomic, color: '#000000' },
  ] as const
  for (const component of components) {
    const directory = path.join(miniRoot, 'components', component.isolation === 'isolated' ? 'isolated' : 'shared')
    await fs.mkdir(directory, { recursive: true })
    await fs.writeFile(path.join(directory, 'index.js'), `Component({options:{styleIsolation:${JSON.stringify(component.isolation)}},properties:{pandaClass:String}})\n`)
    await fs.writeFile(path.join(directory, 'index.json'), '{"component":true}\n')
    await fs.writeFile(path.join(directory, 'index.wxml'), '<view id="component-value" class="{{pandaClass}}">Component isolation probe</view>\n')
    await fs.writeFile(path.join(directory, 'index.wxss'), ':host{color:#000}\n')
  }
  await fs.writeFile(path.join(pageRoot, 'index.wxss'), 'page{background:#fff;padding:16px} .probe{display:block;margin-bottom:8px;min-height:28px} button{margin-top:12px}\n')
  await fs.writeFile(path.join(pageRoot, 'index.wxml'), `<view id="acceptance-root">
    <view id="atomic" class="probe {{classes.atomic}}">Atomic token and units</view>
    <view id="token" class="probe {{classes.fromToken}}">Token variable</view>
    <view id="layer-normal" class="probe {{classes.layerNormal}}">Ordered normal</view>
    <view id="layer-important" class="probe {{classes.layerImportant}}">Ordered important</view>
    <view id="collision-dot" class="probe {{classes.collisionDot}}">Dot name</view>
    <view id="collision-literal" class="probe {{classes.collisionLiteral}}">Literal marker</view>
    <view id="runtime-color" class="probe {{classes.dynamic}}" style="{{runtimeStyle}}">Runtime variable</view>
    <view id="recipe" class="probe {{recipeClass}}">Named recipe {{mode}}</view>
    <view id="inline-recipe" class="probe {{inlineClass}}">Inline recipe</view>
    <view id="slot-root" class="probe {{slotClasses.root}}"><text id="slot-label" class="{{slotClasses.label}}">Slot recipe {{mode}}</text></view>
    <view id="inline-slot-root" class="probe {{inlineSlotClasses.root}}"><text id="inline-slot-label" class="{{inlineSlotClasses.label}}">Inline slot recipe {{mode}}</text></view>
    <view id="unit-layout" class="{{classes.layoutParent}}"><view id="negative-unit" class="{{classes.negativeUnit}}"></view><view id="calc-unit" class="{{classes.calcUnit}}"></view></view>
    <shared-panda-probe panda-class="{{classes.atomic}}" />
    <isolated-panda-probe panda-class="{{classes.atomic}}" />
    <button id="toggle" bindtap="toggle">Toggle variants</button>
  </view>\n`)
  await fs.writeFile(path.join(pageRoot, 'index.js'), `const fixture=require('../../generated/classes');
    Page({data:{classes:fixture.classes,mode:'neutral',runtimeStyle:fixture.runtimeStyle.neutral,
      recipeClass:fixture.classes.neutral,inlineClass:fixture.classes.inlineDefault,slotClasses:fixture.classes.slotsNeutral,inlineSlotClasses:fixture.classes.inlineSlotsNeutral},
      setAccent(){this.setData({mode:'accent',runtimeStyle:fixture.runtimeStyle.accent,recipeClass:fixture.classes.accent,inlineClass:fixture.classes.inlineAccent,slotClasses:fixture.classes.slotsAccent,inlineSlotClasses:fixture.classes.inlineSlotsAccent})},
      setNeutral(){this.setData({mode:'neutral',runtimeStyle:fixture.runtimeStyle.neutral,recipeClass:fixture.classes.neutral,inlineClass:fixture.classes.inlineDefault,slotClasses:fixture.classes.slotsNeutral,inlineSlotClasses:fixture.classes.inlineSlotsNeutral})},
      toggle(){this.data.mode==='neutral'?this.setAccent():this.setNeutral()}
    });\n`)
  await fs.writeFile(path.join(root, 'project.config.json'), JSON.stringify({ appid, libVersion, compileType: 'miniprogram', projectname: `packed-panda-${panda}`, miniprogramRoot: 'miniprogram/', setting: { es6: true, minified: false, urlCheck: false } }, null, 2))
  const expectations = {
    fixed: {
      '#atomic': { color: '#2463eb', paddingRpx: 32, fontSizeRpx: 32, widthRpx: 32 },
      '#token': { paddingRpx: 32 },
      '#layer-normal': { color: '#2040c0' },
      '#layer-important': { color: '#208020' },
      '#collision-dot': { color: '#112233' },
      '#collision-literal': { color: '#445566' },
    },
    neutral: {
      '#runtime-color': { color: '#2463eb' },
      '#recipe': { color: scenario.tokens.gray700, fontWeight: '400', backgroundColor: 'transparent', paddingRpx: 32 },
      '#inline-recipe': { color: scenario.tokens.gray700, fontWeight: '400', backgroundColor: 'transparent', paddingRpx: 16 },
      '#slot-root': { backgroundColor: scenario.tokens.gray100, paddingRpx: 16 },
      '#slot-label': { color: scenario.tokens.gray700 },
      '#inline-slot-root': { fontWeight: '400', paddingRpx: 16 },
      '#inline-slot-label': { color: scenario.tokens.brand },
    },
    accent: {
      '#runtime-color': { color: '#db2777' },
      '#recipe': { color: '#2463eb', fontWeight: '700', backgroundColor: scenario.tokens.yellow100, paddingRpx: 32 },
      '#inline-recipe': { color: '#2463eb', fontWeight: '700', backgroundColor: scenario.tokens.yellow100, paddingRpx: 16 },
      '#slot-root': { backgroundColor: scenario.tokens.blue100, paddingRpx: 16 },
      '#slot-label': { color: '#2463eb' },
      '#inline-slot-root': { fontWeight: '700', paddingRpx: 16 },
      '#inline-slot-label': { color: scenario.tokens.brand },
    },
  }
  const layout = {
    parent: '#unit-layout',
    parentWidthRpx: 240,
    parentHeightRpx: 120,
    children: {
      '#negative-unit': { leftRpx: -8, topRpx: -4, widthRpx: 32, heightRpx: 16 },
      '#calc-unit': { leftRpx: 16, topRpx: 48, widthRpx: 208, widthInsetRpx: 32, heightRpx: 16 },
    },
  }
  return { root, miniprogramRoot: miniRoot, pagePath: '/pages/index/index', scenario, expectations, components, layout }
}
