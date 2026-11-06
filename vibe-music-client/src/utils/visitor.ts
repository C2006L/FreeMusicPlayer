const STORAGE_KEY = 'fmp-visitor-id'
let cached = ''

const createId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = (Math.random() * 16) | 0
    return (char === 'x' ? random : (random & 0x3) | 0x8).toString(16)
  })
}

/** 持久匿名访客标识：仅用于匿名试用统计，不含任何设备或网络指纹。 */
export const getVisitorId = () => {
  if (cached) return cached
  try {
    cached = localStorage.getItem(STORAGE_KEY) || ''
  } catch {
    cached = ''
  }
  if (!cached) {
    cached = createId()
    try {
      localStorage.setItem(STORAGE_KEY, cached)
    } catch {
      // 隐私模式下写入失败时，本次会话仍可匿名统计。
    }
  }
  return cached
}
