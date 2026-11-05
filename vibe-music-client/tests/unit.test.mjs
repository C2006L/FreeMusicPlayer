import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

const load = async path => {
  const code = ts.transpile((await readFile(new URL(path, import.meta.url), 'utf8')), { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 })
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
}
const { createSseParser } = await load('../src/utils/sse.ts')
const { relatedArtists, artistNames } = await load('../src/utils/artists.ts')
const { sameRecording, classifyMedia, fullyPlayed, alternativeTier } = await load('../src/utils/playbackPolicy.ts')
const { rebuildOnlineTrack } = await load('../src/utils/mediaResources.ts')
const { recordPlayedEntry } = await load('../src/utils/history.ts')
const { bilibiliBvid, insertCollection, collectionEntryTitle } = await load('../src/utils/collections.ts')
const { parseTimedLyrics, parseLyricDocument, lyricKey, activeLyricIndex, hasWordTiming } = await load('../src/utils/lyricLines.ts')
const { LyricTranslationSession } = await load('../src/utils/lyricTranslationSession.ts')
const { reusableLyrics, LYRIC_SCHEMA } = await load('../src/utils/lyricStorage.ts')
const { searchRank } = await load('../src/utils/searchRanking.ts')
test('artist matches stay ahead of titles mentioning that artist across platforms',()=>{
 assert.ok(searchRank({songName:'童年',artistName:'罗大佑'},'罗大佑')>searchRank({songName:'罗大佑（你的样子）',artistName:'Other'},'罗大佑'))
})
test('combined title and artist queries prefer exact metadata over concatenated video titles',()=>{
 assert.ok(searchRank({songName:'童年',artistName:'罗大佑',duration:233},'童年 罗大佑')>searchRank({songName:'童年 罗大佑 经典音乐合集',artistName:'Other'},'童年 罗大佑'))
 assert.ok(searchRank({songName:'童年',artistName:'罗大佑',duration:233},'童年')>searchRank({songName:'童年',artistName:'罗大佑',duration:0},'童年'))
})
test('verified full search results rank ahead of unknown and trial entries', () => {
  const base = { songName: '童年', artistName: '罗大佑', duration: 233 }
  assert.ok(searchRank({ ...base, availability: 'full' }, '童年 罗大佑') > searchRank(base, '童年 罗大佑'))
  assert.ok(searchRank(base, '童年 罗大佑') > searchRank({ ...base, availability: 'preview' }, '童年 罗大佑'))
  assert.ok(searchRank({ ...base, availability: 'preview' }, '童年 罗大佑') > searchRank({ ...base, availability: 'unavailable' }, '童年 罗大佑'))
})

test('collection insertion preserves surrounding queue and original directory order', () => {
  const track = id => ({ id, source: 'bilibili', sourceSongId: id })
  const result = insertCollection([track('before'), track('p1'), track('after'), track('p2')], 1, [track('p1'), track('p2'), track('p3')])
  assert.deepEqual(result.tracks.map(t => t.id), ['before', 'p1', 'p2', 'p3', 'after'])
  assert.equal(result.index, 1)
  assert.equal(bilibiliBvid({ source: 'bilibili', sourceSongId: 'BV1DG4y187sw|123' }), 'BV1DG4y187sw')
  assert.equal(bilibiliBvid({ source: 'netease', sourceSongId: 'BV1DG4y187sw' }), '')
  assert.throws(() => insertCollection([], -1, [track('p1')]))
  assert.equal(collectionEntryTitle('长视频标题'.repeat(12) + ' - 第二首歌'), '第二首歌')
  assert.equal(collectionEntryTitle('A - B'), 'A - B')
})

test('status messages and empty lyrics never become lyric lines', () => {
  assert.deepEqual(parseTimedLyrics('操作成功'), [])
  assert.deepEqual(parseTimedLyrics('[00:00]操作成功\n[01:75]bad timestamp'), [])
  assert.deepEqual(parseTimedLyrics('[00:03.50]真实歌词\n[00:01][00:02]重复行').map(line => line.time), [1, 2, 3.5])
})

