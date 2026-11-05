import test from 'node:test'
import assert from 'node:assert/strict'
import { searchRows } from './upstream-search.mjs'
test('successful null search list is empty, not a source outage',()=>{
  assert.deepEqual(searchRows({code:200,data:{type:'song',songs:null}}),[])
  assert.deepEqual(searchRows({code:200,data:{songs:[]}}),[])
  assert.deepEqual(searchRows({data:{songs:[{id:'1'}]}}),[{id:'1'}])
})
test('bad search responses remain errors',()=>{
  for(const payload of [{code:500,data:{songs:null}},{data:{}},{data:{songs:'wrong'}},null])assert.throws(()=>searchRows(payload))
})
