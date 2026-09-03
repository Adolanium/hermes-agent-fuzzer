import http from 'node:http'
import type { AddressInfo } from 'node:net'

export const MOCK_REPLY = 'Hello from the fuzzer mock. No tools will run.'
export const MOCK_API_KEY = 'fuzzer-mock-key'

export type MockOutcome =
  | { kind: 'text'; text: string }
  | { kind: 'http'; status: number; body: string }
  | { kind: 'truncate'; text: string }
  | { kind: 'tools'; name: string; args: string }

function hashPrompt(prompt: string): number {
  let hash = 2166136261
  for (let i = 0; i < prompt.length; i += 1) {
    hash ^= prompt.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

export function mockReplyFor(prompt: string, unsafeTools = false): MockOutcome {
  if (prompt.includes('__mock_tools__')) {
    if (unsafeTools) {
      return { kind: 'tools', name: 'exec', args: '{"cmd":"echo fuzzer"}' }
    }
    return { kind: 'text', text: MOCK_REPLY }
  }
  if (prompt.includes('__mock_ok__')) {
    return { kind: 'text', text: MOCK_REPLY }
  }
  if (prompt.includes('__mock_500__')) {
    return { kind: 'http', status: 500, body: JSON.stringify({ error: { message: 'mock upstream 500', type: 'server_error' } }) }
  }
  if (prompt.includes('__mock_truncate__')) {
    return { kind: 'truncate', text: 'partial mock stream that never finishes' }
  }
  if (prompt.includes('__mock_empty__')) {
    return { kind: 'text', text: '' }
  }
  const n = hashPrompt(prompt)
  if (prompt.length > 4000 || n % 17 === 0) {
    return { kind: 'text', text: `# Long mock\n\n${'paragraph '.repeat(400)}` }
  }
  if (n % 11 === 0) {
    return { kind: 'http', status: 500, body: JSON.stringify({ error: { message: 'mock upstream 500', type: 'server_error' } }) }
  }
  if (n % 13 === 0) {
    return { kind: 'truncate', text: 'partial mock stream that never finishes' }
  }
  if (n % 5 === 0) {
    return {
      kind: 'text',
      text: '```js\nconsole.log("<script>alert(1)</script>")\n```\n\n**bold** and [link](https://example.invalid)',
    }
  }
  if (n % 3 === 0) {
    return { kind: 'text', text: `\u202e${'مرحبا '.repeat(20)}🔥` }
  }
  return { kind: 'text', text: MOCK_REPLY }
}

export type MockServer = {
  port: number
  url: string
  receivedPrompts: string[]
  close: () => Promise<void>
}

function sseChunk(model: string, delta: Record<string, unknown>, finishReason: string | null = null): string {
  return `data: ${JSON.stringify({
    id: 'fuzzer-completion',
    object: 'chat.completion.chunk',
    created: 0,
    model,
    choices: [{ index: 0, delta, finish_reason: finishReason }],
  })}\n\n`
}

function streamText(res: http.ServerResponse, model: string, text: string): void {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  })
  res.write(sseChunk(model, { role: 'assistant' }))
  res.write(sseChunk(model, { content: text }))
  res.write(sseChunk(model, {}, 'stop'))
  res.write('data: [DONE]\n\n')
  res.end()
}

function jsonTools(res: http.ServerResponse, model: string, name: string, args: string): void {
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(
    JSON.stringify({
      id: 'fuzzer-completion',
      object: 'chat.completion',
      created: 0,
      model,
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: null,
            tool_calls: [{ id: 'call_fuzzer', type: 'function', function: { name, arguments: args } }],
          },
          finish_reason: 'tool_calls',
        },
      ],
    }),
  )
}

function jsonText(res: http.ServerResponse, model: string, text: string): void {
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(
    JSON.stringify({
      id: 'fuzzer-completion',
      object: 'chat.completion',
      created: 0,
      model,
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: text },
          finish_reason: 'stop',
        },
      ],
      usage: { prompt_tokens: 8, completion_tokens: 16, total_tokens: 24 },
    }),
  )
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => {
      chunks.push(chunk)
    })
    req.on('end', () => {
      resolve(Buffer.concat(chunks).toString('utf8'))
    })
    req.on('error', reject)
  })
}

export function startMockServer(opts?: { unsafeTools?: boolean }): Promise<MockServer> {
  const receivedPrompts: string[] = []

  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Access-Control-Allow-Headers', '*')
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')

      if (req.method === 'OPTIONS') {
        res.writeHead(204)
        res.end()
        return
      }

      if (req.method === 'GET' && req.url === '/v1/models') {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(
          JSON.stringify({
            object: 'list',
            data: [{ id: 'mock-model', object: 'model', created: 0, owned_by: 'mock' }],
          }),
        )
        return
      }

      if (req.method === 'POST' && req.url?.startsWith('/v1/chat/completions')) {
        void readBody(req)
          .then((body) => {
            let stream = false
            let model = 'mock-model'
            try {
              const parsed: unknown = JSON.parse(body)
              if (typeof parsed === 'object' && parsed !== null) {
                const record = parsed as Record<string, unknown>
                stream = record.stream === true
                if (typeof record.model === 'string' && record.model) {
                  model = record.model
                }
                const messages = record.messages
                if (Array.isArray(messages)) {
                  for (let i = messages.length - 1; i >= 0; i -= 1) {
                    const message = messages[i]
                    if (typeof message === 'object' && message !== null && 'role' in message && 'content' in message) {
                      if (message.role === 'user' && typeof message.content === 'string') {
                        receivedPrompts.push(message.content)
                        break
                      }
                    }
                  }
                }
              }
            } catch {
              // Malformed body still gets a canned reply. Never tool_calls.
            }

            const outcome = mockReplyFor(receivedPrompts[receivedPrompts.length - 1] ?? '', opts?.unsafeTools === true)
            if (outcome.kind === 'tools') {
              jsonTools(res, model, outcome.name, outcome.args)
              return
            }
            if (outcome.kind === 'http') {
              res.writeHead(outcome.status, { 'Content-Type': 'application/json' })
              res.end(outcome.body)
              return
            }
            if (outcome.kind === 'truncate') {
              res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                Connection: 'keep-alive',
              })
              res.write(sseChunk(model, { role: 'assistant' }))
              res.write(sseChunk(model, { content: outcome.text }))
              res.end()
              return
            }
            if (stream) {
              streamText(res, model, outcome.text)
            } else {
              jsonText(res, model, outcome.text)
            }
          })
          .catch(() => {
            res.writeHead(400)
            res.end('Bad request')
          })
        return
      }

      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Not found' }))
    })

    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      if (addr === null || typeof addr === 'string') {
        reject(new Error('Mock server failed to bind'))
        return
      }
      const info: AddressInfo = addr
      resolve({
        port: info.port,
        url: `http://127.0.0.1:${info.port}`,
        receivedPrompts,
        close: () =>
          new Promise((resolveClose, rejectClose) => {
            server.close((err) => {
              if (err) {
                rejectClose(err)
              } else {
                resolveClose()
              }
            })
          }),
      })
    })
  })
}
