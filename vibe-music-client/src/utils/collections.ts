import type { trackModel } from '@/stores/interface'

export const bilibiliBvid = (track: Partial<trackModel>) => {
  if (track.source !== 'bilibili' && !String(track.id).startsWith('online:bilibili:')) return ''
  let extra: Record<string, string> = {}
  try { extra = JSON.parse(track.sourceExtra || '{}') } catch { /* Old queue may lack metadata. */ }
  return [extra.bvid, track.sourceSongId, track.sourceUrlId, track.id].map(value => String(value || '').match(/BV[a-zA-Z0-9]{10}/)?.[0]).find(Boolean) || ''
}
const key = (track: trackModel) => `${track.source || ''}:${track.sourceSongId || track.id}`
// Many multipart titles repeat a very long video title before each part name.
// Keep the full upstream name in the directory tooltip, show the actual part.
export const collectionEntryTitle = (title: string) => {
  const separator = title.indexOf(' - ')
  return separator >= 40 ? title.slice(separator + 3).trim() : title
}
export const insertCollection = (queue: trackModel[], index: number, members: trackModel[]) => {
  if (index < 0 || index >= queue.length || !members.length) throw new Error('播放队列已改变，请重新打开合集')
  const seen = new Set<string>()
  const tracks = members.filter(track => { const id = key(track); if (seen.has(id)) return false; seen.add(id); return true })
  const before = queue.slice(0, index).filter(track => !seen.has(key(track)))
  const after = queue.slice(index + 1).filter(track => !seen.has(key(track)))
  return { tracks: [...before, ...tracks, ...after], index: before.length }
}
