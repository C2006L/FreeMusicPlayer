import type { LyricDocument } from './lyricLines'
export type StoredLyrics = { key: string; document: LyricDocument; imported: boolean; updated: number; offset: number; schema?: number }
// Bump only when normalized timing/channel semantics change. User imports and
// finished translations remain readable rather than being silently discarded.
export const LYRIC_SCHEMA = 2
export function reusableLyrics(value: StoredLyrics, now = Date.now()) {
  return value.imported || ((value.schema === LYRIC_SCHEMA || value.document.translationSource.includes('Ollama')) && now - value.updated < 86400000)
}
// Private, per-browser storage; lyrics never enter playback history or the queue.
const database = () => new Promise<IDBDatabase>((resolve, reject) => {
  const request = indexedDB.open('fmp-lyrics-v1', 1)
  request.onupgradeneeded = () => request.result.createObjectStore('lyrics', { keyPath: 'key' })
  request.onsuccess = () => resolve(request.result)
  request.onerror = () => reject(request.error)
})
export async function readLyrics(key: string): Promise<StoredLyrics | undefined> {
  const db = await database()
  try { return await new Promise((resolve, reject) => {
    const request = db.transaction('lyrics').objectStore('lyrics').get(key)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  }) } finally { db.close() }
}
export async function saveLyrics(value: StoredLyrics) {
  const db = await database()
  try { await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('lyrics', 'readwrite'), store = tx.objectStore('lyrics')
    store.put(value)
    const request = store.getAll()
    request.onsuccess = () => {
      // Preserve imports; evict oldest ordinary cache records first.
      const records = (request.result as StoredLyrics[]).sort((a, b) => Number(a.imported) - Number(b.imported) || a.updated - b.updated)
      records.slice(0, Math.max(0, records.length - 200)).forEach(row => store.delete(row.key))
    }
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  }) } finally { db.close() }
}
