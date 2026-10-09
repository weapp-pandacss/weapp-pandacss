/** Self-contained implementation embedded into Panda's generated runtime. */
export function createPortableRuntime() {
  function encodeClassName(value: string): string {
    let result = ''
    let offset = 0
    for (const char of value) {
      const reserved = char === '_' && value.startsWith('_wp_', offset)
      const invalidHead = offset === 0 && /[0-9-]/.test(char)
      result += reserved || invalidHead || !/^[\w-]$/.test(char)
        ? `_wp_${char.codePointAt(0)!.toString(16)}_`
        : char
      offset += char.length
    }
    return result
  }

  function encodeClassList(value: string): string {
    return value.split(/\s+/).filter(Boolean).map(encodeClassName).join(' ')
  }

  return { encodeClassName, encodeClassList }
}

export const { encodeClassName, encodeClassList } = createPortableRuntime()
