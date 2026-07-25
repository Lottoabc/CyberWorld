import { describe, expect, it, vi } from 'vitest'
import { createTargetCompiler } from '../src/composables/useTargetCompiler.js'

class FakeCompiler {
  async compileImageTargets(images, progress) {
    this.images = images
    progress(12.4)
    progress(98.6)
  }

  async exportData() {
    return new Uint8Array([7, 8, 9]).buffer
  }
}

describe('target compiler', () => {
  it('preserves image order, reports progress, and closes decoded images', async () => {
    const closed = []
    const decodeBlob = vi.fn(async (blob) => ({ source: await blob.text(), close: () => closed.push(blob) }))
    const compiler = createTargetCompiler({ CompilerClass: FakeCompiler, decodeBlob })
    const progress = []

    const result = await compiler.compile([new Blob(['a']), new Blob(['b'])], (value) => progress.push(value))

    expect([...new Uint8Array(result)]).toEqual([7, 8, 9])
    expect(decodeBlob).toHaveBeenCalledTimes(2)
    expect(progress).toEqual([12, 99])
    expect(closed).toHaveLength(2)
  })

  it('rejects overlapping compilation', async () => {
    let release
    class SlowCompiler extends FakeCompiler {
      compileImageTargets() {
        return new Promise((resolve) => { release = resolve })
      }
    }
    const compiler = createTargetCompiler({
      CompilerClass: SlowCompiler,
      decodeBlob: async () => ({ close() {} }),
    })
    const first = compiler.compile([new Blob(['a'])])
    await Promise.resolve()

    await expect(compiler.compile([new Blob(['b'])])).rejects.toMatchObject({ code: 'COMPILE_BUSY' })
    release()
    await first
  })
})
