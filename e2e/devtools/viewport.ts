import type { SdkRequest } from './lifecycle.ts'
import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import fs from 'node:fs/promises'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { chromium } from '@playwright/test'
import { withCleanup } from './lifecycle.ts'

export async function settleViewport(runtime: { pageScrollTo: (top: number) => Promise<void> }, request: SdkRequest) {
  await request(() => runtime.pageScrollTo(0))
  // The scroll command resolves before the simulator's overlay scrollbars fade.
  // Give both neutral captures the same fixed quiet period; never retry a diff.
  await delay(1000)
}

export async function compareAppViewport(baseline: string, current: string, top: number, screenWidth: number, evidence: string) {
  const browser = await chromium.launch({ headless: true })
  await withCleanup(async () => {
    const page = await browser.newPage()
    const images = await Promise.all([baseline, current].map(async file => `data:image/png;base64,${(await fs.readFile(file)).toString('base64')}`))
    const result = await page.evaluate(async ({ images, top, screenWidth }) => {
      const captures = await Promise.all(images.map(async (url) => {
        const image = new Image()
        image.src = url
        await image.decode()
        return image
      }))
      const [first, second] = captures
      if (!first || !second || first.width !== second.width || first.height !== second.height) {
        throw new Error('CLI screenshots must have matching dimensions')
      }
      // Crop by measured viewport origin, never by observed diff locations.
      // The IDE's clock belongs to its device chrome, outside the app viewport.
      const cropTop = Math.ceil(top * first.width / screenWidth)
      if (!(cropTop > 0 && cropTop < first.height)) {
        throw new Error('Missing measured app viewport origin')
      }
      const crops = captures.map((image) => {
        const canvas = document.createElement('canvas')
        canvas.width = image.width
        canvas.height = image.height - cropTop
        const context = canvas.getContext('2d')!
        context.drawImage(image, 0, -cropTop)
        return { data: context.getImageData(0, 0, canvas.width, canvas.height).data, png: canvas.toDataURL('image/png') }
      })
      let diffPixels = 0
      for (let i = 0; i < crops[0]!.data.length; i += 4) {
        if ([0, 1, 2, 3].some(channel => crops[0]!.data[i + channel] !== crops[1]!.data[i + channel])) {
          diffPixels++
        }
      }
      return { diffPixels, cropTop, width: first.width, height: first.height - cropTop, baseline: crops[0]!.png, current: crops[1]!.png }
    }, { images, top, screenWidth })
    const { baseline: baselinePng, current: currentPng, ...metrics } = result
    await fs.writeFile(path.join(evidence, 'cli-viewport-baseline.png'), Buffer.from(baselinePng.split(',')[1]!, 'base64'))
    await fs.writeFile(path.join(evidence, 'cli-viewport-current.png'), Buffer.from(currentPng.split(',')[1]!, 'base64'))
    await fs.writeFile(path.join(evidence, 'cli-viewport-compare.json'), JSON.stringify({ ...metrics, viewportTop: top, screenWidth }, null, 2))
    assert.equal(result.diffPixels, 0, 'Repeated CLI captures must have identical app viewport pixels')
  }, [() => browser.close()])
}
