// Read timing from the original response before Meting's normalized format
// discards it. Join by platform ID/hash, never by title or result position.
export function metingMetadata(source, raw) {
  let data
  try { data = typeof raw === 'string' ? JSON.parse(raw) : raw } catch { return new Map() }
  const rows = source === 'netease' ? data?.result?.songs
    : source === 'tencent' ? data?.data?.song?.list : source === 'kugou' ? data?.data?.info : []
  const map = new Map()
  for (const item of Array.isArray(rows) ? rows : []) {
    const row = item.musicData || item
    const id = source === 'netease' ? row.id : source === 'tencent' ? row.songmid : row.hash
    const duration = source === 'netease' ? Number(row.dt ?? row.duration) / 1000 : Number(source === 'tencent' ? row.interval : row.duration)
    if (id == null) continue
    map.set(String(id).toLowerCase(), { duration: Number.isFinite(duration) && duration > 0 ? duration : 0 })
  }
  return map
}
