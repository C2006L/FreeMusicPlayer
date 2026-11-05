import { test } from 'node:test'
import assert from 'node:assert/strict'
import { discoverFromPlaylists, discoveryBatch } from './discovery.mjs'

test('discovery follows real playlist endpoints and keeps partial platform success', async () => {
  const calls = []
  const fetchMock = async url => {
    const parsed = new URL(url)
    calls.push(parsed.pathname)
    const source = parsed.searchParams.get('sources') || parsed.searchParams.get('source')
    if (source === 'netease') throw new Error('upstream unavailable')
    return { ok: true, json: async () => ({ data: parsed.pathname.endsWith('recommend')
      ? [{ id: 'list-1', source: 'qq' }]
      : [{ id: '1', source: 'qq', name: 'Actual song' }, { id: '2', source: 'qq', name: '热门歌曲大串烧' }, { id: '1', source: 'qq', name: 'Actual song' }] }) }
  }
  const result = await discoverFromPlaylists('http://provider', rows => rows, fetchMock)
  assert.deepEqual(result.songs.map(song => song.id), ['1'])
  assert.deepEqual(result.failedSources, ['netease'])
  assert.ok(calls.includes('/api/v1/playlist/detail'))
  assert.equal(calls.some(path => path.includes('search')), false)
})

test('discovery rotates cached batches without duplicating short pools', () => {
  assert.deepEqual(discoveryBatch([1, 2, 3, 4], 2, 2), [3, 4])
  assert.deepEqual(discoveryBatch([1, 2], 1, 20), [2, 1])
  assert.deepEqual(discoveryBatch([], 0, 20), [])
})
