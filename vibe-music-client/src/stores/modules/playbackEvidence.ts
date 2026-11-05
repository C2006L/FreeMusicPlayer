import { defineStore } from 'pinia'
import { ref, onScopeDispose } from 'vue'
import type { PlaybackEvidence } from '@/utils/playbackPolicy'

interface Identity { source?: string; providerEngine?: string; sourceSongId?: string; songId?: string | number; id?: string }
export const resourceIdentity = (song: Identity) => `${song.providerEngine || 'meting'}:${song.source === 'tencent' ? 'qq' : song.source || 'local'}:${song.sourceSongId || song.songId || song.id}`
// Session-only: expiring signed URLs and account rights can change after reload.
export const usePlaybackEvidence = defineStore('playbackEvidence', () => {
  const records = ref<Record<string, { state: PlaybackEvidence; at: number }>>({})
  const now = ref(Date.now())
  const timer = setInterval(() => { now.value = Date.now() }, 30000)
  onScopeDispose(() => clearInterval(timer))
  const get = (song: Identity): PlaybackEvidence => {
    const record = records.value[resourceIdentity(song)]
    return record && Math.max(now.value, Date.now()) - record.at < 15 * 60 * 1000 ? record.state : 'unknown'
  }
  const set = (song: Identity, state: PlaybackEvidence) => {
    records.value[resourceIdentity(song)] = { state, at: Date.now() }
    const keys = Object.keys(records.value)
    if (keys.length > 500) delete records.value[keys[0]]
  }
  return { records, get, set }
})
