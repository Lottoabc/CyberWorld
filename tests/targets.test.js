import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useTargetStore } from '../src/stores/targets.js'

beforeEach(() => setActivePinia(createPinia()))

describe('target store', () => {
  it('rejects a sixth target', () => {
    const store = useTargetStore()
    for (let index = 0; index < 5; index += 1) {
      store.commitCandidate({ id: String(index), name: `目标 ${index}`, emoji: '✨' })
    }
    expect(() => store.addCandidate({ id: 'six' })).toThrowError(
      expect.objectContaining({ code: 'TARGET_LIMIT' }),
    )
  })

  it('prevents overlapping compilation', () => {
    const store = useTargetStore()
    store.beginCompile('a')
    expect(() => store.beginCompile('b')).toThrowError(expect.objectContaining({ code: 'COMPILE_BUSY' }))
  })
})