test('trailing timestamps are interval ends, leading timestamps preserve repeated choruses', () => {
  const rows = parseTimedLyrics('[00:10]same[00:14]\n[00:10]same[00:14]\n[00:20][00:30]chorus')
  assert.deepEqual(rows.map(l => [l.time, l.text]), [[10, 'same'], [20, 'chorus'], [30, 'chorus']])
  assert.equal(rows[0].end, 14)
})
test('co-timed Japanese original, romanization and translation become one lyric unit', () => {
  const doc = parseLyricDocument({ lyric: '[00:10]心配したって[00:14]\n[00:10]shi n pa i shi ta tte[00:14]\n[00:10]即使担心[00:14]\n[00:20]心配したって[00:24]\n[00:20]shi n pa i shi ta tte[00:24]' })
  assert.equal(doc.lines.length, 2)
  assert.equal(doc.lines[0].text, '心配したって')
  assert.equal(doc.lines[0].translation, '即使担心')
  assert.equal(doc.lines[0].romanization, 'shi n pa i shi ta tte')
  assert.equal(doc.lines[1].time, 20, 'actual later repetition is retained')
})
test('translation alignment tolerates rounding but never reuses lines or pairs by array index', () => {
  const doc = parseLyricDocument({ lyric: '[00:10.188]Hello\n[00:11.000]World\n[00:30]Again', tlyric: '[00:10.18]你好\n[00:11.10]世界\n[00:35]错位' })
  assert.deepEqual(doc.lines.map(l => l.translation), ['你好', '世界', undefined])
})
test('plain text remains readable without invented timestamps; status messages are not lyrics', () => {
  const doc = parseLyricDocument({ lyric: '[ar:Artist]\nPlain first line\nPlain second line' })
  assert.equal(doc.synced, false)
  assert.deepEqual(doc.lines.map(l => l.time), [-1, -1])
  assert.equal(parseLyricDocument({ lyric: '操作成功' }).lines.length, 0)
})
test('explicit word timing stays within one sentence and LRC offset is applied', () => {
  const yrc = parseTimedLyrics('[1000,2000](1000,500,0)Hello (1500,1500,0)world')
  assert.equal(yrc.length, 1); assert.equal(yrc[0].words.length, 2); assert.equal(yrc[0].end, 3)
  const lrc = parseTimedLyrics('[offset:100]\n[00:01]<00:01>Hello <00:02>world[00:03]')
  assert.equal(lrc[0].time, 0.9); assert.equal(lrc[0].words.length, 2)
})
test('lyrics persistence distinguishes platform, song and recording edition', () => {
  const base = { id: '1', source: 'netease', title: 'Song', artist: 'Artist', album: 'Studio' }
  assert.notEqual(lyricKey(base), lyricKey({ ...base, album: 'Live' }))
  assert.notEqual(lyricKey(base), lyricKey({ ...base, source: 'qq' }))
})

