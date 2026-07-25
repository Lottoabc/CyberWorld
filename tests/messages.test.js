import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useMessageStore } from '../src/stores/messages.js'

beforeEach(() => setActivePinia(createPinia()))

describe('message store', () => {
  it('keeps messages associated with stable target IDs', () => {
    const store = useMessageStore()
    store.addMessage('target-c', '  留在这里  ')
    expect(store.messagesFor('target-c')[0].text).toBe('留在这里')
    expect(store.messagesFor('target-a')).toEqual([])
  })

  it('rejects blank messages and limits text to 280 code points', () => {
    const store = useMessageStore()
    expect(() => store.addMessage('a', '   ')).toThrowError(expect.objectContaining({ code: 'EMPTY_MESSAGE' }))
    store.addMessage('a', '你'.repeat(300))
    expect([...store.messagesFor('a')[0].text]).toHaveLength(280)
  })
})
