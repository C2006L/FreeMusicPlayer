export const normalizeForRank = value => String(value || '').normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '')
export const matchesSearch = (song, keyword) => {
  const haystack = normalizeForRank(`${song.name} ${song.artist} ${song.album}`)
  const terms = String(keyword || '').trim().split(/\s+/).map(normalizeForRank).filter(Boolean)
  return terms.length > 0 && terms.every(term => haystack.includes(term))
}

export const relevanceScore = (song, keyword) => {
  const query = normalizeForRank(keyword)
  const name = normalizeForRank(song.name)
  const artist = normalizeForRank(song.artist)
  const terms = String(keyword).trim().split(/\s+/).map(normalizeForRank).filter(Boolean)
  let score = name === query ? 100 : name.startsWith(query) ? 80 : name.includes(query) ? 60 : 0
  if (artist === query) score += 50
  else if (artist.includes(query)) score += 25
  score += terms.filter(term => name.includes(term) || artist.includes(term)).length * 15
  if (song.availability === 'unavailable') score -= 30
  if (song.availability === 'restricted') score -= 8
  return score
}
