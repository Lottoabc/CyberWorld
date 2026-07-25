<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import EditorToolbar from '../components/EditorToolbar.vue'
import MessageBoard from '../components/MessageBoard.vue'
import ToastHost from '../components/ToastHost.vue'
import TransitionOverlay from '../components/TransitionOverlay.vue'
import { createArEngine } from '../composables/useArEngine.js'
import { createCameraStream } from '../composables/useCameraStream.js'
import { createCoordinateProjector } from '../composables/useCoordinateProjector.js'
import { createLifecycleRecovery } from '../composables/useLifecycleRecovery.js'
import { createTargetCompiler } from '../composables/useTargetCompiler.js'
import {
  deleteImage,
  deleteMindBuffer,
  getImage,
  getMindBuffer,
  putImage,
  putMindBuffer,
} from '../persistence/indexedDb.js'
import { loadLocalState, saveLocalState } from '../persistence/localState.js'
import { useMessageStore } from '../stores/messages.js'
import { useTargetStore } from '../stores/targets.js'

defineOptions({ name: 'ScannerView' })

const targetStore = useTargetStore()
const messageStore = useMessageStore()
const camera = createCameraStream()
const compiler = createTargetCompiler()
const arEngine = createArEngine()
const projector = createCoordinateProjector()

const previewVideo = ref(null)
const arMount = ref(null)
const cameraReady = ref(false)
const managerOpen = ref(false)
const projectedPosition = ref(null)
const toasts = ref([])
const overlay = reactive({
  visible: true,
  title: '让现实留下回声',
  detail: '点击后将请求后置摄像头权限。所有内容只保存在这台设备。',
  actionLabel: '开始扫描',
  error: false,
})

let toastSerial = 0
let projectionFrame = 0

const lifecycle = createLifecycleRecovery({
  pause() {
    if (targetStore.targets.length > 0) arEngine.pause()
    else previewVideo.value?.pause()
  },
  async resume() {
    const video = targetStore.targets.length > 0 ? arEngine.getVideoElement() : previewVideo.value
    if (!video) return true
    const resumed = await camera.resume(video)
    if (resumed && targetStore.targets.length > 0) arEngine.resume()
    return resumed
  },
  async rebuild() {
    if (targetStore.targets.length === 0) return
    const buffer = await getMindBuffer()
    if (!buffer) throw new Error('找不到已编译的 AR 数据')
    setOverlay({ visible: true, title: '正在恢复画面', detail: 'WebGL 已重置，正在重建追踪引擎。' })
    await arEngine.swap(buffer, targetStore.targets)
    bindTargetEvents(targetStore.targets)
    attachRecoveryCanvas()
    setOverlay({ visible: false })
  },
})

const activeTarget = computed(() =>
  targetStore.targets.find((target) => target.id === targetStore.activeTargetId) ?? null,
)
const activeMessages = computed(() =>
  activeTarget.value ? messageStore.messagesFor(activeTarget.value.id) : [],
)

function persistMetadata() {
  try {
    saveLocalState(localStorage, {
      targets: targetStore.targets,
      messages: messageStore.messages,
    })
    return true
  } catch {
    showToast('本地设置保存失败，请检查浏览器存储空间', '!')
    return false
  }
}

function showToast(text, icon = '✓') {
  const id = ++toastSerial
  toasts.value.push({ id, text, icon })
  setTimeout(() => {
    toasts.value = toasts.value.filter((item) => item.id !== id)
  }, 2600)
}

function setOverlay({ visible, title = '', detail = '', actionLabel = '', error = false }) {
  Object.assign(overlay, { visible, title, detail, actionLabel, error })
}

async function loadImages(targets) {
  const blobs = []
  for (const target of targets) {
    const blob = await getImage(target.imageKey)
    if (!blob) {
      throw Object.assign(new Error(`找不到“${target.name}”的本地图片`), { code: 'IMAGE_MISSING' })
    }
    blobs.push(blob)
  }
  return blobs
}

function bindTargetEvents(targets) {
  targets.forEach((target) => {
    const anchor = arEngine.getAnchor(target.id)
    if (!anchor) return
    anchor.addEventListener('targetFound', () => {
      targetStore.setActiveTarget(target.id)
      projector.reset()
    })
    anchor.addEventListener('targetLost', () => {
      if (targetStore.activeTargetId === target.id) {
        targetStore.setActiveTarget(null)
        projectedPosition.value = null
        projector.reset()
      }
    })
  })
}

function attachRecoveryCanvas() {
  const scene = arEngine.scene.value
  lifecycle.attach(scene?.canvas ?? scene?.querySelector?.('canvas') ?? null)
}

