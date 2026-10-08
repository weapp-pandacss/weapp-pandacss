function normalizeString(strs: string | string[], separator = ',') {
  if (Array.isArray(strs)) {
    return strs.join(separator)
  }
  return strs
}
// https://github.com/vuejs/vue/blob/49b6bd4264c25ea41408f066a1835f38bf6fe9f1/src/v3/reactivity/computed.ts#L37
function ref<T>(value: T) {
  return {
    value,
  }
}

type Ref<T> = ReturnType<typeof ref<T>>

export { normalizeString, ref, Ref }

export { default as merge } from 'merge'
