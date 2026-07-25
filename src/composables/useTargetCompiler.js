import { readonly, ref } from 'vue'

function codedError(message, code, cause) {
  return Object.assign(new Error(message, cause ? { cause } : undefined), { code })
}

function defaultCompilerClass() {
  const CompilerClass = globalThis.MINDAR?.IMAGE?.Compiler ?? globalThis.MINDAR?.Compiler
  if (!CompilerClass) throw codedError('MindAR 编译器尚未加载', 'COMPILER_UNAVAILABLE')
  return CompilerClass
}

async function decodeWithImageElement(blob) {
  const url = URL.createObjectURL(blob)
  const image = new Image()
  image.decoding = 'async'
  image.src = url
  try {
    await image.decode()
    return {
      width: image.naturalWidth,
      height: image.naturalHeight,
      image,
      close() {
        URL.revokeObjectURL(url)
      },
    }
  } catch (error) {
    URL.revokeObjectURL(url)
    throw error
  }
}

async function defaultDecode(blob) {
  if (globalThis.createImageBitmap) return globalThis.createImageBitmap(blob)
  return decodeWithImageElement(blob)
}

export function createTargetCompiler({
  CompilerClass,
  decodeBlob = defaultDecode,
} = {}) {
  const compiling = ref(false)

  async function compile(blobs, onProgress = () => {}) {
    if (compiling.value) throw codedError('已有编译任务正在运行', 'COMPILE_BUSY')
    if (!Array.isArray(blobs) || blobs.length === 0) {
      throw codedError('至少需要一个参照物', 'NO_TARGETS')
    }
    compiling.value = true
    const decoded = []
    try {
      for (const blob of blobs) decoded.push(await decodeBlob(blob))
      const Engine = CompilerClass ?? defaultCompilerClass()
      const compiler = new Engine()
      const images = decoded.map((item) => item.image ?? item)
      await compiler.compileImageTargets(images, (progress) => {
        onProgress(Math.max(0, Math.min(100, Math.round(progress))))
      })
      const result = await compiler.exportData()
      if (!(result instanceof ArrayBuffer)) {
        if (ArrayBuffer.isView(result)) {
          return result.buffer.slice(result.byteOffset, result.byteOffset + result.byteLength)
        }
        throw codedError('MindAR 返回了无效编译结果', 'INVALID_COMPILE_RESULT')
      }
      return result
    } catch (error) {
      if (error?.code) throw error
      throw codedError('参照物编译失败', 'COMPILE_FAILED', error)
    } finally {
      decoded.forEach((item) => item.close?.())
      compiling.value = false
    }
  }

  return {
    isCompiling: readonly(compiling),
    compile,
  }
}

export const useTargetCompiler = createTargetCompiler
