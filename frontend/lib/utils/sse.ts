import type { SSEEvent } from '@/lib/types/api'

export async function* parseSSEStream(
  stream: ReadableStream<Uint8Array>
): AsyncGenerator<SSEEvent> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const events = buffer.split('\n\n')
      buffer = events.pop() ?? ''

      for (const raw of events) {
        if (!raw.trim()) continue
        let eventType = ''
        let dataLine = ''

        for (const line of raw.split('\n')) {
          if (line.startsWith('event: ')) eventType = line.slice(7).trim()
          if (line.startsWith('data: '))  dataLine  = line.slice(6).trim()
        }

        if (!eventType || !dataLine) continue

        try {
          const payload = JSON.parse(dataLine)
          if (eventType === 'token')    yield { type: 'token',    ...payload } as SSEEvent
          if (eventType === 'complete') yield { type: 'complete', ...payload } as SSEEvent
          if (eventType === 'error')    yield { type: 'error',    ...payload } as SSEEvent
        } catch {
          // malformed JSON — skip
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}
