export interface StreamEvent { event: string; data: string }

/** Incremental SSE parser; accepts split UTF-8/CRLF chunks and a final unterminated frame. */
export const createSseParser = (receive: (event: StreamEvent) => void) => {
  let buffer = ''
  const emit = (frame: string) => {
    let event = 'message'
    const data: string[] = []
    for (const line of frame.split(/\r?\n/)) {
      if (line.startsWith('event:')) event = line.slice(6).trim()
      if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''))
    }
    if (data.length) receive({ event, data: data.join('\n') })
  }
  return {
    push(chunk: string) {
      buffer += chunk
      const frames = buffer.split(/\r?\n\r?\n/)
      buffer = frames.pop() || ''
      frames.forEach(emit)
    },
    finish() { if (buffer) emit(buffer); buffer = '' },
  }
}
