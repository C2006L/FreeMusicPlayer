import http from 'node:http'
import Meting from '@meting/core'
import { relevanceScore, matchesSearch } from './search-utils.mjs'
import { discoverArtists, discoverFromPlaylists, discoverPlaylists, discoveryBatch } from './discovery.mjs'
import { loadBilibiliCollection } from './bilibili-collection.mjs'
import { SourceRuntime } from './source-runtime.mjs'
import { proxyPublicCover } from './public-cover.mjs'
import { randomUUID } from 'node:crypto'
import { searchRows } from './upstream-search.mjs'
import { metingMetadata } from './meting-metadata.mjs'
import { resolveLyrics, LyricCache } from './lyrics.mjs'
const lyricCache = new LyricCache()
const runtime = new SourceRuntime()
const coverRuntime = new SourceRuntime({ concurrency: 4, queueCapacity: 32 })

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
const discoveryCache = { expiresAt: 0, songs: [], failedSources: [], offset: 0, pending: null }
const playlistDiscoveryCache = { expiresAt: 0, playlists: [], failedSources: [], pending: null }
const artistDiscoveryCache = { expiresAt: 0, artists: [], loadedPlaylists: 0, pending: null }
const resourceCache = new Map()
const collectionCache = new Map()
const streamTargets = new Map()
const sourceHealth = new Map()
setInterval(() => {
  for (const cache of [resourceCache, collectionCache, streamTargets]) {
    for (const [key, item] of cache) if (item.expiresAt <= Date.now()) cache.delete(key)
    while (cache.size > 1000) cache.delete(cache.keys().next().value)
  }
}, 60000).unref()
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

const STREAM_PROBE_TIMEOUT_MS = 8000
const probeAccepts = (type) => type.startsWith('audio/') || type.startsWith('video/mp4')
  || type.startsWith('application/ogg') || type.startsWith('application/octet-stream')
// QQ/酷狗直链需要平台 Referer，否则 CDN 会返回 403。
const sourceReferer = (source) => {
  if (source === 'qq' || source === 'tencent') return 'https://y.qq.com/'
  if (source === 'kugou') return 'https://www.kugou.com/'
  return ''
}
// 取流前先做一次 Range 探测，避免把 404/错误页交给浏览器导致进度条永远 00:00。
const probeMedia = async (target, referer = '') => {
  try {
    const upstream = await fetch(target, {
      redirect: 'follow',
      signal: AbortSignal.timeout(STREAM_PROBE_TIMEOUT_MS),
      headers: {
        Range: 'bytes=0-0',
        'User-Agent': 'FreeMusicPlayer/1.0',
        ...(referer ? { Referer: referer } : {}),
      },
    })
    const type = (upstream.headers.get('content-type') || '').toLowerCase()
    if (upstream.body) { try { await upstream.body.cancel() } catch {} }
    return {
      ok: (upstream.status === 200 || upstream.status === 206) && probeAccepts(type),
      status: upstream.status, contentType: type,
    }
  } catch (error) {
    return { ok: false, status: 0, contentType: '', error: error instanceof Error ? error.message : 'probe failed' }
  }
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
  const metadata = metingMetadata(source, meting.raw)
  const rows = Array.isArray(payload) ? payload : []
  return rows.slice(0, limit).map((song) => ({
    id: String(song.id ?? song.url_id ?? ''),
    name: String(song.name ?? '').trim(),
    artist: Array.isArray(song.artist)
      ? song.artist.filter(Boolean).join(', ')
      : String(song.artist ?? '').trim(),
    album: String(song.album ?? '').trim(),
    duration: Number(song.duration) || metadata.get(String(song.id ?? song.url_id ?? '').toLowerCase())?.duration || 0,
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
    signal: AbortSignal.timeout(14000),
  }), 20000)
  if (!response.ok) throw new Error(`go-music-api search failed (${response.status})`)
  const payload = await response.json()
  const rows = searchRows(payload)
  return normalizeGoSongs(rows, limit)
}
const normalizeGoSongs = (rows, limit) => {
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

// 情绪/场景推荐：按组合关键词检索平台主题歌单，再取歌单曲目。
// 每次请求随机挑选相关歌单与曲目，避免同类问句永远命中同一批歌。
const themePlaylistCache = new Map()
const themeSongCache = new Map()
const THEME_CACHE_TTL = 10 * 60 * 1000

const shuffleList = (list) => {
  const copy = [...list]
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1))
    ;[copy[index], copy[swap]] = [copy[swap], copy[index]]
  }
  return copy
}

