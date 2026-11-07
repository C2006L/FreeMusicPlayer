export type LyricWord = { time: number; end?: number; text: string }
export type TimedLyricLine = { time: number; end?: number; text: string; translation?: string; romanization?: string; words?: LyricWord[] }
export type LyricDocument = { lines: TimedLyricLine[]; synced: boolean; source: string; translationSource: string }
export type LyricPayload = { lyric?: string; tlyric?: string; romalrc?: string; source?: string }
const stamp = /\[(\d{1,3}):(\d{1,2}(?:\.\d{1,3})?)\]/g
const seconds = (minutes: string, seconds: string) => Number(minutes) * 60 + Number(seconds)
const clean = (s: string) => s.replace(/\[(?:\d{1,3}:\d{1,2}(?:\.\d{1,3})?|[a-z]+:[^\]]*)\]/gi, '').replace(/<\d{1,3}:\d{1,2}(?:\.\d{1,3})?>/g, '').trim()
const message = /^(操作成功|请求成功|success|ok|暂无歌词|暂无可用歌词|纯音乐[，,]?请欣赏|此歌曲为没有填词的纯音乐)$/i
const han = (s: string) => /\p{Script=Han}/u.test(s)
const kana = (s: string) => /[\u3040-\u30ff]/u.test(s)
const hangul = (s: string) => /\p{Script=Hangul}/u.test(s)
const latin = (s: string) => /[a-z]/i.test(s) && !han(s) && !kana(s) && !hangul(s)
const identity = (s: string) => s.normalize('NFKC').replace(/\s+/g, ' ').trim()

