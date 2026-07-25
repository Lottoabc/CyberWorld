import { shallowRef } from 'vue'
import { createTargetAnchor } from '../components/TargetAnchor.js'
import { createBlobUrlLease } from '../utils/blobUrlLease.js'

function codedError(message, code, cause) {
  return Object.assign(new Error(message, cause ? { cause } : undefined), { code })
}

export function createArEngine({
  documentRef = globalThis.document,
  windowRef = globalThis.window,
  urlApi = globalThis.URL,
  sceneStarter = null,
  readyTimeoutMs = 20000,
} = {}) {
  const lease = createBlobUrlLease(urlApi)
  const sceneRef = shallowRef(null)
  let containerRef = null
  let currentTargets = []

  function patchSystemLifecycle(system) {
    if (!system || system.__cyberworldPatched) return
    system.__cyberworldPatched = true
    let running = false
    let resizeListeners = []
    const originalStart = system.start.bind(system)
    const originalStop = system.stop.bind(system)

    if (typeof system._startAR === 'function') {
      const originalStartAR = system._startAR.bind(system)
      system._startAR = (...args) => {
        const originalAdd = windowRef.addEventListener
        windowRef.addEventListener = function addEventListener(type, listener, options) {
          if (type === 'resize') resizeListeners.push({ listener, options })
          return originalAdd.call(this, type, listener, options)
        }
        try {
          return originalStartAR(...args)
        } finally {
          windowRef.addEventListener = originalAdd
        }
      }
    }

    system.start = (...args) => {
      if (running) return undefined
      running = true
      return originalStart(...args)
    }
    system.stop = (...args) => {
      if (!running) return undefined
      running = false
      for (const { listener, options } of resizeListeners) {
        windowRef.removeEventListener('resize', listener, options)
      }
      resizeListeners = []
      return originalStop(...args)
    }
  }

  function startTracking(scene, waitForRender) {
    if (sceneStarter) return sceneStarter(scene, { waitForRender })
    return new Promise((resolve, reject) => {
      let timer
      const cleanup = () => {
        clearTimeout(timer)
        scene.removeEventListener('arReady', ready)
        scene.removeEventListener('arError', failed)
        scene.removeEventListener('renderstart', start)
      }
      const ready = () => {
        cleanup()
        resolve()
      }
      const failed = (event) => {
        cleanup()
        reject(codedError('MindAR 启动失败', 'AR_START_FAILED', event.detail?.error))
      }
      const start = () => {
        try {
          const system = scene.systems?.['mindar-image-system']
          if (!system) throw new Error('MindAR system unavailable')
          patchSystemLifecycle(system)
          system.start()
        } catch (error) {
          cleanup()
          reject(codedError('MindAR 无法启动', 'AR_START_FAILED', error))
        }
      }
      scene.addEventListener('arReady', ready, { once: true })
      scene.addEventListener('arError', failed, { once: true })
      if (waitForRender) scene.addEventListener('renderstart', start, { once: true })
      else queueMicrotask(start)
      timer = setTimeout(() => {
        cleanup()
        reject(codedError('MindAR 启动超时', 'AR_START_TIMEOUT'))
      }, readyTimeoutMs)
    })
  }

  function configureSystem(system, url) {
    system.setup({
      imageTargetSrc: url,
      maxTrack: 1,
      filterMinCF: null,
      filterBeta: null,
      missTolerance: null,
      warmupTolerance: null,
      showStats: false,
      uiLoading: 'no',
      uiScanning: 'no',
      uiError: 'no',
    })
  }

  function appendTargets(scene, targets) {
    targets.forEach((target, index) => {
      scene.appendChild(createTargetAnchor({ target, index, documentRef }))
    })
  }

  function replaceTargets(scene, targets) {
    scene.querySelectorAll('[data-target-id]').forEach((element) => element.remove())
    const system = scene.systems?.['mindar-image-system']
    if (system) system.anchorEntities = []
    appendTargets(scene, targets)
  }

  async function waitForAnchors(scene, count) {
    const deadline = Date.now() + 2000
    while ((scene.systems?.['mindar-image-system']?.anchorEntities?.length ?? 0) < count) {
      if (Date.now() >= deadline) throw codedError('AR 锚点初始化超时', 'ANCHOR_START_TIMEOUT')
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
  }

  function buildScene(url, targets) {
    const scene = documentRef.createElement('a-scene')
    scene.setAttribute(
      'mindar-image',
      `imageTargetSrc: ${url}; autoStart: false; maxTrack: 1; uiLoading: no; uiScanning: no; uiError: no`,
    )
    scene.setAttribute('embedded', '')
    scene.setAttribute('vr-mode-ui', 'enabled: false')
    scene.setAttribute('device-orientation-permission-ui', 'enabled: false')
    scene.setAttribute('renderer', 'colorManagement: true; physicallyCorrectLights: true; alpha: true')

    const camera = documentRef.createElement('a-camera')
    camera.setAttribute('position', '0 0 0')
    camera.setAttribute('look-controls', 'enabled: false')
    scene.appendChild(camera)
    appendTargets(scene, targets)
    return scene
  }

  function stopTracking(scene) {
    if (!scene) return
    try {
      scene.systems?.['mindar-image-system']?.stop()
    } catch {
      // A partially initialized system may not own a video or controller yet.
    }
  }

  async function restart(url, targets) {
    const scene = sceneRef.value
    const system = scene?.systems?.['mindar-image-system']
    if (!scene || !system) throw codedError('AR 引擎尚未挂载', 'AR_NOT_MOUNTED')
    stopTracking(scene)
    replaceTargets(scene, targets)
    configureSystem(system, url)
    if (!sceneStarter) await waitForAnchors(scene, targets.length)
    await startTracking(scene, false)
    return scene
  }

  async function mount(container, buffer, targets) {
    destroy()
    containerRef = container
    currentTargets = [...targets]
    const stagedUrl = lease.stage(buffer)
    const scene = buildScene(stagedUrl, currentTargets)
    sceneRef.value = scene
    const ready = startTracking(scene, true)
    containerRef.replaceChildren(scene)
    try {
      await ready
      lease.commit()
      return scene
    } catch (error) {
      stopTracking(scene)
      scene.remove()
      sceneRef.value = null
      lease.rollback()
      throw error
    }
  }

  async function swap(buffer, targets) {
    if (!containerRef || !sceneRef.value || !lease.activeUrl) {
      throw codedError('AR 引擎尚未挂载', 'AR_NOT_MOUNTED')
    }
    const previousTargets = currentTargets
    const previousUrl = lease.activeUrl
    const stagedUrl = lease.stage(buffer)
    try {
      currentTargets = [...targets]
      await restart(stagedUrl, currentTargets)
      lease.commit()
      return sceneRef.value
    } catch (error) {
      lease.rollback()
      currentTargets = previousTargets
      try {
        await restart(previousUrl, previousTargets)
      } catch (rollbackError) {
        throw codedError('AR 更新和回滚均失败', 'AR_ROLLBACK_FAILED', rollbackError)
      }
      throw codedError('AR 更新失败，已恢复旧目标', 'AR_SWAP_FAILED', error)
    }
  }

  function pause(keepVideo = false) {
    sceneRef.value?.systems?.['mindar-image-system']?.pause(keepVideo)
  }

  function resume() {
    sceneRef.value?.systems?.['mindar-image-system']?.unpause()
  }

  function getVideoElement() {
    return sceneRef.value?.systems?.['mindar-image-system']?.video ?? null
  }

  function getCamera() {
    return sceneRef.value?.querySelector('a-camera')?.getObject3D?.('camera') ?? null
  }

  function getAnchor(targetId) {
    return [...(sceneRef.value?.querySelectorAll('[data-target-id]') ?? [])]
      .find((element) => element.dataset.targetId === targetId) ?? null
  }

  function destroy() {
    const scene = sceneRef.value
    stopTracking(scene)
    sceneRef.value = null
    scene?.remove()
    containerRef?.replaceChildren()
    containerRef = null
    currentTargets = []
    lease.dispose()
  }

  return {
    scene: sceneRef,
    mount,
    swap,
    pause,
    resume,
    getVideoElement,
    getCamera,
    getAnchor,
    destroy,
  }
}

export const useArEngine = createArEngine