test('blank timed markers end the preceding lyric during instrumental gaps', () => {
  const doc = parseLyricDocument({lyric:'[00:01]First\n[00:04]\n[00:10]Second[00:14]'})
  assert.equal(doc.lines.length,2)
  assert.equal(doc.lines[0].end,4)
  for(const [time,index] of [[0,-1],[1,0],[3.99,0],[4,-1],[8,-1],[10,1],[14,-1]]) assert.equal(activeLyricIndex(doc.lines,time),index)
})
test('word highlighting requires complete monotonic intervals, never inferred syllables', () => {
  const doc = parseLyricDocument({lyric:'[00:01]<00:01>First <00:02>line\n[00:04]\n[00:10]Next'})
  assert.equal(doc.lines[0].words[1].end,4)
  assert.equal(hasWordTiming(doc.lines[0]),true)
  assert.equal(hasWordTiming(doc.lines[1]),false)
  assert.equal(hasWordTiming({...doc.lines[0],words:[{time:2,end:3,text:'First '},{time:1,end:4,text:'line'}]}),false)
  assert.equal(hasWordTiming({...doc.lines[0],words:[{time:1,end:2,text:'not matching'}]}),false)
})
test('lyric expiry is independent of offset changes and respects parser schema', () => {
  const value={schema:LYRIC_SCHEMA,updated:1000,imported:false,offset:0,document:{translationSource:''}}
  assert.equal(reusableLyrics(value,2000),true)
  assert.equal(reusableLyrics({...value,offset:3},86402000),false)
  assert.equal(reusableLyrics({...value,schema:0},2000),false)
  assert.equal(reusableLyrics({...value,imported:true,schema:0},86402000),true)
})
test('late translation creation is cancelled before an immediate retry can start', async () => {
  let resolveFirst;const cancelled=[],created=[]
  const session=new LyricTranslationSession(input=>{created.push(input);return input==='first'?new Promise(resolve=>{resolveFirst=resolve}):Promise.resolve({id:'new'})},async id=>{cancelled.push(id)})
  const first=session.start('first'),rejected=assert.rejects(first,/cancelled/)
  await new Promise(setImmediate)
  const stopping=session.stop(),second=session.start('second')
  await new Promise(setImmediate)
  assert.deepEqual(created,['first'])
  resolveFirst({id:'old'});await stopping;await rejected
  const result=await second
  assert.deepEqual(cancelled,['old']);assert.deepEqual(created,['first','second'])
  session.finish(result.lease);await session.stop()
  assert.deepEqual(cancelled,['old'],'completed jobs do not receive a misleading cancel request')
})
test('translation cancellation failures are observable and do not strand future requests', async () => {
  const session=new LyricTranslationSession(async()=>({id:'job'}),async()=>{throw Error('network')})
  await session.start('first');await assert.rejects(session.stop(),/network/)
  const result=await session.start('retry');assert.equal(result.job.id,'job');session.finish(result.lease)
})

test('restored tracks rebuild stale backend URLs and recover engine metadata', () => {
  const old = { id: 'online:bilibili:BV123', title: 'Song', artist: 'Singer', album: '', duration: 200,
    url: 'http://localhost:8080/song/streamOnline?source=bilibili&id=BV123&engine=go-music-api&extra=%7B%22cid%22%3A%22123%22%7D',
    cover: 'http://localhost:8080/song/coverOnline?source=bilibili&id=https%3A%2F%2Fexample.com%2Fa.jpg&engine=go-music-api', likeStatus: 1 }
  const next = rebuildOnlineTrack(old, 'http://localhost:18080', true)
  const audio = new URL(next.url), image = new URL(next.cover)
  assert.equal(audio.port, '18080')
  assert.equal(audio.searchParams.get('engine'), 'go-music-api')
  assert.equal(audio.searchParams.get('extra'), '{"cid":"123"}')
  assert.equal(audio.searchParams.get('id'), 'BV123')
  assert.ok(audio.searchParams.has('_refresh'))
  assert.equal(image.searchParams.get('cover'), 'https://example.com/a.jpg')
  assert.equal(old.url.includes(':8080'), true)
  assert.equal(next.likeStatus, 1)
})

test('local resources are not rewritten as online resources', () => {
  const local = { id: '12', source: 'local', url: 'http://localhost:9000/local.mp3', cover: '', title: 'Song' }
  assert.deepEqual(rebuildOnlineTrack(local, 'http://localhost:18080'), local)
})

test('history snapshots deduplicate and cap records without altering the queue', () => {
  const track = { id: '1', title: 'Original', lyric: 'private large lyric', playbackStatus: 'error' }
  const first = recordPlayedEntry([], track, 4, 100)
  track.title = 'Changed'
  assert.equal(first[0].track.title, 'Original')
  assert.equal(first[0].track.lyric, undefined)
  assert.equal(first[0].track.playbackStatus, undefined)
  const second = recordPlayedEntry(first, track, 5, 200)
  assert.equal(second.length, 1)
  assert.equal(second[0].playedAt, 200)
  let many = []
  for (let i = 0; i < 70; i++) many = recordPlayedEntry(many, { id: String(i), title: 'Song' }, 3, i)
  assert.equal(many.length, 60)
  assert.equal(many[0].track.id, '69')
})

