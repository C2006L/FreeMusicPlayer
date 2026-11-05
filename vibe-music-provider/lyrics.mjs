// Keep upstream text intact. Timing/channel interpretation belongs to the shared
// client parser; never flatten romanization and translation into the original.
const text = value => typeof value === 'string' ? value : typeof value?.lyric === 'string' ? value.lyric : ''
export function lyricPayload(data, source = '') {
  return {
    lyric: text(data?.lyric) || text(data?.lrc),
    tlyric: text(data?.tlyric) || text(data?.translatedLyric) || text(data?.translation),
    romalrc: text(data?.romalrc) || text(data?.roma) || text(data?.romanization),
    source,
  }
}
export async function resolveLyrics({ source, preferSeparated = false, readMeting, readGo }) {
  let separated, failure
  if (readMeting) {
    try {
      separated = lyricPayload(await readMeting(), `${source} · Meting`)
      if (separated.lyric && (preferSeparated || separated.tlyric || separated.romalrc)) return separated
    } catch (error) { failure = error }
  }
  if (readGo) {
    try {
      const combined = lyricPayload(await readGo(), `${source} · GoMusicAPI`)
      return combined.lyric ? combined : separated || combined
    } catch (error) { failure = error }
  }
  if (separated?.lyric) return separated
  if (failure) throw failure
  return separated || lyricPayload({}, source)
}
// Bounded cache coalesces requests; empty results expire quickly, failures never
// become a cached 'no lyrics'. Keys include engine, ID and edition metadata.
export class LyricCache {
  entries = new Map()
  pending = new Map()
  async get(key, loader) {
    const hit = this.entries.get(key)
    if (hit?.until > Date.now()) return hit.value
    if (this.pending.has(key)) return this.pending.get(key)
    if (this.pending.size >= 32) throw new Error('lyric service busy')
    const task = Promise.resolve().then(loader).then(value => {
      this.entries.delete(key)
      this.entries.set(key, { value, until: Date.now() + (value.lyric?.trim() ? 600000 : 15000) })
      while (this.entries.size > 300) this.entries.delete(this.entries.keys().next().value)
      return value
    }).finally(() => this.pending.delete(key))
    this.pending.set(key, task)
    return task
  }
}
