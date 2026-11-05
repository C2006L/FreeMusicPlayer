import { test } from 'node:test'
import assert from 'node:assert/strict'
import { metingMetadata } from './meting-metadata.mjs'
test('Meting raw durations are joined by ID with explicit platform units', () => {
  const net=metingMetadata('netease',{result:{songs:[{id:520460577,dt:268333},{id:1,dt:30000}]}})
  assert.equal(net.get('520460577').duration,268.333)
  assert.equal(net.get('1').duration,30)
  assert.equal(metingMetadata('tencent',{data:{song:{list:[{songmid:'MID',interval:268}]}}}).get('mid').duration,268)
  assert.equal(metingMetadata('kugou',{data:{info:[{hash:'ABCDEF',duration:268}]}}).get('abcdef').duration,268)
})
test('missing or malformed duration stays unknown rather than granting fallback confidence', () => {
  assert.equal(metingMetadata('netease','invalid').size,0)
  assert.equal(metingMetadata('netease',{result:{songs:[{id:1}]}}).get('1').duration,0)
  assert.equal(metingMetadata('netease',{result:{songs:[{id:1,dt:268333}]}}).has('2'),false)
})
