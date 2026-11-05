// A successful upstream search may represent an empty list as null.
// Keep empty results distinct from connection and protocol failures.
export const searchRows = payload => {
  if (!payload || typeof payload !== 'object' || payload.code != null && ![0, 200].includes(payload.code)) throw new Error('upstream search rejected')
  const data = payload.data
  if (!data || typeof data !== 'object' || !Object.hasOwn(data, 'songs')) throw new Error('invalid upstream search payload')
  if (data.songs === null) return []
  if (!Array.isArray(data.songs)) throw new Error('invalid upstream song list')
  return data.songs
}
