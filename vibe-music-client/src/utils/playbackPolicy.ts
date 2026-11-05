// Pure rules shared by playback, search results and tests. A working URL or a
// long media duration alone is not evidence that the entire recording plays.
export type PlaybackEvidence = 'unknown' | 'duration-matched' | 'full' | 'preview' | 'unavailable'
interface Recording {
  title: string; artist: string; album?: string; duration?: number
  availability?: string; vip?: boolean
}
const normalize = (s: string) => String(s || '').normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '')
const contributors = (s: string) => String(s || '').split(/[,，、;；]|\s+\/\s+|\s+(?:feat\.?|ft\.?)\s+/i).map(normalize).filter(Boolean).sort()
// Do not collapse live, remastered, acoustic, instrumental or cover editions.
const edition = (s: string) => String(s || '').normalize('NFKC').toLowerCase()
  .match(/live|现场|演唱会|remix|混音|cover|翻唱|伴奏|instrumental|acoustic|不插电|demo|remaster(?:ed)?|重制|sped.?up|slowed|加速|降速/g)?.sort().join('|') || ''

export const sameRecording = (candidate: Recording, original: Recording) => {
  if (['preview', 'unavailable'].includes(candidate.availability || '')) return false
  if (normalize(candidate.title) !== normalize(original.title)) return false
  const artists = contributors(original.artist)
  if (!artists.length || artists.join('|') !== contributors(candidate.artist).join('|')) return false
  if (edition(`${candidate.title} ${candidate.album || ''}`) !== edition(`${original.title} ${original.album || ''}`)) return false
  // Missing duration is not enough evidence for automatic replacement.
  const a = Number(candidate.duration), b = Number(original.duration)
  return a > 0 && b > 0 && Math.abs(a - b) <= Math.max(3, b * 0.02)
}

export const classifyMedia = (expected: number, actual: number): PlaybackEvidence => {
  if (!Number.isFinite(actual) || actual <= 0) return 'unknown'
  // A genuine short recording must not be mistaken for a membership trial.
  if (expected > actual + 15 && actual <= 95 && actual / expected < 0.8) return 'preview'
  if (expected > 0 && Math.abs(actual - expected) <= Math.max(3, expected * 0.02)) return 'duration-matched'
  return 'unknown'
}

// Automatic source switching only trusts proven complete audio. A search entry
// graded as a trial can be used as a notified last resort, never as a silent fallback.
export const alternativeTier = (candidate: Recording, evidence?: PlaybackEvidence): 'full' | 'preview' | 'reject' => {
  if (candidate.availability === 'full' || evidence === 'full') return 'full'
  if (candidate.availability === 'preview') return 'preview'
  return 'reject'
}

export const fullyPlayed = (duration: number, ranges: { length: number; start: (i: number) => number; end: (i: number) => number }) => {
  if (!Number.isFinite(duration) || duration <= 0) return false
  let covered = 0
  for (let i = 0; i < ranges.length; i++) covered += Math.max(0, Math.min(duration, ranges.end(i)) - Math.max(0, ranges.start(i)))
  return covered >= Math.max(duration * 0.98, duration - 2)
}

export const evidenceLabel = (state: PlaybackEvidence) => ({
  unknown: '完整性未知', 'duration-matched': '时长匹配', full: '完整播完', preview: '试听片段', unavailable: '播放失败',
})[state]
