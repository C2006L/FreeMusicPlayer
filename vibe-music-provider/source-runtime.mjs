export class SourceRuntime {
  constructor({ concurrency = 6, queueCapacity = 60 } = {}) {
    this.concurrency = concurrency; this.queueCapacity = queueCapacity; this.active = 0; this.queue = []
    this.cache = new Map(); this.inflight = new Map(); this.sources = new Map(); this.cacheHits = 0; this.coalesced = 0
  }
  async gate(load) {
    if (this.active >= this.concurrency) {
      if (this.queue.length >= this.queueCapacity) throw new Error('SOURCE_BUSY')
      await new Promise((resolve, reject) => {
        const wake = () => { clearTimeout(timer); resolve() }
        const timer = setTimeout(() => { const index=this.queue.indexOf(wake); if(index>=0)this.queue.splice(index,1); reject(new Error('SOURCE_QUEUE_TIMEOUT')) }, 5000)
        this.queue.push(wake)
      })
    } else this.active++
    try { return await load() } finally { const next = this.queue.shift(); if (next) next(); else this.active-- }
  }
  async source(name, load) {
    const stats = this.sources.get(name) || { requests: 0, successes: 0, empty: 0, failures: 0, totalMs: 0, lastMs: 0, streak: 0, openUntil: 0 }
    this.sources.set(name, stats)
    if (stats.openUntil > Date.now()) throw new Error('SOURCE_COOLDOWN')
    return this.gate(async () => {
      const start = Date.now(); stats.requests++
      try { const result = await load(); stats.successes++; if (!result.length) stats.empty++; stats.streak = 0; stats.openUntil = 0; return result }
      catch (error) { stats.failures++; if (++stats.streak >= 3) stats.openUntil = Date.now() + 30000; throw error }
      finally { stats.lastMs = Date.now() - start; stats.totalMs += stats.lastMs }
    })
  }
  async search(key, load) {
    const cached = this.cache.get(key)
    if (cached?.expiresAt > Date.now()) { this.cacheHits++; return cached.value }
    if (this.inflight.has(key)) { this.coalesced++; return this.inflight.get(key) }
    if (this.inflight.size >= 100) throw new Error('SEARCH_BUSY')
    const pending = Promise.resolve().then(load).then(value => {
      if (value.songs.length || !value.failedSources.length) this.cache.set(key, { value, expiresAt: Date.now() + (value.songs.length ? 30000 : 4000) })
      for (const [id, item] of this.cache) if (item.expiresAt <= Date.now()) this.cache.delete(id)
      while (this.cache.size > 200) this.cache.delete(this.cache.keys().next().value)
      return value
    }).finally(() => this.inflight.delete(key))
    this.inflight.set(key, pending); return pending
  }
  metrics() {
    return { active: this.active, queued: this.queue.length, concurrency: this.concurrency, queueCapacity: this.queueCapacity, cacheHits: this.cacheHits, coalesced: this.coalesced, cachedSearches: this.cache.size, inflightSearches: this.inflight.size, sources: Object.fromEntries([...this.sources].map(([name, s]) => [name, { ...s, meanMs: s.requests ? s.totalMs / s.requests : 0 }])) }
  }
}
