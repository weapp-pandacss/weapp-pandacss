const wrapperPostcssPlugin = 'postcss-weapp-pandacss-escape-wrapper-plugin'
const escapePostcssPlugin = 'postcss-weapp-pandacss-escape-plugin'
const namingMarker = Symbol.for('weapp-pandacss.postcss.naming')
const portableCssMarker = '! weapp-pandacss:portable-v1'

export { escapePostcssPlugin, namingMarker, portableCssMarker, wrapperPostcssPlugin }
