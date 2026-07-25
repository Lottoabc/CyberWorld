import { describe, expect, it } from 'vitest'
import { createTargetRegistry } from '../src/utils/targetRegistry.js'

describe('target registry', () => {
  it('rebuilds contiguous MindAR indices without changing stable IDs', () => {
    const initial = createTargetRegistry([{ id: 'a' }, { id: 'b' }, { id: 'c' }])
    const afterRemoval = createTargetRegistry([{ id: 'a' }, { id: 'c' }])

    expect(initial.indexFor('c')).toBe(2)
    expect(afterRemoval.indexFor('c')).toBe(1)
    expect(afterRemoval.idFor(1)).toBe('c')
    expect(afterRemoval.idFor(2)).toBeNull()
  })
})
