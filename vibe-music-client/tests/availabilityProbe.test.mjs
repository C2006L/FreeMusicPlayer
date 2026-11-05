import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

const load = async path => {
  const code = ts.transpile((await readFile(new URL(path, import.meta.url), 'utf8')), { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 })
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
}
const { probeAvailabilityOnDemand, availabilityKey, availabilityProbeState } = await load('../src/utils/availabilityProbe.ts')

test('on-demand probes cap concurrency and apply each grade', async () => {
  let active = 0
  let peak = 0
  const applied = []
  await new Promise(resolve => {
    let done = 0
    for (let i = 0; i < 7; i++) {
      probeAvailabilityOnDemand(
        { source: 'netease', sourceUrlId: `cap-${i}` },
        async () => {
          active++; peak = Math.max(peak, active)
          await new Promise(r => setTimeout(r, 80))
          active--
          return 'full'
        },
        grade => { applied.push(grade); if (++done === 7) resolve() }
      )
    }
  })
  assert.equal(peak, 3)
  assert.equal(applied.length, 7)
  assert.equal(availabilityProbeState().active, 0)
})

test('the same resource is probed only once while pending and after it finishes', async () => {
  let calls = 0
  const song = { source: 'netease', sourceUrlId: 'dedupe-1' }
  const probe = async () => { calls++; await new Promise(r => setTimeout(r, 50)); return 'preview' }
  probeAvailabilityOnDemand(song, probe, () => {})
  probeAvailabilityOnDemand(song, probe, () => {})
  probeAvailabilityOnDemand(song, probe, () => {})
  await new Promise(r => setTimeout(r, 80))
  assert.equal(calls, 1)
  probeAvailabilityOnDemand(song, probe, () => {})
  await new Promise(r => setTimeout(r, 80))
  assert.equal(calls, 1)
})

test('a failed probe keeps unknown and is not retried in this session', async () => {
  let calls = 0
  const song = { source: 'kugou', sourceUrlId: 'fail-1' }
  const probe = async () => { calls++; throw new Error('upstream down') }
  probeAvailabilityOnDemand(song, probe, () => { throw new Error('must not apply') })
  await new Promise(r => setTimeout(r, 50))
  assert.equal(calls, 1)
  probeAvailabilityOnDemand(song, probe, () => { throw new Error('must not apply') })
  await new Promise(r => setTimeout(r, 50))
  assert.equal(calls, 1)
  assert.equal(availabilityKey(song), 'kugou:fail-1')
})
