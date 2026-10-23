import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

const load = async path => {
  const code = ts.transpile((await readFile(new URL(path, import.meta.url), 'utf8')), { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 })
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
}
const { createSseParser } = await load('../src/utils/sse.ts')
const { relatedArtists, artistNames } = await load('../src/utils/artists.ts')

test('SSE preserves multiline data and split CRLF, emits the final frame', () => {
  const events = []
  const parser = createSseParser(event => events.push(event))
  parser.push('event: text\r\ndata: 你好\r')
  parser.push('\ndata: 第二行\r\n\r')
  parser.push('\nevent: done\ndata: ')
  parser.finish()
  assert.deepEqual(events, [{ event: 'text', data: '你好\n第二行' }, { event: 'done', data: '' }])
})
test('SSE comments and heartbeat do not become chat text', () => {
  const events = []
  const parser = createSseParser(e => events.push(e))
  parser.push(': ping\n\nevent: songs\ndata: []\n\n')
  assert.deepEqual(events, [{ event: 'songs', data: '[]' }])
})
test('artist names containing slash/ampersand/parentheses remain intact', () => {
  assert.deepEqual(artistNames('AC/DC, Simon & Garfunkel, 郑钧 (Jun Zheng)'), ['AC/DC', 'Simon & Garfunkel', '郑钧 (Jun Zheng)'])
})
test('related artists retain platform identity and counts', () => {
  const songs = [{ artistName: 'AC/DC', source: 'netease' }, { artistName: 'AC/DC', source: 'qq' }, { artistName: 'AC/DC', source: 'qq' }, { artistName: 'Other', source: 'qq' }]
  const result = relatedArtists(songs, 'ac/dc')
  assert.equal(result.length, 2)
  assert.equal(result[0].source, 'qq')
  assert.equal(result[0].count, 2)
})
