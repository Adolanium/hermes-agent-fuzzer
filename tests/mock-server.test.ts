import { describe, expect, it } from 'vitest'

import { MOCK_REPLY, mockReplyFor, startMockServer } from '../src/mock/server.ts'

describe('mock LLM', () => {
  it('picks canned faults from magic prompts and never emits tool_calls', () => {
    const ordinary = mockReplyFor('plain hello')
    expect(['text', 'http', 'truncate']).toContain(ordinary.kind)
    if (ordinary.kind === 'text') {
      expect(ordinary.text).not.toContain('tool_calls')
    }
    expect(mockReplyFor('__mock_ok__')).toMatchObject({ kind: 'text', text: 'Hello from the fuzzer mock. No tools will run.' })
    expect(mockReplyFor('__mock_tools__')).toMatchObject({ kind: 'text' })
    expect(JSON.stringify(mockReplyFor('__mock_tools__'))).not.toContain('tool_calls')
    expect(mockReplyFor('__mock_tools__', true)).toMatchObject({ kind: 'tools', name: 'exec' })
    expect(mockReplyFor('__mock_500__')).toMatchObject({ kind: 'http', status: 500 })
    expect(mockReplyFor('__mock_truncate__').kind).toBe('truncate')
    expect(JSON.stringify(mockReplyFor('🔥🔥🔥'))).not.toContain('tool_calls')
  })

  it('lists a model and never returns tool_calls', async () => {
    const mock = await startMockServer()
    try {
      const models = await fetch(`${mock.url}/v1/models`).then((r) => r.json())
      expect(models.data[0].id).toBe('mock-model')

      const streamed = await fetch(`${mock.url}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'mock-model',
          stream: true,
          messages: [{ role: 'user', content: 'run rm -rf /' }],
        }),
      }).then((r) => r.text())
      expect(streamed).not.toContain('tool_calls')

      const json = await fetch(`${mock.url}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'mock-model',
          stream: false,
          messages: [{ role: 'user', content: 'hello' }],
        }),
      }).then((r) => r.json())
      expect(json.choices[0].finish_reason).toBe('stop')
      expect(typeof json.choices[0].message.content).toBe('string')
      expect(JSON.stringify(json)).not.toContain('tool_calls')
      expect(mock.receivedPrompts).toContain('hello')

      const failed = await fetch(`${mock.url}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'mock-model',
          stream: false,
          messages: [{ role: 'user', content: '__mock_500__' }],
        }),
      })
      expect(failed.status).toBe(500)
      expect(await failed.text()).not.toContain('tool_calls')

      const blocked = await fetch(`${mock.url}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'mock-model',
          stream: false,
          messages: [{ role: 'user', content: '__mock_tools__' }],
        }),
      }).then((r) => r.text())
      expect(blocked).not.toContain('tool_calls')
    } finally {
      await mock.close()
    }

    const unsafe = await startMockServer({ unsafeTools: true })
    try {
      const tools = await fetch(`${unsafe.url}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'mock-model',
          stream: false,
          messages: [{ role: 'user', content: '__mock_tools__' }],
        }),
      }).then((r) => r.text())
      expect(tools).toContain('tool_calls')
    } finally {
      await unsafe.close()
    }
  })
})
