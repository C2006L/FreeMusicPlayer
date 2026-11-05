type Grade = 'full' | 'preview' | 'unavailable' | 'restricted'

const MAX_CONCURRENT = 3
const queue: Array<() => void> = []
const pending = new Set<string>()
const attempted = new Set<string>()
let active = 0

/** 同一来源下同一个曲目只探测一次，避免悬停反复触发。 */
export const availabilityKey = (song: any) =>
  `${song?.source || ''}:${song?.sourceUrlId || song?.sourceSongId || song?.songId || ''}`

const drain = () => {
  while (active < MAX_CONCURRENT && queue.length) queue.shift()!()
}

/**
 * 按需探测单条在线资源：全局最多 3 个并发，同一曲目在本页面生命周期内只请求一次；
 * 失败时保持 unknown，不做重试。
 */
export const probeAvailabilityOnDemand = (
  song: any,
  probe: () => Promise<Grade | null>,
  apply: (grade: Grade) => void
) => {
  const key = availabilityKey(song)
  if (!key || pending.has(key) || attempted.has(key)) return
  pending.add(key)
  const run = async () => {
    active++
    try {
      const grade = await probe()
      if (grade) apply(grade)
    } catch {
      // 探测失败不改变展示，仍为完整性未知。
    } finally {
      attempted.add(key)
      pending.delete(key)
      active--
      drain()
    }
  }
  queue.push(run)
  drain()
}

/** 仅供测试观察调度状态。 */
export const availabilityProbeState = () => ({
  active,
  queued: queue.length,
  attempted: attempted.size,
})
