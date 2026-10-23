import { test } from 'node:test'
import assert from 'node:assert/strict'
import { matchesSearch, relevanceScore } from './search-utils.mjs'

test('combined title and artist query rejects unrelated upstream filler', () => {
  assert.equal(matchesSearch({ name: 'Hello', artist: 'Adele' }, 'Adele Hello'), true)
  assert.equal(matchesSearch({ name: 'Hello Kitty', artist: 'Other' }, 'Adele Hello'), false)
  assert.equal(matchesSearch({ name: 'Completely different', artist: 'Other' }, 'numb'), false)
})
test('exact title outranks a partial title and keeps independent artist matches', () => {
  assert.ok(relevanceScore({name:'Numb',artist:'Linkin Park'}, 'numb') > relevanceScore({name:'Numb Live',artist:'Other'}, 'numb'))
  assert.equal(matchesSearch({ name: 'Numb', artist: 'Other Artist' }, 'numb'), true)
})
