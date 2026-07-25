import { shallowRef } from 'vue'

function codedError(message, code, cause) {
  return Object.assign(new Error(message, cause ? { cause } : undefined), { code })
}

function waitForMetadata(video) {
  if (video.readyState >= 1) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup()
      reject(codedError('摄像头画面准备超时', 'VIDEO_TIMEOUT'))
    }, 4000)
    const cleanup = () => {
      clearTimeout(timeout)
      video.removeEventListener?.('loadedmetadata', resolveReady)
      video.removeEventListener?.('error', rejectError)
    }
    const resolveReady = () => {
      cleanup()
      resolve()
    }
    const rejectError = () => {
      cleanup()
      reject(codedError('无法读取摄像头画面', 'VIDEO_FAILED'))
    }
    video.addEventListener('loadedmetadata', resolveReady, { once: true })
    video.addEventListener('error', rejectError, { once: true })
  })
}

export function createCameraStream({
  mediaDevices = globalThis.navigator?.mediaDevices,
  documentRef = globalThis.document,
} = {}) {
  const stream = shallowRef(null)

  async function start(videoElement) {
    if (!mediaDevices?.getUserMedia) {
      throw codedError('当前浏览器不支持摄像头', 'CAMERA_UNSUPPORTED')
    }
    stop()
    try {
      const nextStream = await mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      })
      stream.value = nextStream
      videoElement.muted = true
      videoElement.autoplay = true
      videoElement.playsInline = true
      videoElement.srcObject = nextStream
      await videoElement.play()
      return nextStream
    } catch (error) {
      stop()
      const code = error?.name === 'NotAllowedError' ? 'CAMERA_DENIED' : 'CAMERA_FAILED'
      throw codedError(code === 'CAMERA_DENIED' ? '摄像头权限被拒绝' : '无法启动摄像头', code, error)
    }
  }

  async function resume(videoElement) {
    try {
      await videoElement.play()
      return true
    } catch (error) {
      if (error?.name === 'NotAllowedError') return false
      throw error
    }
  }

  async function captureFrame(sourceVideo) {
    if (!sourceVideo?.videoWidth || !sourceVideo?.videoHeight) {
      throw codedError('摄像头画面尚未就绪', 'FRAME_UNAVAILABLE')
    }

    let captureVideo = sourceVideo
    let clonedTrack = null
    const sourceTrack = sourceVideo.srcObject?.getVideoTracks?.()[0]
    if (sourceTrack?.clone && globalThis.MediaStream && documentRef?.createElement) {
      clonedTrack = sourceTrack.clone()
      captureVideo = documentRef.createElement('video')
      captureVideo.muted = true
      captureVideo.autoplay = true
      captureVideo.playsInline = true
      captureVideo.srcObject = new MediaStream([clonedTrack])
      try {
        await captureVideo.play()
        await waitForMetadata(captureVideo)
      } catch {
        clonedTrack.stop()
        clonedTrack = null
        captureVideo = sourceVideo
      }
    }

    try {
      const sourceWidth = captureVideo.videoWidth || sourceVideo.videoWidth
      const sourceHeight = captureVideo.videoHeight || sourceVideo.videoHeight
      const scale = Math.min(1, 1280 / Math.max(sourceWidth, sourceHeight))
      const canvas = documentRef.createElement('canvas')
      canvas.width = Math.round(sourceWidth * scale)
      canvas.height = Math.round(sourceHeight * scale)
      const context = canvas.getContext('2d', { alpha: false })
      if (!context) throw codedError('无法创建截图画布', 'CANVAS_UNAVAILABLE')
      context.drawImage(captureVideo, 0, 0, canvas.width, canvas.height)
      return await new Promise((resolve, reject) => {
        canvas.toBlob(
          (blob) => blob ? resolve(blob) : reject(codedError('截图编码失败', 'ENCODE_FAILED')),
          'image/jpeg',
          0.86,
        )
      })
    } finally {
      clonedTrack?.stop()
      if (captureVideo !== sourceVideo) captureVideo.srcObject = null
    }
  }

  function stop() {
    stream.value?.getTracks?.().forEach((track) => track.stop())
    stream.value = null
  }

  return {
    stream,
    start,
    resume,
    captureFrame,
    stop,
  }
}

export const useCameraStream = createCameraStream