function updateProjection() {
  if (activeTarget.value) {
    const anchor = arEngine.getAnchor(activeTarget.value.id)
    const cameraObject = arEngine.getCamera()
    const point = projector.project(anchor?.object3D, cameraObject)
    if (point) {
      projectedPosition.value = {
        x: Math.max(24, Math.min(innerWidth - 24, point.x)),
        y: Math.max(120, Math.min(innerHeight - 150, point.y)),
      }
    }
  }
  projectionFrame = requestAnimationFrame(updateProjection)
}

async function mountExistingTargets() {
  let buffer = await getMindBuffer()
  if (!buffer) {
    targetStore.beginCompile()
    const blobs = await loadImages(targetStore.targets)
    buffer = await compiler.compile(blobs, targetStore.setCompileProgress)
    await putMindBuffer(buffer)
    targetStore.finishCompile()
  }
  await arEngine.mount(arMount.value, buffer, targetStore.targets)
  bindTargetEvents(targetStore.targets)
  attachRecoveryCanvas()
}

async function startScanning() {
  setOverlay({
    visible: true,
    title: '正在打开镜头',
    detail: '请允许使用后置摄像头。',
  })
  try {
    if (targetStore.targets.length > 0) {
      await mountExistingTargets()
    } else {
      await camera.start(previewVideo.value)
    }
    cameraReady.value = true
    setOverlay({ visible: false })
  } catch (error) {
    targetStore.failCompile(error)
    const denied = error?.code === 'CAMERA_DENIED'
    setOverlay({
      visible: true,
      title: denied ? '需要摄像头权限' : '扫描器未能启动',
      detail: denied ? '请在浏览器网站设置中允许摄像头，然后重试。' : error.message,
      actionLabel: '重试',
      error: true,
    })
  }
}

async function captureTarget() {
  if (!cameraReady.value || targetStore.isCompiling || targetStore.targets.length >= 5) return
  let candidate = null
  let oldBuffer = null
  try {
    targetStore.beginCompile()
    const sourceVideo = targetStore.targets.length > 0 ? arEngine.getVideoElement() : previewVideo.value
    const image = await camera.captureFrame(sourceVideo)
    candidate = targetStore.addCandidate({
      id: crypto.randomUUID(),
      imageKey: '',
    })
    candidate.imageKey = candidate.id
    showToast('参照物已设定')
    await putImage(candidate.imageKey, image)

    const nextTargets = [...targetStore.targets, candidate]
    const blobs = await loadImages(nextTargets)
    const buffer = await compiler.compile(blobs, targetStore.setCompileProgress)
    oldBuffer = await getMindBuffer()
    await putMindBuffer(buffer)
    targetStore.beginSwap()

    setOverlay({
      visible: true,
      title: '正在更新现实',
      detail: '新参照物编译完成，正在重启追踪引擎。',
    })
    if (targetStore.targets.length === 0) {
      camera.stop()
      previewVideo.value.srcObject = null
      await arEngine.mount(arMount.value, buffer, nextTargets)
    } else {
      await arEngine.swap(buffer, nextTargets)
    }
    targetStore.commitCandidate(candidate)
    persistMetadata()
    bindTargetEvents(nextTargets)
    attachRecoveryCanvas()
    setOverlay({ visible: false })
    showToast('新参照物已可识别', '✦')
  } catch (error) {
    if (candidate) await deleteImage(candidate.imageKey).catch(() => {})
    if (oldBuffer) await putMindBuffer(oldBuffer).catch(() => {})
    targetStore.failCompile(error)
    if (targetStore.targets.length === 0 && !camera.stream.value) {
      await camera.start(previewVideo.value).catch(() => {})
    }
    setOverlay({ visible: false })
    showToast(error.message || '参照物处理失败', '!')
  }
}

async function removeTarget(target) {
  if (targetStore.isCompiling) return
  const remaining = targetStore.targets.filter((item) => item.id !== target.id)
  const oldBuffer = await getMindBuffer().catch(() => null)
  try {
    targetStore.beginCompile()
    if (remaining.length === 0) {
      arEngine.destroy()
      await deleteMindBuffer()
      targetStore.removeTarget(target.id)
      messageStore.removeForTarget(target.id)
      await deleteImage(target.imageKey).catch(() => {})
      await camera.start(previewVideo.value)
    } else {
      const blobs = await loadImages(remaining)
      const buffer = await compiler.compile(blobs, targetStore.setCompileProgress)
      await putMindBuffer(buffer)
      targetStore.beginSwap()
      setOverlay({ visible: true, title: '正在整理目标', detail: '重新建立追踪索引。' })
      await arEngine.swap(buffer, remaining)
      targetStore.removeTarget(target.id)
      messageStore.removeForTarget(target.id)
      await deleteImage(target.imageKey).catch(() => {})
      bindTargetEvents(remaining)
      attachRecoveryCanvas()
    }
    targetStore.finishCompile()
    persistMetadata()
    setOverlay({ visible: false })
    showToast('参照物已删除')
  } catch (error) {
    if (oldBuffer) await putMindBuffer(oldBuffer).catch(() => {})
    targetStore.failCompile(error)
    setOverlay({ visible: false })
    showToast(error.message || '删除失败', '!')
  }
}