test('automatic switching trusts only verified complete audio, trials stay a last resort', () => {
  assert.equal(alternativeTier({ availability: 'full' }), 'full')
  assert.equal(alternativeTier({ availability: 'unknown' }, 'full'), 'full')
  assert.equal(alternativeTier({ availability: 'preview' }), 'preview')
  assert.equal(alternativeTier({ availability: 'unknown' }, 'duration-matched'), 'reject')
  assert.equal(alternativeTier({ availability: 'restricted' }), 'reject')
  assert.equal(alternativeTier({ availability: 'unavailable' }), 'reject')
})

test('fallback requires exact contributors, edition and known matching durations', () => {
  const original = { title: 'Numb', artist: 'Linkin Park', album: 'Meteora', duration: 187 }
  assert.equal(sameRecording({ ...original, duration: 189 }, original), true)
  for (const change of [{ artist: 'Linkin Park Tribute' }, { artist: 'Other, Linkin Park' }, { album: 'Live in Texas' }, { title: 'Numb (Remix)' }, { duration: 0 }, { duration: 210 }, { availability: 'preview' }]) {
    assert.equal(sameRecording({ ...original, ...change }, original), false, JSON.stringify(change))
  }
  assert.equal(sameRecording({ ...original, artist: 'AC' }, { ...original, artist: 'AC/DC' }), false)
})

test('metadata does not prove full playback; genuine short songs remain valid', () => {
  assert.equal(classifyMedia(187, 30), 'preview')
  assert.equal(classifyMedia(250, 60), 'preview')
  assert.equal(classifyMedia(30, 30), 'duration-matched')
  assert.equal(classifyMedia(0, 30), 'unknown')
  assert.equal(classifyMedia(187, 187), 'duration-matched')
  assert.equal(classifyMedia(0, Infinity), 'unknown')
})

test('seeking to the end is not evidence of fully playing a recording', () => {
  const ranges = pairs => ({ length: pairs.length, start: i => pairs[i][0], end: i => pairs[i][1] })
  assert.equal(fullyPlayed(187, ranges([[0, 10], [180, 187]])), false)
  assert.equal(fullyPlayed(187, ranges([[0, 186.5]])), true)
  assert.equal(fullyPlayed(0, ranges([])), false)
})

test('SSE preserves multiline data and split CRLF, emits the final frame', () => {
  const events = []
  const parser = createSseParser(event => events.push(event))
  parser.push('event: text\r\ndata: 你好\r')
  parser.push('\ndata: 第二行\r\n\r')
  parser.push('\nevent: done\ndata: ')
  parser.finish()
  assert.deepEqual(events, [{ event: 'text', data: '你好\n第二行' }, { event: 'done', data: '' }])
})
test('SSE comments and heartbeat do not become chat text', () => {
  const events = []
  const parser = createSseParser(e => events.push(e))
  parser.push(': ping\n\nevent: songs\ndata: []\n\n')
  assert.deepEqual(events, [{ event: 'songs', data: '[]' }])
})
test('artist names containing slash/ampersand/parentheses remain intact', () => {
  assert.deepEqual(artistNames('AC/DC, Simon & Garfunkel, 郑钧 (Jun Zheng)'), ['AC/DC', 'Simon & Garfunkel', '郑钧 (Jun Zheng)'])
})
test('related artists retain platform identity and counts', () => {
  const songs = [{ artistName: 'AC/DC', source: 'netease' }, { artistName: 'AC/DC', source: 'qq' }, { artistName: 'AC/DC', source: 'qq' }, { artistName: 'Other', source: 'qq' }]
  const result = relatedArtists(songs, 'ac/dc')
  assert.equal(result.length, 2)
  assert.equal(result[0].source, 'qq')
  assert.equal(result[0].count, 2)
})
