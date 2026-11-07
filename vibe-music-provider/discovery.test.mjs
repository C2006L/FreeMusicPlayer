import { test } from 'node:test'
import assert from 'node:assert/strict'
import { discoverArtists, discoverFromPlaylists, discoverPlaylists, discoveryBatch } from './discovery.mjs'

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

test('playlist discovery keeps upstream metadata and partial platform success', async () => {
  const fetchMock = async url => {
    const source = new URL(url).searchParams.get('sources')
    if (source === 'qq') throw new Error('upstream unavailable')
    return {
      ok: true,
      json: async () => ({
        data: [
          { id: 1, source: 'netease', name: 'Real list', cover: 'https://c/a.jpg', track_count: 12, play_count: 345, creator: '网易云推荐' },
          { id: 2, source: 'netease', name: '', cover: '' },
          { id: 3, source: 'qq', name: 'Other platform list' },
        ],
      }),
    }
  }
  const result = await discoverPlaylists('http://provider', fetchMock, 4)
  assert.deepEqual(result.playlists.map((item) => item.id), ['1'])
  assert.equal(result.playlists[0].trackCount, 12)
  assert.equal(result.playlists[0].playCount, 345)
  assert.equal(result.playlists[0].sourceName, '网易云音乐')
  assert.deepEqual(result.failedSources, ['qq'])
})

test('artist discovery counts real songs across multiple playlists and sources', async () => {
  const fetchMock = async url => {
    const parsed = new URL(url)
    if (parsed.pathname.endsWith('/playlist/recommend')) {
      const source = parsed.searchParams.get('sources')
      return {
        ok: true,
        json: async () => ({ data: source === 'netease'
          ? [{ id: 'n1', source: 'netease', name: '网易云推荐歌单', track_count: 3 }]
          : [{ id: 'q1', source: 'qq', name: 'QQ 推荐歌单', track_count: 3 }] }),
      }
    }
    const source = parsed.searchParams.get('source')
    return {
      ok: true,
      json: async () => ({ data: source === 'netease'
        ? [
            { id: 'n-song-1', source: 'netease', name: 'Song A', artist: '周传雄', album: 'A', duration: 200, cover: 'https://c/a.jpg' },
            { id: 'n-song-2', source: 'netease', name: 'Song B', artist: '周传雄', album: 'B', duration: 210 },
            { id: 'n-song-2-again', source: 'netease', name: 'Song B', artist: '周传雄', album: 'B', duration: 210 },
          ]
        : [
            { id: 'q-song-1', source: 'qq', name: 'Song C', artist: '周传雄, 陈慧琳', album: 'C', duration: 240 },
          ] }),
    }
  }
  const normalizeSongs = rows => rows.map(row => ({
    ...row,
    coverOriginal: row.cover || '',
    sourceName: row.source === 'qq' ? 'QQ 音乐' : '网易云音乐',
    availability: 'unknown',
  }))
  const result = await discoverArtists('http://provider', normalizeSongs, fetchMock, { playlistLimit: 2, artistLimit: 10 })
  const zhou = result.artists.find(artist => artist.name === '周传雄')
  assert.equal(zhou.songCount, 3, 'duplicate playlist entries collapse, cross-source songs still count')
  assert.equal(zhou.coverUrl, 'https://c/a.jpg')
  assert.deepEqual(zhou.sources, ['网易云音乐', 'QQ 音乐'])
  assert.equal(result.loadedPlaylists, 2)
  assert.equal(result.artists.find(artist => artist.name === '陈慧琳').songCount, 1)
})

test('artist discovery tolerates one unavailable playlist', async () => {
  const fetchMock = async url => {
    const parsed = new URL(url)
    if (parsed.pathname.endsWith('/playlist/recommend')) {
      return { ok: true, json: async () => ({ data: [{ id: 'n1', source: 'netease', name: 'list' }] }) }
    }
    if (parsed.searchParams.get('id') === 'n1') throw new Error('detail unavailable')
    return { ok: true, json: async () => ({ data: [] }) }
  }
  const result = await discoverArtists('http://provider', rows => rows, fetchMock, { playlistLimit: 1 })
  assert.deepEqual(result.artists, [])
  assert.equal(result.loadedPlaylists, 0)
})