const themeTokens = (keyword) => keyword.normalize('NFKC').toLowerCase()
  .split(/[\s,，、]+/)
  .map((token) => token.replace(/歌单|音乐|歌曲|推荐/g, '').trim())
  .filter(Boolean)

const themePlaylists = async (keyword) => {
  const tokens = themeTokens(keyword)
  if (!tokens.length) return []
  const key = tokens.join(' ')
  const cached = themePlaylistCache.get(key)
  if (cached && cached.expiresAt > Date.now()) return cached.playlists
  const query = new URLSearchParams({ q: keyword, type: 'playlist' })
  const response = await withTimeout(fetch(`${goMusicApiUrl}/api/v1/music/search?${query}`, {
    headers: { Accept: 'application/json', 'User-Agent': 'FreeMusicPlayer/2.0' },
    signal: AbortSignal.timeout(14000),
  }), 20000)
  if (!response.ok) throw new Error(`theme playlist search failed (${response.status})`)
  const payload = await response.json()
  const rows = Array.isArray(payload?.data?.playlists) ? payload.data.playlists : []
  const scored = rows.map((row) => {
    const name = String(row.name || '').replace(/&nbsp;|&#160;/g, ' ').replace(/\s+/g, ' ').trim()
    const haystack = name.toLowerCase()
    const score = tokens.reduce((count, token) => count + (haystack.includes(token) ? 1 : 0), 0)
    return {
      id: String(row.id || ''),
      source: String(row.source || '').toLowerCase(),
      name,
      trackCount: Number(row.track_count || 0),
      score,
    }
  }).filter((playlist) => goSources.has(playlist.source) && /^\d{1,20}$/.test(playlist.id)
    && playlist.trackCount >= 8 && playlist.score >= 1 && !/测试|下载|铃声/i.test(playlist.name))
    .sort((left, right) => right.score - left.score || right.trackCount - left.trackCount)
  if (!scored.length) {
    themePlaylistCache.set(key, { playlists: [], expiresAt: Date.now() + 60 * 1000 })
    return []
  }
  // 同分优先；至少保留 2 个备选，让重复提问能轮换到不同歌单。
  const bestScore = scored[0].score
  const best = scored.filter((playlist) => playlist.score === bestScore)
  const playlists = (best.length >= 2 ? best : scored).slice(0, 8)
  themePlaylistCache.set(key, { playlists, expiresAt: Date.now() + THEME_CACHE_TTL })
  return playlists
}

const themePlaylistSongs = async (playlist) => {
  const key = `${playlist.source}:${playlist.id}`
  const cached = themeSongCache.get(key)
  if (cached && cached.expiresAt > Date.now()) return cached.songs
  const query = new URLSearchParams({ source: playlist.source, id: playlist.id })
  const response = await withTimeout(fetch(`${goMusicApiUrl}/api/v1/playlist/detail?${query}`, {
    headers: { Accept: 'application/json', 'User-Agent': 'FreeMusicPlayer/2.0' },
    signal: AbortSignal.timeout(20000),
  }), 25000)
  if (!response.ok) throw new Error(`theme playlist detail failed (${response.status})`)
  const payload = await response.json()
  const rows = Array.isArray(payload?.data) ? payload.data : []
  const songs = normalizeGoSongs(
    rows.filter((song) => normalizeSourceForGo(String(song.source || '').toLowerCase()) === playlist.source),
    1000,
  ).filter((song) => !/铃声|试听|伴奏|广告|测试|片段|(?:^|[\s（(])live|(?:^|[\s（(])dj|(?:^|[\s（(])[^）)]*版[）)]/i.test(song.name))
  themeSongCache.set(key, { songs, expiresAt: Date.now() + THEME_CACHE_TTL })
  return songs
}

const aggregateSearch = async (keyword, sources, limit, strict = true) => {
  const goRequested = sources.map(normalizeSourceForGo).filter((source) => goSources.has(source))
  const metingRequested = sources.filter((source) => metingSources.has(source))
  const tasks = []
  const taskNames = []
  // Query each enhanced source independently. A single slow platform must not
  // make the browser wait for every other source supported by go-music-api.
  if (goMusicApiUrl && goRequested.length) {
    [...new Set(goRequested)].forEach((source) => {
      tasks.push(runtime.source(`go:${source}`, () => withTimeout(searchGoMusicApi(keyword, [source], limit), 15000)))
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
    tasks.push(runtime.source(`meting:${source}`, () => withTimeout(searchSource(source, keyword, limit), 12000)))
    taskNames.push(`meting:${source}`)
  })
  const settled = await Promise.allSettled(tasks)
  const failedSources = []
  const songs = []
  settled.forEach((result, index) => {
    sourceHealth.set(taskNames[index], { status: result.status === 'fulfilled' ? result.value.length ? 'UP' : 'EMPTY' : 'FAILED', checkedAt: new Date().toISOString() })
    if (result.status === 'fulfilled') songs.push(...result.value)
    else failedSources.push(taskNames[index])
  })

  const seen = new Set()
  const deduplicated = songs.filter((song) => {
    if (strict && !matchesSearch(song, keyword)) return false
    // Keep the same recording from different providers. The UI can expose
    // these alternatives and the player can switch source when one is a trial.
    const key = `${song.source}::${song.id}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  deduplicated.sort((left, right) => relevanceScore(right, keyword) - relevanceScore(left, keyword))
  // 合并各源后统一按总量截断，避免每个源各返回 limit 条导致总数成倍放大。
  return { songs: deduplicated.slice(0, limit), failedSources }
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

const server = http.createServer(async (request, response) => {
  const requestId = String(request.headers['x-request-id'] || '').replace(/[^a-zA-Z0-9-]/g, '').slice(0,64) || randomUUID()
  response.setHeader('X-Request-Id',requestId)
  const started=Date.now()
  const url = new URL(request.url, `http://${request.headers.host || `${host}:${port}`}`)
  response.on('finish',()=>console.log(JSON.stringify({requestId,method:request.method,path:url.pathname,status:response.statusCode,elapsedMs:Date.now()-started})))

  if (request.method === 'GET' && url.pathname === '/metrics') return sendJson(response,200,runtime.metrics())

  if (request.method === 'GET' && url.pathname === '/health') {
    return sendJson(response, 200, {
      status: 'ok',
      recentSourceStatus: Object.fromEntries(sourceHealth),
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
    if (!goMusicApiUrl) return sendJson(response, 503, { error: 'playlist discovery requires go-music-api' })
    const cached = Date.now() < discoveryCache.expiresAt
    if (!cached) {
      if (!discoveryCache.pending) discoveryCache.pending = discoverFromPlaylists(goMusicApiUrl, normalizeGoSongs)
        .then(result => {
          discoveryCache.songs = result.songs
          discoveryCache.failedSources = result.failedSources
          discoveryCache.offset = 0
          discoveryCache.expiresAt = Date.now() + (result.songs.length ? 10 * 60 * 1000 : 30000)
        }).finally(() => { discoveryCache.pending = null })
      try { await discoveryCache.pending } catch { return sendJson(response, 503, { error: 'playlist discovery unavailable' }) }
    }
    if (!discoveryCache.songs.length && discoveryCache.failedSources.length === 2) return sendJson(response, 503, { error: 'playlist discovery unavailable' })
    const songs = discoveryBatch(discoveryCache.songs, discoveryCache.offset, limit)
    discoveryCache.offset = (discoveryCache.offset + songs.length) % Math.max(discoveryCache.songs.length, 1)
    return sendJson(response, 200, {
      songs, failedSources: discoveryCache.failedSources, cached, origin: 'platform-playlists',
    })
  }

  if (request.method === 'GET' && url.pathname === '/playlists') {
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 24, 1), 48)
    if (!goMusicApiUrl) return sendJson(response, 503, { error: 'playlist discovery requires go-music-api' })
    const cached = Date.now() < playlistDiscoveryCache.expiresAt
    if (!cached) {
      if (!playlistDiscoveryCache.pending) playlistDiscoveryCache.pending = discoverPlaylists(goMusicApiUrl, fetch, 48)
        .then(result => {
          playlistDiscoveryCache.playlists = result.playlists
          playlistDiscoveryCache.failedSources = result.failedSources
          playlistDiscoveryCache.expiresAt = Date.now() + (result.playlists.length ? 10 * 60 * 1000 : 30000)
        }).finally(() => { playlistDiscoveryCache.pending = null })
      try { await playlistDiscoveryCache.pending } catch { return sendJson(response, 503, { error: 'playlist discovery unavailable' }) }
    }
    const playlists = playlistDiscoveryCache.playlists.slice(0, limit)
    if (!playlists.length && playlistDiscoveryCache.failedSources.length === 2) {
      return sendJson(response, 503, { error: 'playlist discovery unavailable' })
    }
    return sendJson(response, 200, {
      playlists, failedSources: playlistDiscoveryCache.failedSources, cached, origin: 'platform-playlists',
    })
  }

  // 情绪/场景主题检索：组合关键词 -> 平台主题歌单 -> 真实曲目。
  if (request.method === 'GET' && url.pathname === '/theme') {
    const keywords = (url.searchParams.get('keywords') || '').split('|')
      .map((item) => item.trim()).filter(Boolean).slice(0, 4)
    if (!keywords.length) return sendJson(response, 400, { error: 'keywords must contain 1-4 phrases' })
    if (!goMusicApiUrl) return sendJson(response, 503, { error: 'theme playlists require go-music-api' })
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 12, 1), 20)
    try {
      const pools = await Promise.all(keywords.map((keyword) => themePlaylists(keyword).catch(() => [])))
      const picks = []
      const picked = new Set()
      pools.forEach((pool, index) => {
        for (const playlist of shuffleList(pool).slice(0, 2)) {
          const key = `${playlist.source}:${playlist.id}`
          if (picked.has(key) || picks.length >= 8) continue
          picked.add(key)
          picks.push({ ...playlist, keyword: keywords[index] })
        }
      })
      const batches = await Promise.all(picks.map(async (playlist) => ({
        playlist, songs: await themePlaylistSongs(playlist).catch(() => []),
      })))
      const failedSources = []
      const playlists = []
      const merged = []
      for (const batch of batches) {
        if (!batch.songs.length) {
          failedSources.push(`${batch.playlist.source}:${batch.playlist.id}`)
          continue
        }
        playlists.push({
          id: batch.playlist.id,
          source: batch.playlist.source,
          name: batch.playlist.name,
          trackCount: batch.playlist.trackCount,
          keyword: batch.playlist.keyword,
        })
        // 只从前 60 首里随机抽取，保留歌单自身的排序相关性，避免大歌单尾部杂歌。
        merged.push(...shuffleList(batch.songs.slice(0, 60)))
      }
      const seen = new Set()
      const songs = shuffleList(merged).filter((song) => {
        const key = `${song.source}:${song.id}`
        const identity = `${song.name}|${song.artist}`.toLowerCase()
        if (seen.has(key) || seen.has(identity)) return false
        seen.add(key)
        seen.add(identity)
        return true
      }).slice(0, limit)
      if (!songs.length) {
        return sendJson(response, 503, { error: 'theme playlists returned no usable songs', failedSources })
      }
      return sendJson(response, 200, { songs, playlists, failedSources, origin: 'theme-playlists' })
    } catch {
      return sendJson(response, 503, { error: 'theme playlists unavailable' })
    }
  }

  if (request.method === 'GET' && url.pathname === '/artists') {
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 60, 1), 120)
    if (!goMusicApiUrl) return sendJson(response, 503, { error: 'artist discovery requires go-music-api' })
    const cached = Date.now() < artistDiscoveryCache.expiresAt
    if (!cached) {
      if (!artistDiscoveryCache.pending) artistDiscoveryCache.pending = discoverArtists(goMusicApiUrl, normalizeGoSongs, fetch, { artistLimit: 120 })
        .then(result => {
          artistDiscoveryCache.artists = result.artists
          artistDiscoveryCache.loadedPlaylists = result.loadedPlaylists
          artistDiscoveryCache.expiresAt = Date.now() + (result.artists.length ? 20 * 60 * 1000 : 30000)
        })
        .catch(() => { artistDiscoveryCache.expiresAt = Date.now() + 30000 })
        .finally(() => { artistDiscoveryCache.pending = null })
      try { await artistDiscoveryCache.pending } catch { /* keep the last good batch */ }
    }
    const artists = artistDiscoveryCache.artists.slice(0, limit)
    if (!artists.length) return sendJson(response, 503, { error: 'artist discovery unavailable' })
    return sendJson(response, 200, { artists, loadedPlaylists: artistDiscoveryCache.loadedPlaylists, cached })
  }

  if (request.method === 'GET' && url.pathname === '/search') {
    const keyword = (url.searchParams.get('q') || '').trim()
    if (!keyword || keyword.length > 100) {
      return sendJson(response, 400, { error: 'q must contain 1-100 characters' })
    }

    const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 20, 1), 50)
    const sources = selectSources(url.searchParams.get('sources'))
    try {
      const key = JSON.stringify([keyword.normalize('NFKC').toLowerCase(), [...sources].sort(), limit])
      const result = await runtime.search(key, () => aggregateSearch(keyword, sources, limit))
      if (!result.songs.length && result.failedSources.length) return sendJson(response,503,{ error:'音源暂时不可用', ...result })
      return sendJson(response,200,result)
    } catch { return sendJson(response,503,{error:'音源繁忙，请稍后重试'}) }
  }

  if (request.method === 'GET' && url.pathname === '/bilibili/collection') {
    const bvid = url.searchParams.get('bvid') || ''
    if (!/^BV[a-zA-Z0-9]{10}$/.test(bvid)) return sendJson(response, 400, { error: 'invalid bvid' })
    if (!goMusicApiUrl) return sendJson(response, 503, { error: 'go-music-api is disabled' })
    try {
      const cached = collectionCache.get(bvid)
      if (cached && cached.expiresAt > Date.now()) return sendJson(response, 200, cached.value)
      const value = await loadBilibiliCollection(goMusicApiUrl, bvid, normalizeGoSongs)
      collectionCache.set(bvid, { value, expiresAt: Date.now() + 5 * 60000 })
      while (collectionCache.size > 32) collectionCache.delete(collectionCache.keys().next().value)
      return sendJson(response, 200, value)
    } catch {
      return sendJson(response, 502, { error: '无法获取 B 站目录，可能是访问限制、视频失效或上游超时，请稍后重试' })
    }
  }

  if (request.method === 'GET' && url.pathname === '/playlist') {
    const source = url.searchParams.get('source'), id = url.searchParams.get('id') || ''
    if (!['netease', 'qq'].includes(source) || !/^[0-9]{1,20}$/.test(id)) return sendJson(response, 400, { error: 'invalid playlist identifier' })
    if (!goMusicApiUrl) return sendJson(response, 503, { error: 'playlist provider disabled' })
    try {
      const query = new URLSearchParams({ source, id })
      const upstream = await fetch(`${goMusicApiUrl}/api/v1/playlist/detail?${query}`, { signal: AbortSignal.timeout(30000) })
      if (!upstream.ok) throw new Error('playlist unavailable')
      const payload = await upstream.json(), rows = payload?.data
      if (!Array.isArray(rows) || !rows.length || rows.length > 1000) throw new Error('empty or oversized playlist')
      return sendJson(response, 200, { songs: normalizeGoSongs(rows.filter(song => song.source === source), 1000) })
    } catch { return sendJson(response, 502, { error: 'playlist unavailable or exceeds 1000 entries' }) }
  }

  if (request.method === 'GET' && url.pathname === '/lyric') {
    const source = (url.searchParams.get('source') || '').toLowerCase()
    const id = (url.searchParams.get('id') || '').trim()
    if (!supportedSources.has(source) || !id) {
      return sendJson(response, 400, { error: 'invalid source or id' })
    }
    try {
      const engine = url.searchParams.get('engine') || ''
      const result = await lyricCache.get(JSON.stringify([...url.searchParams].sort()), async () => {
        const metingSource = source === 'qq' ? 'tencent' : source
        return resolveLyrics({ source, preferSeparated: engine !== 'go-music-api',
          readMeting: metingSources.has(metingSource) ? async () => parseResult(await withTimeout(createMeting(metingSource).lyric(id), 7000)) : undefined,
          readGo: goMusicApiUrl && goSources.has(normalizeSourceForGo(source)) ? async () => {
            const target = appendSongQuery(`${goMusicApiUrl}/api/v1/music/lyric`, {
              id, source, name: url.searchParams.get('name'), artist: url.searchParams.get('artist'),
              album: url.searchParams.get('album'), duration: url.searchParams.get('duration'), sourceExtra: url.searchParams.get('extra'),
            })
            const upstream = await fetch(target, { signal: AbortSignal.timeout(8000) }), result = await upstream.json()
            if (!upstream.ok || result.code != null && ![0, 200].includes(result.code)) throw new Error('lyric upstream failed')
            return result.data
          } : undefined,
        })
      })
      return sendJson(response, 200, result)
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
      const metingSource = source === 'qq' ? 'tencent' : source
      let target = ''
      let reason = ''
      if (isCover) {
        if (engine === 'go-music-api' && goMusicApiUrl) {
          const cover = url.searchParams.get('cover') || (id.startsWith('http') ? id : '')
          if (cover) {
            await coverRuntime.gate(() => proxyPublicCover(cover, response))
            return
          }
        } else {
          target = await resolveResourceCached(metingSource, 'pic', id, 300)
        }
      } else {
        const cacheKey = `${source}:${id}:${engine}`
        const cached = streamTargets.get(cacheKey)
        if (cached && cached.expiresAt > Date.now()) target = cached.target
        // go-music-api 分支先校验直链，失败再回退 Meting，不再盲跳 302。
        if (!target && engine === 'go-music-api' && goMusicApiUrl && goSources.has(normalizeSourceForGo(source))) {
          const goTarget = appendSongQuery(`${goMusicApiUrl}/api/v1/music/stream`, {
            id, source,
            name: url.searchParams.get('name'), artist: url.searchParams.get('artist'),
            album: url.searchParams.get('album'), duration: url.searchParams.get('duration'),
            coverOriginal: url.searchParams.get('cover'), sourceExtra: url.searchParams.get('extra'),
          })
          const probe = await probeMedia(goTarget)
          if (probe.ok) target = goTarget
          else reason = `go-music-api ${probe.status || probe.error || 'unreachable'}`
        }
        // 回退不再依赖 ID 形状，只看平台是否被 Meting 支持。
        if (!target && metingSources.has(metingSource)) {
          const resolved = await resolveResourceCached(metingSource, 'url', id, 320)
          if (resolved) {
            const probe = await probeMedia(resolved, sourceReferer(source))
            if (probe.ok) target = resolved
            else reason = `${reason ? `${reason}; ` : ''}meting ${probe.status || probe.error || 'unreachable'}`
          } else if (!reason) reason = 'meting empty url'
        }
        if (!target && !reason) reason = 'no compatible engine'
        if (target) streamTargets.set(cacheKey, { target, expiresAt: Date.now() + 5 * 60 * 1000 })
      }
      if (!target) return sendJson(response, 404, { error: 'resource unavailable', reason: reason || 'resource unavailable' })
      response.writeHead(302, { Location: target, 'Cache-Control': 'private, max-age=300' })
      return response.end()
    } catch (error) {
      if (response.headersSent) { response.destroy(); return }
      if (url.pathname === '/cover') {
        // 失败时不要用 200 返回占位图：浏览器会把它当作真实封面缓存，
        // 前端也无法感知失败并重试。改为明确的 502 + no-store。
        response.writeHead(502, {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-store',
          'X-Cover-Fallback': '1',
        })
        return response.end('cover unavailable')
      }
      return sendJson(response, 502, { error: error instanceof Error ? error.message : 'upstream failed' })
    }
  }

  return sendJson(response, 404, { error: 'not found' })
})

server.listen(port, host, () => {
  console.log(`FreeMusicPlayer provider listening on http://${host}:${port}`)
})
