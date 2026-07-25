import { describe, expect, it } from 'vitest'
import { createEmptyState, loadLocalState, saveLocalState } from '../src/persistence/localState.js'

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial))
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
  }
}

describe('local state', () => {
  it('round-trips versioned target and message metadata', () => {
    const storage = memoryStorage()
    const state = { version: 1, targets: [{ id: 'a' }], messages: [{ id: 'm', targetId: 'a' }] }

    saveLocalState(storage, state)

    expect(loadLocalState(storage)).toEqual(state)
  })

  it.each(['{broken', '{"version":2,"targets":[],"messages":[]}', '{"version":1}'])(
    'falls back for malformed or unsupported data: %s',
    (input) => {
      const storage = memoryStorage({ 'cyberworld.state.v1': input })
      expect(loadLocalState(storage)).toEqual(createEmptyState())
    },
  )
})