function addMessage(text) {
  if (!activeTarget.value) return
  try {
    messageStore.addMessage(activeTarget.value.id, text)
    persistMetadata()
  } catch (error) {
    showToast(error.message, '!')
  }
}

function removeMessage(id) {
  messageStore.removeMessage(id)
  persistMetadata()
}

function setEmoji(emoji) {
  if (!activeTarget.value) return
  messageStore.setEmoji(activeTarget.value.id, emoji)
  const anchor = arEngine.getAnchor(activeTarget.value.id)
  anchor?.querySelector('a-text')?.setAttribute('value', emoji)
  persistMetadata()
}

async function handleOverlayAction() {
  if (lifecycle.needsUserResume.value) {
    const resumed = await lifecycle.resumeFromGesture()
    if (resumed) setOverlay({ visible: false })
    return
  }
  await startScanning()
}

watch(lifecycle.needsUserResume, (needed) => {
  if (needed) {
    setOverlay({
      visible: true,
      title: '点击继续扫描',
      detail: '浏览器需要再次确认播放摄像头画面。',
      actionLabel: '继续扫描',
    })
  }
})

onMounted(() => {
  const state = loadLocalState()
  targetStore.hydrate(state.targets)
  messageStore.hydrate(state.messages)
  lifecycle.attach(null)
  projectionFrame = requestAnimationFrame(updateProjection)
})

onBeforeUnmount(() => {
  cancelAnimationFrame(projectionFrame)
  lifecycle.detach()
  camera.stop()
  arEngine.destroy()
})
</script>

<template>
  <main class="scanner" aria-label="AR 扫描器">
    <video ref="previewVideo" class="scanner__preview" muted autoplay playsinline></video>
    <div ref="arMount" class="scanner__ar-mount" aria-hidden="true"></div>
    <div class="scanner__vignette" aria-hidden="true"></div>

    <header class="scanner__header">
      <RouterLink class="scanner__back" to="/" aria-label="返回首页">←</RouterLink>
      <div>
        <strong>CYBERWORLD</strong>
        <small>{{ targetStore.activeTargetId ? '目标已锁定' : cameraReady ? '寻找参照物' : '等待启动' }}</small>
      </div>
      <span class="scanner__live" :class="{ 'scanner__live--on': cameraReady }">
        {{ cameraReady ? 'LIVE' : 'OFF' }}
      </span>
    </header>

    <div v-if="cameraReady && targetStore.targets.length === 0" class="empty-guide">
      <span aria-hidden="true">⌁</span>
      <strong>拍下第一个参照物</strong>
      <p>选择细节丰富、光线均匀的平面图像。</p>
    </div>

    <MessageBoard
      :target="activeTarget"
      :messages="activeMessages"
      :position="projectedPosition"
      @add="addMessage"
      @remove="removeMessage"
      @emoji="setEmoji"
    />

    <Transition name="manager">
      <aside v-if="managerOpen" class="target-manager">
        <header>
          <div>
            <small>LOCAL TARGETS</small>
            <h2>参照物</h2>
          </div>
          <button type="button" aria-label="关闭目标管理" @click="managerOpen = false">×</button>
        </header>
        <p v-if="targetStore.targets.length === 0" class="target-manager__empty">还没有保存参照物。</p>
        <article v-for="target in targetStore.targets" :key="target.id">
          <span>{{ target.emoji }}</span>
          <div>
            <strong>{{ target.name }}</strong>
            <small>{{ new Date(target.createdAt).toLocaleDateString() }}</small>
          </div>
          <button type="button" :disabled="targetStore.isCompiling" @click="removeTarget(target)">删除</button>
        </article>
      </aside>
    </Transition>

    <EditorToolbar
      :target-count="targetStore.targets.length"
      :busy="targetStore.isCompiling"
      :progress="targetStore.compileState.progress"
      :ready="cameraReady"
      @capture="captureTarget"
      @toggle-manager="managerOpen = !managerOpen"
    />
    <ToastHost :items="toasts" />
    <TransitionOverlay
      v-bind="overlay"
      @action="handleOverlayAction"
    />
  </main>
</template>
