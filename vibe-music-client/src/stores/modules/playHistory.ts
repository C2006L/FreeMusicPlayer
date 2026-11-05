import { defineStore } from 'pinia'
import type { trackModel } from '@/stores/interface'
import type { PlayedEntry } from '@/utils/history'
import { recordPlayedEntry, historyKey } from '@/utils/history'
import piniaPersistConfig from '@/stores/helper/persist'

export const usePlayHistory = defineStore('PlayHistory', {
  state: () => ({ entries: [] as PlayedEntry[] }),
  actions: {
    record(track: trackModel, position: number) { this.entries = recordPlayedEntry(this.entries, track, position) },
    updatePosition(track: trackModel, position: number) {
      const entry = this.entries.find(item => historyKey(item.track) === historyKey(track))
      if (entry) { entry.position = Math.max(0, position); entry.track = { ...entry.track, cover: track.cover, url: track.url } }
    },
  },
  persist: piniaPersistConfig('PlayHistory'),
})
