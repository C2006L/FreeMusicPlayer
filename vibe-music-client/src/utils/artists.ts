import type { Song } from '@/api/interface'

export const normalizeArtist = (name: string) => name.trim().normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, ' ')
// Delimiters inside names (AC/DC, Simon & Garfunkel) are preserved. Platform
// comma-separated contributor lists can be split without inventing artist IDs.
export const artistNames = (raw: string) => raw.split(/[,，、;；]|\s+\/\s+|\s+(?:feat\.?|ft\.?)\s+/i).map(n => n.trim()).filter(Boolean)
export type RelatedArtist = {
  key: string
  name: string
  source: string
  sourceName: string
  count: number
  coverUrl: string
  sampleSongName: string
}

export const relatedArtists = (songs: Song[], query: string): RelatedArtist[] => {
  const needle = normalizeArtist(query)
  const map = new Map<string, RelatedArtist>()
  for (const song of songs) for (const name of artistNames(song.artistName || '')) {
    if (!normalizeArtist(name).includes(needle)) continue
    const source = song.source === 'tencent' ? 'qq' : song.source || 'local'
    const key = `${source}:${normalizeArtist(name)}`
    const existing = map.get(key)
    if (existing) {
      existing.count++
      if (!existing.coverUrl && song.coverUrl) existing.coverUrl = song.coverUrl
    } else {
      map.set(key, {
        key, name, source, sourceName: song.sourceName || source, count: 1,
        coverUrl: song.coverUrl || '', sampleSongName: song.songName || '',
      })
    }
  }
  return [...map.values()].sort((a, b) => Number(normalizeArtist(b.name) === needle) - Number(normalizeArtist(a.name) === needle) || b.count - a.count)
}
