import dns from 'node:dns/promises'
import http from 'node:http'
import https from 'node:https'
import { isIP } from 'node:net'

export const isPublicAddress = address => {
  if (isIP(address) === 6) return /^[23]/i.test(address) && !/^2001:db8:|^2002:/i.test(address)
  if (isIP(address) !== 4) return false
  const [a,b] = address.split('.').map(Number)
  return !(a===0 || a===10 || a===127 || a>=224 || a===169&&b===254 || a===172&&b>=16&&b<=31 || a===192&&b===168 || a===100&&b>=64&&b<=127 || a===198&&[18,19].includes(b))
}
export const publicCoverUrl = raw => {
  const url = new URL(raw)
  if (!['http:','https:'].includes(url.protocol) || url.username || url.password || url.port && !['80','443'].includes(url.port)) throw new Error('invalid cover URL')
  if (['localhost','localhost.localdomain'].includes(url.hostname.toLowerCase()) || isIP(url.hostname.replace(/^\[|\]$/g,'')) && !isPublicAddress(url.hostname.replace(/^\[|\]$/g,''))) throw new Error('private cover URL')
  // Netease serves full-size originals (often several MB) and its plain HTTP
  // edges may redirect to private CDN addresses. Use HTTPS and ask for a
  // card-sized variant instead of downloading the original.
  if (url.hostname.endsWith('music.126.net')) {
    url.protocol = 'https:'
    if (!url.searchParams.has('param')) url.searchParams.set('param', '400y400')
  }
  return url
}
// getaddrinfo 走 libuv 线程池且无法取消：超时放弃的解析仍占用线程，长跑进程
// 反复超时后线程池被占满，后续所有封面的解析都只能等到超时。这里按域名去重
// 并缓存结果，超时后做负缓存，避免对同一坏域名反复堆积无法取消的解析。
const hostCache = new Map()
const hostInflight = new Map()
const resolvePublicHost = hostname => {
  const cached = hostCache.get(hostname)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.error ? Promise.reject(new Error(cached.error)) : Promise.resolve(cached.addresses)
  }
  const pending = hostInflight.get(hostname)
  if (pending) return pending
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('cover DNS timeout')), 10_000)
    if (typeof timer.unref === 'function') timer.unref()
  })
  const task = Promise.race([dns.lookup(hostname, { all: true }), timeout])
    .then(addresses => {
      hostCache.set(hostname, { addresses, expiresAt: Date.now() + 5 * 60_000 })
      return addresses
    }, error => {
      hostCache.set(hostname, { error: error.message, expiresAt: Date.now() + 60_000 })
      throw error
    })
    .finally(() => { clearTimeout(timer); hostInflight.delete(hostname) })
  while (hostCache.size > 100) hostCache.delete(hostCache.keys().next().value)
  hostInflight.set(hostname, task)
  return task
}
// Validate each redirect and pin the DNS result to the actual connection.
export const proxyPublicCover = async (raw, response, depth = 0) => {
  if (depth > 3) throw new Error('cover redirect limit')
  const url = publicCoverUrl(raw)
  const addresses = await resolvePublicHost(url.hostname.replace(/^\[|\]$/g,''))
  if (!addresses.length || addresses.some(item=>!isPublicAddress(item.address))) throw new Error('private DNS result')
  const pinned=addresses.find(item=>item.family===4) || addresses[0]
  const upstream=await new Promise((resolve,reject)=>{
    const request=(url.protocol==='https:'?https:http).get(url,{lookup:(_host,options,callback)=>options.all?callback(null,[pinned]):callback(null,pinned.address,pinned.family),headers:{'User-Agent':'FreeMusicPlayer/2.0',Referer:url.hostname.endsWith('hdslb.com')?'https://www.bilibili.com/':url.origin},timeout:8000},resolve)
    request.on('timeout',()=>request.destroy(new Error('cover timeout')));request.on('error',reject)
  })
  if (upstream.statusCode>=300 && upstream.statusCode<400 && upstream.headers.location) {upstream.destroy();return proxyPublicCover(new URL(upstream.headers.location,url).href,response,depth+1)}
  const type=String(upstream.headers['content-type']||'').split(';')[0]
  if (upstream.statusCode!==200 || !/^image\/(jpeg|jpg|png|webp|gif|avif|bmp)$/i.test(type) || Number(upstream.headers['content-length']||0)>5*1024*1024) {upstream.destroy();throw new Error('invalid image response')}
  response.writeHead(200,{'Content-Type':type,'Cache-Control':'private, max-age=300','X-Content-Type-Options':'nosniff'})
  await new Promise((resolve,reject)=>{
    let bytes=0
    upstream.on('data',chunk=>{bytes+=chunk.length;if(bytes>5*1024*1024)upstream.destroy(new Error('image too large'))})
    upstream.on('error',error=>{response.destroy();reject(error)})
    response.on('close',()=>upstream.destroy())
    upstream.on('end',resolve);upstream.pipe(response)
  })
}
