import http from 'node:http'
import Meting from '@meting/core'

const port = Number(process.env.PORT || 3001)
const host = process.env.HOST || '127.0.0.1'
const metingSources = new Set(['netease', 'tencent', 'kugou', 'kuwo', 'baidu'])
const goSources = new Set(['netease', 'qq', 'kugou', 'kuwo', 'migu', 'qianqian', 'jamendo', 'joox', 'bilibili', 'fivesing', 'soda'])
const supportedSources = new Set([...metingSources, ...goSources])
const defaultSources = ['netease', 'qq', 'kugou', 'kuwo', 'migu', 'qianqian', 'jamendo', 'bilibili']
const goMusicApiUrl = (process.env.GO_MUSIC_API_URL || '').replace(/\/$/, '')
const sourceNames = {
  netease: '网易云音乐',
  tencent: 'QQ 音乐',
  qq: 'QQ 音乐',
  kugou: '酷狗音乐',
  kuwo: '酷我音乐',
  baidu: '百度音乐',
  migu: '咪咕音乐',
  qianqian: '千千音乐',
  jamendo: 'Jamendo 开放音乐',
  joox: 'JOOX',
  bilibili: 'Bilibili',
  fivesing: '5sing',
  soda: '汽水音乐',
}
const discoveryCache = { expiresAt: 0, songs: [], failedSources: [] }
const resourceCache = new Map()
const availabilityCache = new Map()
const sourceCookies = {
  netease: process.env.MUSIC_COOKIE_NETEASE || '',
  tencent: process.env.MUSIC_COOKIE_TENCENT || '',
  kugou: process.env.MUSIC_COOKIE_KUGOU || '',
  kuwo: process.env.MUSIC_COOKIE_KUWO || '',
  baidu: process.env.MUSIC_COOKIE_BAIDU || '',
}

const normalizeSourceForGo = (source) => source === 'tencent' ? 'qq' : source

const safeJson = (value) => {
  try { return JSON.stringify(value || {}) } catch { return '{}' }
}

const appendSongQuery = (target, song) => {
  const query = new URLSearchParams({
    id: String(song.id || ''),
    source: normalizeSourceForGo(song.source || ''),
    name: String(song.name || ''),
    artist: String(song.artist || ''),
    album: String(song.album || ''),
    duration: String(Number(song.duration) || 0),
    cover: String(song.coverOriginal || ''),
    extra: song.sourceExtra || '{}',
  })
  return `${target}?${query}`
}

const createMeting = (source) => {
  const meting = new Meting(source)
  const cookie = sourceCookies[source]
  if (cookie) meting.cookie(cookie)
  meting.format(true)
  return meting
}

const withTimeout = (promise, milliseconds) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('upstream timeout')), milliseconds)
  promise.then(
    (value) => {
      clearTimeout(timer)
      resolve(value)
    },
    (error) => {
      clearTimeout(timer)
      reject(error)
    },
  )
})

const sendJson = (response, status, body) => {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  response.end(JSON.stringify(body))
}

const parseResult = (value) => {
  if (value == null) return null
  if (typeof value === 'string') return JSON.parse(value)
  if (typeof value === 'object' && typeof value.raw === 'string') {
    return JSON.parse(value.raw)
  }
  return value
}

