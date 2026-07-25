import { describe, expect, it } from 'vitest'
import { createAppRouter } from '../src/router/index.js'

describe('application router', () => {
  it('resolves the scanner route under hash history', async () => {
    const router = createAppRouter()

    await router.push('/scan')
    await router.isReady()

    expect(router.currentRoute.value.path).toBe('/scan')
    expect(router.currentRoute.value.matched[0].components.default.name).toBe('ScannerView')
  })
})
