import http from 'node:http'
import Meting from '@meting/core'
import { relevanceScore, matchesSearch } from './search-utils.mjs'
import { discoverFromPlaylists, discoveryBatch } from './discovery.mjs'
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
      return sendJson(response, 502, { error: error instanceof Error ? error.message : 'upstream failed' })
    }
  }

  return sendJson(response, 404, { error: 'not found' })
})

server.listen(port, host, () => {
  console.log(`FreeMusicPlayer provider listening on http://${host}:${port}`)
})
