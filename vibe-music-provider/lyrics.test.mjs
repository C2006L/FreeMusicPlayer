import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lyricPayload, LyricCache, resolveLyrics } from './lyrics.mjs'
test('lyric channels survive nested upstream shapes', () => {
  assert.deepEqual(lyricPayload({ lrc: { lyric: 'original' }, tlyric: { lyric: 'translation' }, romalrc: { lyric: 'roma' } }, 'test'), { lyric: 'original', tlyric: 'translation', romalrc: 'roma', source: 'test' })
  assert.equal(lyricPayload({ lyric: '[00:01]原文[00:02]' }).lyric, '[00:01]原文[00:02]')
})
test('lyric cache coalesces identical calls and does not cache upstream failure as absence', async () => {
  const cache = new LyricCache(); let calls = 0
  const loader = async () => { calls++; return { lyric: 'original' } }
  const result = await Promise.all([cache.get('song', loader), cache.get('song', loader)])
  assert.equal(calls, 1); assert.deepEqual(result[0], result[1])
  await assert.rejects(cache.get('bad', async () => { throw Error('network') }))
  assert.equal((await cache.get('bad', loader)).lyric, 'original')
  assert.equal(calls, 2)
})
test('secondary adapter failure never discards a valid original lyric', async () => {
  const payload = await resolveLyrics({source:'netease',readMeting:async()=>({lyric:'original'}),readGo:async()=>{throw Error('network')}})
  assert.equal(payload.lyric,'original')
  assert.equal(payload.source,'netease · Meting')
})
test('missing content and failed requests remain distinct after adapter fallback', async () => {
  assert.equal((await resolveLyrics({source:'qq',readMeting:async()=>({}),readGo:async()=>({})})).lyric,'')
  await assert.rejects(resolveLyrics({source:'qq',readMeting:async()=>{throw Error('network')}}))
  const payload=await resolveLyrics({source:'qq',readMeting:async()=>{throw Error('network')},readGo:async()=>({lyric:'original',translation:'译文'})})
  assert.equal(payload.tlyric,'译文')
})
