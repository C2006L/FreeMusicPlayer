import { UserStore } from '@/stores/modules/user'
import type { Song } from '@/api/interface'
import { createSseParser } from '@/utils/sse'

const BASE_URL = import.meta.env.VITE_APP_BASE_API || 'http://localhost:18080'
export const cancelAgentChat = async () => {
  const token = UserStore().userInfo?.token
  await fetch(`${BASE_URL}/agent/cancel`, { method: 'POST', credentials: 'include',
    headers: token ? { Authorization: `Bearer ${token}` } : {}, signal: AbortSignal.timeout(5000) })
}
export const getAgentStatus = async () => {
  const response = await fetch(`${BASE_URL}/agent/status`, { credentials: 'include', signal: AbortSignal.timeout(5000) })
  if (!response.ok) throw new Error(`AI 状态不可用（HTTP ${response.status}），请检查后端版本`)
  return response.json() as Promise<{ configured: boolean; provider: string; model: string; message: string }>
}

export const streamAgentChat = async (
  conversationId: string, query: string, onDelta: (delta: string) => void,
  signal?: AbortSignal, onSongs?: (songs: Song[]) => void
): Promise<void> => {
  const controller = new AbortController()
  let timedOut = false
  const abort = () => controller.abort()
  signal?.addEventListener('abort', abort, { once: true })
  if (signal?.aborted) abort()
  const timeout = setTimeout(() => { timedOut = true; controller.abort() }, 120000)
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
  try {
    const token = UserStore().userInfo?.token
    const response = await fetch(`${BASE_URL}/agent/chat`, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ conversationId, query }), signal: controller.signal,
    })
    if (!response.ok || !response.body) {
      throw new Error(response.status === 404 ? '机器人接口不存在，请启动新版 FreeMusicPlayer 后端'
        : response.status === 429 ? '请求过于频繁，请先结束当前回复或稍后重试' : `AI 请求失败（HTTP ${response.status}）`)
    }
    if (!response.headers.get('content-type')?.includes('text/event-stream')) throw new Error('服务响应格式异常，请检查后端地址')
    let completed = false
    const parser = createSseParser(({ event, data }) => {
      if (event === 'error') throw new Error(data)
      if (event === 'songs') {
        const songs = JSON.parse(data)
        if (Array.isArray(songs)) onSongs?.(songs.filter(s => s && s.songId && s.songName && s.audioUrl))
      } else if (event === 'done' || data === '[DONE]') completed = true
      else if (event === 'text' || event === 'message') onDelta(data)
    })
    reader = response.body.getReader()
    const decoder = new TextDecoder()
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      parser.push(decoder.decode(value, { stream: true }))
    }
    parser.push(decoder.decode())
    parser.finish()
    if (!completed) throw new Error('回复连接提前结束，请重试')
  } catch (error) {
    if (timedOut) throw new Error('AI 回复超时，请检查本地模型运行状态或缩短问题后重试')
    throw error
  } finally {
    clearTimeout(timeout)
    signal?.removeEventListener('abort', abort)
    await reader?.cancel().catch(() => {})
  }
}
