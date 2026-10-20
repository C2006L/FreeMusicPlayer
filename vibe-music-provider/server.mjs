import http from 'node:http'
import Meting from '@meting/core'

const port = Number(process.env.PORT || 3001)
const host = process.env.HOST || '127.0.0.1'
const supportedSources = new Set(['netease', 'tencent', 'kugou', 'kuwo', 'baidu'])
const defaultSources = ['netease', 'tencent', 'kugou', 'kuwo']
const sourceNames = {
  netease: '网易云音乐',
  tencent: 'QQ 音乐',
  kugou: '酷狗音乐',
  kuwo: '酷我音乐',
  baidu: '百度音乐',
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
  const meting = new Meting(source)
  meting.format(true)
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
    urlId: String(song.url_id ?? song.id ?? ''),
    lyricId: String(song.lyric_id ?? song.id ?? ''),
    picId: String(song.pic_id ?? ''),
  })).filter((song) => song.id && song.name)
}

const resolveResource = async (source, type, id, sizeOrBitrate) => {
  const meting = new Meting(source)
  meting.format(true)
  const raw = type === 'pic'
    ? await meting.pic(id, sizeOrBitrate)
    : await meting.url(id, sizeOrBitrate)
  const payload = parseResult(raw)
  const item = Array.isArray(payload) ? payload[0] : payload
  if (typeof item === 'string') return item
  return item?.url || item?.pic || item?.src || ''
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || `${host}:${port}`}`)

  if (request.method === 'GET' && url.pathname === '/health') {
    return sendJson(response, 200, { status: 'ok', sources: [...supportedSources] })
  }

  if (request.method === 'GET' && url.pathname === '/search') {
    const keyword = (url.searchParams.get('q') || '').trim()
    if (!keyword || keyword.length > 100) {
      return sendJson(response, 400, { error: 'q must contain 1-100 characters' })
    }

    const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 5, 1), 20)
    const sources = selectSources(url.searchParams.get('sources'))
    const settled = await Promise.allSettled(
      sources.map((source) => withTimeout(searchSource(source, keyword, limit), 12000))
    )
    const failedSources = []
    const songs = []
    settled.forEach((result, index) => {
      if (result.status === 'fulfilled') songs.push(...result.value)
      else failedSources.push(sources[index])
    })

    const seen = new Set()
    const deduplicated = songs.filter((song) => {
      const key = `${song.name.toLowerCase()}::${song.artist.toLowerCase()}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    return sendJson(response, 200, { songs: deduplicated, failedSources })
  }

  if (request.method === 'GET' && ['/stream', '/cover'].includes(url.pathname)) {
    const source = (url.searchParams.get('source') || '').toLowerCase()
    const id = (url.searchParams.get('id') || '').trim()
    if (!supportedSources.has(source) || !id) {
      return sendJson(response, 400, { error: 'invalid source or id' })
    }
    try {
      const isCover = url.pathname === '/cover'
      const target = await resolveResource(source, isCover ? 'pic' : 'url', id, isCover ? 300 : 320)
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
  console.log(`Vibe Music provider listening on http://${host}:${port}`)
})
