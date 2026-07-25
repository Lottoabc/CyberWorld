import { describe, expect, it, vi } from 'vitest'
import { createBlobUrlLease } from '../src/utils/blobUrlLease.js'

describe('Blob URL lease', () => {
  it('revokes the previous URL only after the staged URL commits', () => {
    const revokeObjectURL = vi.fn()
    let serial = 0
    const lease = createBlobUrlLease({
      createObjectURL: () => `blob:${++serial}`,
      revokeObjectURL,
    })
    lease.stage(new ArrayBuffer(1))
    expect(lease.commit()).toBe('blob:1')
    lease.stage(new ArrayBuffer(1))
    expect(revokeObjectURL).not.toHaveBeenCalled()
    expect(lease.commit()).toBe('blob:2')
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:1')
  })

  it('revokes staged and active URLs on rollback and dispose', () => {
    const revokeObjectURL = vi.fn()
    let serial = 0
    const lease = createBlobUrlLease({
      createObjectURL: () => `blob:${++serial}`,
      revokeObjectURL,
    })
    lease.stage(new ArrayBuffer(1))
    lease.commit()
    lease.stage(new ArrayBuffer(1))
    lease.rollback()
    lease.dispose()
    expect(revokeObjectURL.mock.calls.flat()).toEqual(['blob:2', 'blob:1'])
  })
})