export const parseTimedLyrics = (value = ''): TimedLyricLine[] => {
  if (typeof value !== 'string') return []
  const lines: TimedLyricLine[] = [], seen = new Set<string>(), pauses: number[] = []
  // LRC file offsets are subtracted; the UI's separate 'delay' is added.
  const offset = -Number(value.match(/\[offset:([+-]?\d+)\]/i)?.[1] || 0) / 1000
  for (const raw of value.slice(0, 262144).split(/\r?\n/).slice(0, 4000)) {
    const yrc = raw.match(/^\[(\d+),(\d+)\](.*)$/)
    if (yrc) {
      const words = [...yrc[3].matchAll(/\((\d+),(\d+),\d+\)([^()]*)/g)]
        .map(m => ({ time: Number(m[1]) / 1000 + offset, end: (Number(m[1]) + Number(m[2])) / 1000 + offset, text: m[3] }))
      const text = words.map(w => w.text).join('').trim()
      if (text) lines.push({ time: Math.max(0, Number(yrc[1]) / 1000 + offset), end: (Number(yrc[1]) + Number(yrc[2])) / 1000 + offset, text, words })
      continue
    }
    const times = [...raw.matchAll(stamp)].filter(m => Number(m[2]) < 60)
    const text = clean(raw)
    if (!text) pauses.push(...times.map(m => Math.max(0, seconds(m[1], m[2]) + offset)))
    if (!text || message.test(text) || !times.length) continue
    // [start]text[end] is an interval; [t1][t2]text is a repeated chorus.
    const leading = times.filter(m => !clean(raw.slice(0, m.index)).length)
    const tail = times.find(m => clean(raw.slice(0, m.index)).length > 0)
    const wordMatches = [...raw.matchAll(/<(\d{1,3}):(\d{1,2}(?:\.\d{1,3})?)>([^<\[]*)/g)]
    for (const match of leading) {
      const time = Math.max(0, seconds(match[1], match[2]) + offset)
      const end = tail ? seconds(tail[1], tail[2]) + offset : undefined
      const key = `${time}:${identity(text)}`
      if (seen.has(key)) continue
      seen.add(key)
      const words = wordMatches.filter(m => Number(m[2]) < 60).map((m, index) => ({ time: seconds(m[1], m[2]) + offset,
        end: wordMatches[index + 1] ? seconds(wordMatches[index + 1][1], wordMatches[index + 1][2]) + offset : end, text: m[3] }))
      lines.push({ time, text, ...(end != null && end > time ? { end } : {}), ...(words.length ? { words } : {}) })
    }
  }
  lines.sort((a, b) => a.time - b.time)
  const boundaries = [...new Set([...pauses, ...lines.map(l => l.time)])].sort((a, b) => a - b)
  for (const line of lines) {
    const next = boundaries.find(time => time > line.time)
    if (next != null && (line.end == null || line.end > next)) line.end = next
    const last = line.words?.at(-1)
    if (last && last.end == null && line.end != null) last.end = line.end
  }
  return lines
}

export function hasWordTiming(line: TimedLyricLine) {
  const words = line.words
  return !!words?.length && identity(words.map(w => w.text).join('')) === identity(line.text)
    && words.every((word, i) => Number.isFinite(word.time) && Number.isFinite(word.end) && word.time >= line.time
      && word.end! > word.time && (line.end == null || word.end! <= line.end)
      && (i === 0 || word.time >= words[i - 1].end!))
}

export function activeLyricIndex(lines: TimedLyricLine[], time: number) {
  let low = 0, high = lines.length - 1, found = -1
  while (low <= high) {
    const middle = (low + high) >>> 1
    if (lines[middle].time <= time) { found = middle; low = middle + 1 } else high = middle - 1
  }
  if (found < 0) return -1
  // 同一时间戳可能出现多行（双语对照、未合并的重复句）。二分找到的是最后一行，
  // 这里回退到该时间戳的首行，避免整组只高亮最后一行。
  while (found > 0 && lines[found - 1].time === lines[found].time) found--
  return lines[found].end == null || time < lines[found].end! ? found : -1
}

// Each auxiliary line is consumed once; never align by array index. Tolerance
// accommodates timestamp rounding without copying translations between verses.
export function alignChannel(original: TimedLyricLine[], extra: TimedLyricLine[], channel: 'translation' | 'romanization') {
  let previous = -1
  for (const line of extra) {
    let best = -1, distance = 0.351
    for (let index = previous + 1; index < original.length; index++) {
      const delta = Math.abs(original[index].time - line.time)
      if (delta < distance && !original[index][channel]) { best = index; distance = delta }
      if (original[index].time > line.time + 0.35) break
    }
    if (best >= 0) { original[best][channel] = line.text; previous = best }
  }
}

export function parseLyricDocument(payload: LyricPayload): LyricDocument {
  const raw = (payload.lyric || '').slice(0, 262144), parsed = parseTimedLyrics(raw)
  const groups = new Map<number, TimedLyricLine[]>()
  for (const line of parsed) { const group = groups.get(line.time) || []; group.push(line); groups.set(line.time, group) }
  const lines: TimedLyricLine[] = []
  for (const group of groups.values()) {
    // 按组判断语言，避免整份文件里出现一句日文就把其他组的英文原文 + 中文翻译拆开。
    const hasKana = group.some(l => kana(l.text)), hasHangul = group.some(l => hangul(l.text))
    let original: TimedLyricLine | undefined, translated: TimedLyricLine | undefined, roma: TimedLyricLine | undefined
    if (hasKana || hasHangul) {
      original = group.find(l => hasKana ? kana(l.text) : hangul(l.text))
      translated = group.find(l => l !== original && han(l.text) && !kana(l.text) && !hangul(l.text))
      roma = group.find(l => l !== original && latin(l.text))
    } else if (group.length === 2) {
      // 同一时间戳的「原文 + 译文」：一行中文、一行拉丁字母时按文件顺序保留原文，
      // 其余组合（两行同语种）不动，避免把两句真实歌词误并成译文。
      const first = group[0], second = group[1]
      const hanOnly = (text: string) => han(text) && !kana(text) && !hangul(text)
      if (hanOnly(first.text) !== hanOnly(second.text) && (latin(first.text) || latin(second.text))) {
        original = first
        if (hanOnly(second.text)) translated = second
        else if (latin(second.text)) roma = second
      }
    }
    if (original && (translated || roma) && group.every(l => [original, translated, roma].includes(l))) {
      lines.push({ ...original, translation: translated?.text, romanization: roma?.text })
    } else lines.push(...group)
  }
  if (!parsed.length) {
    const plain = raw.split(/\r?\n/).slice(0, 4000).map(clean).filter(t => t && !message.test(t) && !/^\[/.test(t))
    return { lines: plain.map(text => ({ time: -1, text })), synced: false, source: payload.source || '', translationSource: '' }
  }
  alignChannel(lines, parseTimedLyrics(payload.tlyric), 'translation')
  alignChannel(lines, parseTimedLyrics(payload.romalrc), 'romanization')
  lines.forEach((line, index) => { if (line.end == null && lines[index + 1]?.time > line.time) line.end = lines[index + 1].time })
  return { lines, synced: true, source: payload.source || '', translationSource: lines.some(l => l.translation) ? '音源提供' : '' }
}

export function lyricKey(track: { id?: string; source?: string; sourceSongId?: string; title?: string; artist?: string; album?: string }) {
  return JSON.stringify([track.source || 'local', track.sourceSongId || track.id, track.title, track.artist, track.album])
}
