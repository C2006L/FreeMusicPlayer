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
test('an exact artist query ranks original artist above titles merely naming that artist',()=>{
  assert.ok(relevanceScore({name:'童年',artist:'罗大佑'},'罗大佑') > relevanceScore({name:'罗大佑（你的样子）',artist:'其他歌手'},'罗大佑'))
})
test('combined exact title and artist outrank a compilation title containing both',()=>{
 assert.ok(relevanceScore({name:'童年',artist:'罗大佑',duration:233},'童年 罗大佑')>relevanceScore({name:'童年 罗大佑 经典音乐合集',artist:'Other'},'童年 罗大佑'))
})
