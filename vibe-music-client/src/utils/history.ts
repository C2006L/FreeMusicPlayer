import type { trackModel } from '@/stores/interface'

export interface PlayedEntry { track: trackModel; playedAt: number; position: number }
export const historyKey = (track: trackModel) => track.sourceSongId
  ? `${track.providerEngine || ''}:${track.source || ''}:${track.sourceSongId}` : String(track.id)
export const recordPlayedEntry = (entries: PlayedEntry[], track: trackModel, position: number, now = Date.now()): PlayedEntry[] => {
  // Snapshot only serializable track fields; lyrics are fetched separately.
  const { lyric: _lyric, translatedLyric: _translated, playbackStatus: _status, ...snapshot } = track
  return [{ track: { ...snapshot }, playedAt: now, position: Math.max(0, position) },
    ...entries.filter(entry => historyKey(entry.track) !== historyKey(track))].slice(0, 60)
}
