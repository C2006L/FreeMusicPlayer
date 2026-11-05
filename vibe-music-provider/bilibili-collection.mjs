export const loadBilibiliCollection = async (apiBase, bvid, normalizeSongs, fetchImpl = fetch) => {
  if (!/^BV[a-zA-Z0-9]{10}$/.test(bvid)) throw new Error('invalid bilibili bvid')
  // Fixed canonical URL only: never let a client choose an arbitrary fetch URL.
  const params = new URLSearchParams({ q: `https://www.bilibili.com/video/${bvid}`, type: 'song', sources: 'bilibili' })
  const response = await fetchImpl(`${apiBase}/api/v1/music/search?${params}`, { signal: AbortSignal.timeout(30000) })
  if (!response.ok) throw new Error('bilibili collection unavailable')
  const payload = await response.json()
  const rows = payload?.data?.songs
  if (!Array.isArray(rows) || !rows.length) throw new Error('empty bilibili collection')
  if (rows.length > 1000) throw new Error('collection exceeds 1000 entries; refusing to return a truncated directory')
  const seen = new Set()
  const songs = normalizeSongs(rows.filter(row => row.source === 'bilibili'), 1000).filter(song => {
    if (!/^BV[a-zA-Z0-9]{10}\|\d+$/.test(song.id)) return false
    if (seen.has(song.id)) return false
    seen.add(song.id)
    return true
  })
  if (!songs.length) throw new Error('collection has no playable identifiers')
  // Do not sort by relevance: upstream directory order is significant.
  return { bvid, songs, count: songs.length }
}
