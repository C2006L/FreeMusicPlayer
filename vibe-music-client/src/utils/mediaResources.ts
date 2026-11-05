import type { trackModel } from '@/stores/interface'

const parse = (value?: string) => { try { return new URL(value || '', 'http://local.invalid') } catch { return null } }
const proxyQuery = (value?: string) => {
  const url = parse(value)
  return url && /\/(?:streamOnline|coverOnline)$/.test(url.pathname) ? url.searchParams : new URLSearchParams()
}

// Reconstruct from stable platform IDs, never keep the old backend host/port or
// persist an upstream signed media URL as the source of truth.
export const rebuildOnlineTrack = (track: trackModel, apiBase: string, fresh = false): trackModel => {
  const audio = proxyQuery(track.url), cover = proxyQuery(track.cover)
  const identity = String(track.id || '').match(/^online:([^:]+):(.+)$/)
  const source = track.source && track.source !== 'local' ? track.source : identity?.[1] || audio.get('source') || ''
  if (!source) return { ...track }
  const songId = track.sourceSongId || identity?.[2] || audio.get('id') || ''
  const id = track.sourceUrlId || audio.get('id') || songId
  if (!id) return { ...track }
  const engine = track.providerEngine || audio.get('engine') || cover.get('engine')
    || (['qq', 'migu', 'qianqian', 'jamendo', 'bilibili', 'fivesing', 'joox', 'soda'].includes(source) ? 'go-music-api' : 'meting')
  const picId = track.sourcePicId || cover.get('id') || ''
  const originalCover = cover.get('cover') || (/^https?:\/\//i.test(picId) ? picId : '')
  const extra = track.sourceExtra || audio.get('extra') || '{}'
  const common = { source, name: track.title || '', artist: track.artist || '', engine }
  const query = new URLSearchParams({ ...common, id, album: track.album || '', duration: String(Number(track.duration) || 0), extra })
  if (originalCover) query.set('cover', originalCover)
  if (fresh) query.set('_refresh', String(Date.now()))
  const root = apiBase.replace(/\/$/, '')
  const coverQuery = new URLSearchParams({ ...common, id: picId, cover: originalCover })
  return { ...track, source, sourceSongId: songId, sourceUrlId: id, sourcePicId: picId,
    sourceExtra: extra, providerEngine: engine, url: `${root}/song/streamOnline?${query}`,
    cover: picId ? `${root}/song/coverOnline?${coverQuery}` : track.cover }
}
