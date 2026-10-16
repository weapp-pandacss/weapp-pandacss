export interface RpxSystemInfo {
  windowWidth: number
  platform: string
  pixelRatio: number
}

/**
 * Source: official IDE WeappVendor/3.13.2.wxvpkg -> /WAWebview.js.
 * Match the pinned SDK's transformRpxForCompiler (fixZeroRpx enabled),
 * installed as window.__transformRpx__ for compiled WXSS. The SDK floors the
 * absolute magnitude with a 1e-4 tolerance, applies the nonzero pixel minimum,
 * then restores the sign. iOS with a DPR other than one permits half a CSS pixel.
 */
export function expectedRpx(value: number, { windowWidth, platform, pixelRatio }: RpxSystemInfo) {
  if (value === 0) {
    return 0
  }
  const magnitude = Math.floor(Math.abs(value) / 750 * windowWidth + 1e-4)
  const minimum = platform === 'ios' && pixelRatio !== 1 ? 0.5 : 1
  return Math.sign(value) * (magnitude || minimum)
}
