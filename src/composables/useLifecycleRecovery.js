import { ref } from 'vue'

export function createLifecycleRecovery({
  documentRef = globalThis.document,
  pause = () => {},
  resume = async () => true,
  rebuild = async () => {},
} = {}) {
  const needsUserResume = ref(false)
  const recovering = ref(false)
  const lastError = ref(null)
  let canvasRef = null
  let work = Promise.resolve()
  let attached = false
  let generation = 0

  function enqueue(operation) {
    const scheduledGeneration = generation
    const guarded = async () => {
      if (scheduledGeneration !== generation) return
      try {
        lastError.value = null
        await operation()
      } catch (error) {
        if (scheduledGeneration === generation) lastError.value = error
      }
    }
    work = work.then(guarded, guarded)
    return work
  }

  function handleVisibility() {
    if (documentRef.visibilityState === 'hidden') {
      pause()
      return
    }
    enqueue(async () => {
      const resumed = await resume()
      needsUserResume.value = resumed === false
    })
  }

  function handleContextLost(event) {
    event.preventDefault()
    enqueue(async () => {
      recovering.value = true
      try {
        await rebuild()
      } finally {
        recovering.value = false
      }
    })
  }

  function handleContextRestored() {
    if (!recovering.value) {
      enqueue(async () => {
        recovering.value = true
        try {
          await rebuild()
        } finally {
          recovering.value = false
        }
      })
    }
  }

  function attach(canvas) {
    if (!attached) {
      documentRef.addEventListener('visibilitychange', handleVisibility)
      attached = true
    }
    if (canvasRef === canvas) return
    if (canvasRef) {
      canvasRef.removeEventListener('webglcontextlost', handleContextLost)
      canvasRef.removeEventListener('webglcontextrestored', handleContextRestored)
    }
    canvasRef = canvas
    canvasRef?.addEventListener('webglcontextlost', handleContextLost)
    canvasRef?.addEventListener('webglcontextrestored', handleContextRestored)
  }

  async function resumeFromGesture() {
    try {
      lastError.value = null
      const resumed = await resume()
      needsUserResume.value = resumed === false
      return resumed
    } catch (error) {
      lastError.value = error
      return false
    }
  }

  function retryRecovery() {
    enqueue(async () => {
      recovering.value = true
      try {
        await rebuild()
      } finally {
        recovering.value = false
      }
    })
  }

  function detach() {
    generation += 1
    if (attached) documentRef.removeEventListener('visibilitychange', handleVisibility)
    canvasRef?.removeEventListener('webglcontextlost', handleContextLost)
    canvasRef?.removeEventListener('webglcontextrestored', handleContextRestored)
    canvasRef = null
    attached = false
  }

  return {
    needsUserResume,
    recovering,
    lastError,
    attach,
    detach,
    resumeFromGesture,
    retryRecovery,
  }
}

export const useLifecycleRecovery = createLifecycleRecovery
