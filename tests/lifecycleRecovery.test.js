import { describe, expect, it, vi } from 'vitest'
import { createLifecycleRecovery } from '../src/composables/useLifecycleRecovery.js'

describe('mobile lifecycle recovery', () => {
  it('pauses in the background and exposes a gesture fallback when resume is denied', async () => {
    const documentRef = new EventTarget()
    documentRef.visibilityState = 'hidden'
    const pause = vi.fn()
    const resume = vi.fn().mockResolvedValue(false)
    const recovery = createLifecycleRecovery({ documentRef, pause, resume })
    documentRef.dispatchEvent(new Event('visibilitychange'))
    expect(pause).toHaveBeenCalledOnce()
    documentRef.visibilityState = 'visible'
    documentRef.dispatchEvent(new Event('visibilitychange'))
    await Promise.resolve()
    await Promise.resolve()
    expect(recovery.needsUserResume.value).toBe(true)
    recovery.detach()
  })

  it('prevents WebGL context loss and requests a serialized rebuild', async () => {
    const canvas = new EventTarget()
    const rebuild = vi.fn().mockResolvedValue()
    const recovery = createLifecycleRecovery({ documentRef: new EventTarget(), rebuild })
    recovery.attach(canvas)
    const event = new Event('webglcontextlost', { cancelable: true })
    canvas.dispatchEvent(event)
    await Promise.resolve()
    await Promise.resolve()
    expect(event.defaultPrevented).toBe(true)
    expect(rebuild).toHaveBeenCalledOnce()
    recovery.detach()
  })
})
