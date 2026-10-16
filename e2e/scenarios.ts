/** User-visible contracts shared by browser and real WeChat IDE acceptance. */
export function scenarioState(active: boolean): Record<string, Record<string, string>> {
  return {
    'scenario-recipe': {
      'background-color': active ? 'rgb(2, 132, 199)' : 'rgb(226, 232, 240)',
      'color': active ? 'rgb(255, 255, 255)' : 'rgb(51, 65, 85)',
    },
    'scenario-slot-root': { 'background-color': active ? 'rgb(224, 242, 254)' : 'rgb(241, 245, 249)' },
    'scenario-slot-label': { color: active ? 'rgb(2, 132, 199)' : 'rgb(71, 85, 105)' },
    'scenario-variable': { 'color': active ? 'rgb(190, 18, 60)' : 'rgb(15, 118, 110)', 'padding-left': active ? '12px' : '8px' },
    'scenario-normal': { color: active ? 'rgb(22, 163, 74)' : 'rgb(2, 132, 199)' },
    'scenario-important': { color: active ? 'rgb(234, 88, 12)' : 'rgb(124, 58, 237)' },
  }
}

export const importColors = {
  'scenario-import-normal': 'rgb(2, 132, 199)',
  'scenario-import-important': 'rgb(220, 38, 38)',
  'scenario-import-unlayered': 'rgb(17, 24, 39)',
  'scenario-import-same-layer': 'rgb(22, 163, 74)',
}

export const preprocessorCases = [
  { language: 'sass', color: 'rgb(18, 52, 86)', space: 0.25 },
  { language: 'less', color: 'rgb(35, 69, 103)', space: 0.5 },
  { language: 'stylus', color: 'rgb(52, 86, 120)', space: 0.75 },
] as const

export const remLengths = [
  ['scenario-units', 'width', 10],
  ['scenario-units', 'padding-top', 0.001],
  ['scenario-units', 'margin-top', -0.5],
  ['scenario-units', 'margin-bottom', -2],
  ['scenario-token', 'padding-left', 1.25],
  ['scenario-import-nested', 'margin-left', 0.25],
  ['scenario-unicode', 'padding-left', 0.5],
  ['scenario-marker', 'padding-left', 0.75],
] as const
