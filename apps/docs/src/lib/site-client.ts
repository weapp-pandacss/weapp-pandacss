import { initializeCode } from './code-client'
import { initializeContents } from './contents-client'
import { initializeNavigation } from './navigation-client'
import { initializeTheme } from './theme-client'
import { initializeTooltips } from './tooltip-client'

export function initializeSite() {
  initializeTheme()
  initializeNavigation()
  initializeCode()
  initializeContents()
  initializeTooltips()
}
