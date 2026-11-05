import test from 'node:test'
import assert from 'node:assert/strict'
import { SourceRuntime } from './source-runtime.mjs'
import { publicCoverUrl, isPublicAddress } from './public-cover.mjs'

test('identical in-flight searches coalesce and successful results are cached', async () => {
  const runtime = new SourceRuntime()
  let calls = 0
  const load = async () => { calls++; await new Promise(r => setTimeout(r, 10)); return { songs: [{ id: '1' }], failedSources: [] } }
  const [a, b] = await Promise.all([runtime.search('same', load), runtime.search('same', load)])
  assert.deepEqual(a, b)
  await runtime.search('same', load)
  assert.equal(calls, 1)
  assert.equal(runtime.metrics().coalesced, 1)
  assert.equal(runtime.metrics().cacheHits, 1)
})

test('failed searches are not cached as empty results', async () => {
  const runtime = new SourceRuntime(); let calls = 0
  const load = async () => { calls++; return { songs: [], failedSources: ['go:qq'] } }
  await runtime.search('failure', load); await runtime.search('failure', load)
  assert.equal(calls, 2)
})

test('bounded source queue rejects excess work and returns all permits', async () => {
  const runtime = new SourceRuntime({ concurrency: 1, queueCapacity: 1 })
  let release
  const first = runtime.gate(() => new Promise(resolve => { release = resolve }))
  const second = runtime.gate(async () => 'second')
  await assert.rejects(runtime.gate(async () => 'excess'), /SOURCE_BUSY/)
  release('first')
  assert.deepEqual(await Promise.all([first, second]), ['first', 'second'])
  assert.equal(runtime.active, 0); assert.equal(runtime.queue.length, 0)
})

test('three source errors open cooldown and a later success recovers it', async () => {
  const runtime = new SourceRuntime()
  for (let i = 0; i < 3; i++) await assert.rejects(runtime.source('broken', async () => { throw new Error('offline') }), /offline/)
  await assert.rejects(runtime.source('broken', async () => []), /SOURCE_COOLDOWN/)
  runtime.sources.get('broken').openUntil = 0
  await runtime.source('broken', async () => [{ id: 1 }])
  assert.equal(runtime.metrics().sources.broken.failures, 3)
  assert.equal(runtime.metrics().sources.broken.streak, 0)
})

test('cover targets reject local addresses, numeric aliases, credentials and private IPv6', () => {
  for (const raw of ['http://localhost/a', 'http://127.1/a', 'http://2130706433/a', 'http://10.1.2.3/a', 'http://169.254.169.254/a', 'http://[::1]/a', 'http://[::ffff:127.0.0.1]/a', 'https://example.com:8443/a', 'https://a:b@example.com/a', 'file:///etc/passwd']) assert.throws(() => publicCoverUrl(raw), raw)
  assert.equal(publicCoverUrl('https://i0.hdslb.com/cover.jpg').protocol, 'https:')
  assert.equal(isPublicAddress('8.8.8.8'), true)
  assert.equal(isPublicAddress('100.64.0.1'), false)
  assert.equal(isPublicAddress('2001:db8::1'), false)
})