const selectSources = (raw) => {
  const requested = (raw || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter((item) => supportedSources.has(item))
  return requested.length ? [...new Set(requested)] : defaultSources
}

const searchSource = async (source, keyword, limit) => {
  const meting = createMeting(source)
  const payload = parseResult(await meting.search(keyword, { page: 1, limit }))
  const rows = Array.isArray(payload) ? payload : []
  return rows.slice(0, limit).map((song) => ({
    id: String(song.id ?? song.url_id ?? ''),
    name: String(song.name ?? '').trim(),
    artist: Array.isArray(song.artist)
      ? song.artist.filter(Boolean).join(', ')
      : String(song.artist ?? '').trim(),
    album: String(song.album ?? '').trim(),
    duration: Number(song.duration ?? 0),
    source,
    sourceName: sourceNames[source],
    accountAuthorized: Boolean(sourceCookies[source]),
    urlId: String(song.url_id ?? song.id ?? ''),
    lyricId: String(song.lyric_id ?? song.id ?? ''),
    picId: String(song.pic_id ?? ''),
    providerEngine: 'meting',
    sourceExtra: '{}',
    availability: 'unknown',
    vip: false,
  })).filter((song) => song.id && song.name)
}

const searchGoMusicApi = async (keyword, sources, limit) => {
  if (!goMusicApiUrl) throw new Error('go-music-api is disabled')
  const query = new URLSearchParams({ q: keyword, type: 'song' })
  sources.map(normalizeSourceForGo).filter((source) => goSources.has(source))
    .forEach((source) => query.append('sources', source))
  const response = await withTimeout(fetch(`${goMusicApiUrl}/api/v1/music/search?${query}`, {
    headers: { Accept: 'application/json', 'User-Agent': 'FreeMusicPlayer/2.0' },
  }), 20000)
  if (!response.ok) throw new Error(`go-music-api search failed (${response.status})`)
  const payload = await response.json()
  const rows = payload?.data?.songs
  if (!Array.isArray(rows)) throw new Error('go-music-api returned invalid search data')

  const perSource = new Map()
  return rows.map((song) => {
    const source = String(song.source || '').toLowerCase()
    const count = perSource.get(source) || 0
    perSource.set(source, count + 1)
    if (!goSources.has(source) || count >= limit) return null
    const id = String(song.id || '')
    return {
      id,
      name: String(song.name || '').trim(),
      artist: String(song.artist || '').trim(),
      album: String(song.album || '').trim(),
      duration: Number(song.duration || 0),
      source,
      sourceName: sourceNames[source] || source,
      accountAuthorized: false,
      urlId: id,
      lyricId: id,
      picId: String(song.cover || ''),
      coverOriginal: String(song.cover || ''),
      providerEngine: 'go-music-api',
      sourceExtra: safeJson(song.extra),
      availability: song.is_invalid ? 'unavailable' : song.is_vip ? 'restricted' : 'unknown',
      vip: Boolean(song.is_vip),
      bitrate: Number(song.bitrate || 0),
      size: Number(song.size || 0),
    }
  }).filter((song) => song?.id && song.name)
}

const normalizeForRank = (value) => String(value || '').toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '')

const relevanceScore = (song, keyword) => {
  const query = normalizeForRank(keyword)
  const name = normalizeForRank(song.name)
  const artist = normalizeForRank(song.artist)
  if (!query) return 0
  let score = name === query ? 100 : name.startsWith(query) ? 80 : name.includes(query) ? 60 : 0
  if (artist === query) score += 50
  else if (artist.includes(query)) score += 25
  if (song.availability === 'unavailable') score -= 30
  if (song.availability === 'restricted') score -= 8
  return score
}

