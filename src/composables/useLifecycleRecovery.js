import { ref } from 'vue'

export function createLifecycleRecovery({
  documentRef = globalThis.document,
  pause = () => {},
  resume = async () => true,
  rebuild = async () => {},
} = {}) {
  const needsUserResume = ref(false)
  const recovering = ref(false)
  let canvasRef = null
  let work = Promise.resolve()
  let attached = false

  function enqueue(operation) {
    work = work.then(operation, operation)
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
    const resumed = await resume()
    needsUserResume.value = resumed === false
    return resumed
  }

  function detach() {
    if (attached) documentRef.removeEventListener('visibilitychange', handleVisibility)
    canvasRef?.removeEventListener('webglcontextlost', handleContextLost)
    canvasRef?.removeEventListener('webglcontextrestored', handleContextRestored)
    canvasRef = null
    attached = false
  }

  return {
    needsUserResume,
    recovering,
    attach,
    detach,
    resumeFromGesture,
  }
}

export const useLifecycleRecovery = createLifecycleRecovery
