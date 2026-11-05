import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadBilibiliCollection } from './bilibili-collection.mjs'

test('collection keeps directory order and independent CID identities', async () => {
  let requested
  const rows = ['9', '2', '9'].map(cid => ({ source: 'bilibili', id: `BV1DG4y187sw|${cid}`, extra: { bvid: 'BV1DG4y187sw', cid } }))
  const result = await loadBilibiliCollection('http://provider', 'BV1DG4y187sw', items => items, async url => {
    requested = new URL(url)
    return { ok: true, json: async () => ({ data: { songs: rows } }) }
  })
  assert.equal(requested.searchParams.get('q'), 'https://www.bilibili.com/video/BV1DG4y187sw')
  assert.deepEqual(result.songs.map(song => song.extra.cid), ['9', '2'])
})

test('collection rejects arbitrary URLs and does not invent entries for empty data', async () => {
  await assert.rejects(() => loadBilibiliCollection('http://provider', 'http://localhost/private', x => x), /invalid/)
  await assert.rejects(() => loadBilibiliCollection('http://provider', 'BV1DG4y187sw', x => x,
    async () => ({ ok: true, json: async () => ({ data: { songs: [] } }) })), /empty/)
})
