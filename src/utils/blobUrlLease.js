function codedError(message, code) {
  return Object.assign(new Error(message), { code })
}

export function createBlobUrlLease(urlApi = globalThis.URL) {
  let activeUrl = null
  let stagedUrl = null

  return {
    get activeUrl() {
      return activeUrl
    },
    get stagedUrl() {
      return stagedUrl
    },
    stage(buffer) {
      if (stagedUrl) throw codedError('已有待提交的 Blob URL', 'BLOB_STAGE_BUSY')
      stagedUrl = urlApi.createObjectURL(new Blob([buffer], { type: 'application/octet-stream' }))
      return stagedUrl
    },
    commit() {
      if (!stagedUrl) throw codedError('没有待提交的 Blob URL', 'NO_BLOB_STAGE')
      const previous = activeUrl
      activeUrl = stagedUrl
      stagedUrl = null
      if (previous) urlApi.revokeObjectURL(previous)
      return activeUrl
    },
    rollback() {
      if (stagedUrl) urlApi.revokeObjectURL(stagedUrl)
      stagedUrl = null
      return activeUrl
    },
    dispose() {
      if (stagedUrl) urlApi.revokeObjectURL(stagedUrl)
      if (activeUrl) urlApi.revokeObjectURL(activeUrl)
      stagedUrl = null
      activeUrl = null
    },
  }
}