const aggregateSearch = async (keyword, sources, limit) => {
  const goRequested = sources.map(normalizeSourceForGo).filter((source) => goSources.has(source))
  const metingRequested = sources.filter((source) => metingSources.has(source))
  const tasks = []
  const taskNames = []
  // Query each enhanced source independently. A single slow platform must not
  // make the browser wait for every other source supported by go-music-api.
  if (goMusicApiUrl && goRequested.length) {
    [...new Set(goRequested)].forEach((source) => {
      tasks.push(withTimeout(searchGoMusicApi(keyword, [source], limit), 15000))
      taskNames.push(`go:${source}`)
    })
  }
  // Meting runs in parallel as a fast compatibility path. Duplicates from the
  // same platform ID are removed below, while genuinely different versions
  // and cross-platform alternatives remain visible.
  const metingFallbackSources = new Set(metingRequested)
  if (sources.includes('qq')) metingFallbackSources.add('tencent')
  metingFallbackSources.forEach((source) => {
    if (!metingSources.has(source)) return
    tasks.push(withTimeout(searchSource(source, keyword, limit), 12000))
    taskNames.push(`meting:${source}`)
  })
  const settled = await Promise.allSettled(tasks)
  const failedSources = []
  const songs = []
  settled.forEach((result, index) => {
    if (result.status === 'fulfilled') songs.push(...result.value)
    else failedSources.push(taskNames[index])
  })

  // If the enhanced provider is unavailable, transparently fall back to all
  // sources supported by Meting rather than returning an empty search page.
  if (!songs.length && goMusicApiUrl) {
    const fallback = await Promise.allSettled(
      sources.filter((source) => metingSources.has(source)).map((source) =>
        withTimeout(searchSource(source, keyword, limit), 12000))
    )
    fallback.forEach((result) => {
      if (result.status === 'fulfilled') songs.push(...result.value)
    })
  }

  const seen = new Set()
  const deduplicated = songs.filter((song) => {
    // Keep the same recording from different providers. The UI can expose
    // these alternatives and the player can switch source when one is a trial.
    const key = `${song.source}::${song.id}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  deduplicated.sort((left, right) => relevanceScore(right, keyword) - relevanceScore(left, keyword))
  return { songs: deduplicated, failedSources }
}

const resolveResource = async (source, type, id, sizeOrBitrate) => {
  const meting = createMeting(source)
  const raw = type === 'pic'
    ? await meting.pic(id, sizeOrBitrate)
    : await meting.url(id, sizeOrBitrate)
  const payload = parseResult(raw)
  const item = Array.isArray(payload) ? payload[0] : payload
  if (typeof item === 'string') return item
  return item?.url || item?.pic || item?.src || ''
}

const resolveResourceCached = async (source, type, id, sizeOrBitrate) => {
  const key = `${source}:${type}:${id}:${sizeOrBitrate}`
  const cached = resourceCache.get(key)
  if (cached && cached.expiresAt > Date.now()) return cached.value
  const value = await resolveResource(source, type, id, sizeOrBitrate)
  if (value) resourceCache.set(key, { value, expiresAt: Date.now() + 5 * 60 * 1000 })
  return value
}

const keepPlayableSongs = async (songs) => {
  const checked = await Promise.all(songs.map(async (song) => {
    try {
      const availabilityKey = `${song.source}:${song.urlId}`
      const cachedAvailability = availabilityCache.get(availabilityKey)
      if (cachedAvailability && cachedAvailability.expiresAt > Date.now()) {
        return cachedAvailability.playable ? song : null
      }
      const target = await withTimeout(
        resolveResourceCached(song.source, 'url', song.urlId, 320),
        8000,
      )
      if (!target) {
        availabilityCache.set(availabilityKey, { playable: false, expiresAt: Date.now() + 60 * 1000 })
        return null
      }
      const mediaResponse = await withTimeout(fetch(target, {
        headers: { Range: 'bytes=0-0', 'User-Agent': 'FreeMusicPlayer/1.0' },
      }), 8000)
      const contentType = mediaResponse.headers.get('content-type') || ''
      const playable = mediaResponse.ok && !contentType.includes('json') && !contentType.includes('text/html')
      await mediaResponse.body?.cancel()
      availabilityCache.set(availabilityKey, { playable, expiresAt: Date.now() + 2 * 60 * 1000 })
      return playable ? song : null
    } catch {
      return null
    }
  }))
  return checked.filter(Boolean)
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || `${host}:${port}`}`)

  if (request.method === 'GET' && url.pathname === '/health') {
    return sendJson(response, 200, {
      status: 'ok',
      sources: [...supportedSources],
      engines: {
        meting: 'up',
        goMusicApi: goMusicApiUrl ? 'configured' : 'disabled',
      },
      authorizedSources: Object.entries(sourceCookies).filter(([, cookie]) => Boolean(cookie)).map(([source]) => source),
    })
  }

  if (request.method === 'GET' && url.pathname === '/discover') {
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 20, 1), 30)
    if (Date.now() < discoveryCache.expiresAt && discoveryCache.songs.length > 0) {
      return sendJson(response, 200, {
        songs: discoveryCache.songs.slice(0, limit),
        failedSources: discoveryCache.failedSources,
        cached: true,
      })
    }

    const result = await aggregateSearch('热门歌曲', defaultSources, Math.ceil(limit / defaultSources.length) + 3)
    const candidates = result.songs.filter((song) => song.availability !== 'unavailable')
    const metingCandidates = candidates.filter((song) => song.providerEngine === 'meting')
    const playableMeting = await keepPlayableSongs(metingCandidates)
    const playableMetingKeys = new Set(playableMeting.map((song) => `${song.source}:${song.id}`))
    const playableSongs = candidates.filter((song) =>
      song.providerEngine !== 'meting' || playableMetingKeys.has(`${song.source}:${song.id}`))
    discoveryCache.songs = playableSongs
    discoveryCache.failedSources = result.failedSources
    discoveryCache.expiresAt = Date.now() + 10 * 60 * 1000
    return sendJson(response, 200, {
      songs: playableSongs.slice(0, limit),
      failedSources: result.failedSources,
      cached: false,
    })
  }

  if (request.method === 'GET' && url.pathname === '/search') {
    const keyword = (url.searchParams.get('q') || '').trim()
    if (!keyword || keyword.length > 100) {
      return sendJson(response, 400, { error: 'q must contain 1-100 characters' })
    }

    const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 20, 1), 50)
    const sources = selectSources(url.searchParams.get('sources'))
    const result = await aggregateSearch(keyword, sources, limit)
    return sendJson(response, 200, result)
  }

  if (request.method === 'GET' && url.pathname === '/lyric') {
    const source = (url.searchParams.get('source') || '').toLowerCase()
    const id = (url.searchParams.get('id') || '').trim()
    if (!supportedSources.has(source) || !id) {
      return sendJson(response, 400, { error: 'invalid source or id' })
    }
    try {
      const engine = url.searchParams.get('engine') || ''
      if (engine === 'go-music-api' && goMusicApiUrl) {
        const target = appendSongQuery(`${goMusicApiUrl}/api/v1/music/lyric`, {
          id, source,
          name: url.searchParams.get('name'), artist: url.searchParams.get('artist'),
          album: url.searchParams.get('album'), duration: url.searchParams.get('duration'),
          sourceExtra: url.searchParams.get('extra'),
        })
        const upstream = await withTimeout(fetch(target), 12000)
        const result = await upstream.json()
        return sendJson(response, upstream.ok ? 200 : 502, {
          lyric: String(result?.data?.lyric || ''), tlyric: '',
        })
      }
      const metingSource = source === 'qq' ? 'tencent' : source
      const payload = parseResult(await createMeting(metingSource).lyric(id)) || {}
      return sendJson(response, 200, {
        lyric: String(payload.lyric || ''),
        tlyric: String(payload.tlyric || ''),
      })
    } catch (error) {
      return sendJson(response, 502, { error: error instanceof Error ? error.message : 'lyric upstream failed' })
    }
  }

  if (request.method === 'GET' && ['/stream', '/cover'].includes(url.pathname)) {
    const source = (url.searchParams.get('source') || '').toLowerCase()
    const id = (url.searchParams.get('id') || '').trim()
    if (!supportedSources.has(source) || !id) {
      return sendJson(response, 400, { error: 'invalid source or id' })
    }
    try {
      const isCover = url.pathname === '/cover'
      const engine = url.searchParams.get('engine') || ''
      let target = ''
      if (engine === 'go-music-api' && goMusicApiUrl) {
        if (isCover) {
          const cover = url.searchParams.get('cover') || (id.startsWith('http') ? id : '')
          if (cover) {
            const query = new URLSearchParams({ url: cover, name: url.searchParams.get('name') || '', artist: url.searchParams.get('artist') || '' })
            target = `${goMusicApiUrl}/api/v1/music/cover?${query}`
          }
        } else {
          target = appendSongQuery(`${goMusicApiUrl}/api/v1/music/stream`, {
            id, source,
            name: url.searchParams.get('name'), artist: url.searchParams.get('artist'),
            album: url.searchParams.get('album'), duration: url.searchParams.get('duration'),
            coverOriginal: url.searchParams.get('cover'), sourceExtra: url.searchParams.get('extra'),
          })
        }
      } else {
        const metingSource = source === 'qq' ? 'tencent' : source
        target = await resolveResourceCached(metingSource, isCover ? 'pic' : 'url', id, isCover ? 300 : 320)
      }
      if (!target) return sendJson(response, 404, { error: 'resource unavailable' })
      response.writeHead(302, { Location: target, 'Cache-Control': 'private, max-age=300' })
      return response.end()
    } catch (error) {
      return sendJson(response, 502, { error: error instanceof Error ? error.message : 'upstream failed' })
    }
  }

  return sendJson(response, 404, { error: 'not found' })
})

server.listen(port, host, () => {
  console.log(`FreeMusicPlayer provider listening on http://${host}:${port}`)
})
