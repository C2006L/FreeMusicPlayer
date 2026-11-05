import { UserStore } from '@/stores/modules/user'
import type { LyricPayload } from '@/utils/lyricLines'
import { resolveApiBase } from '@/utils/apiBase'
const base = resolveApiBase()
async function request(path: string, options: RequestInit = {}, timeout = 10000) {
  const token = UserStore().userInfo?.token
  const response = await fetch(base + path, { credentials: 'include', ...options, headers: {
    'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers,
  }, signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(timeout)]) : AbortSignal.timeout(timeout) })
  if (!response.ok) throw new Error(response.status === 429 ? '任务过多，请稍后重试' : '歌词服务请求失败，请稍后重试')
  const result = await response.json()
  if (result.code !== 0) throw new Error(result.message || result.msg || '歌词请求失败')
  return result.data
}
export async function fetchLyrics(source: string, id: string, metadata: Record<string, unknown>, signal: AbortSignal): Promise<LyricPayload> {
  const params = new URLSearchParams({ source, id })
  Object.entries(metadata).forEach(([key, value]) => { if (value != null) params.set(key, String(value)) })
  return request('/song/lyricOnline?' + params, { signal }, 25000)
}
export async function findLyrics(query: string, signal: AbortSignal) {
  const params = new URLSearchParams({ keyword: query, sources: 'netease,qq,migu', limit: '8' })
  return request('/song/searchOnline?' + params, { signal }, 25000)
}
export type TranslationJob = { id: string; status: string; processed: number; total: number; error: string; lines: { id: number; text: string }[] }
export const startTranslation = (lines: { id: number; text: string }[], signal: AbortSignal): Promise<TranslationJob> =>
  request('/agent/lyrics/translations', { method: 'POST', body: JSON.stringify({ lines }), signal })
export const translationStatus = (id: string, signal: AbortSignal): Promise<TranslationJob> => request('/agent/lyrics/translations/' + id, { signal })
export const cancelTranslation = (id: string) => request('/agent/lyrics/translations/' + id, { method: 'DELETE' })
