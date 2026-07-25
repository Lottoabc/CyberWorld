import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import ScannerView from '../src/views/ScannerView.vue'

describe('scanner view', () => {
  beforeEach(() => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockResolvedValue({
          getTracks: () => [{ stop: vi.fn() }],
        }),
      },
    })
  })

  it('does not request the camera until the user starts scanning', async () => {
    const wrapper = mount(ScannerView, {
      global: { plugins: [createPinia()] },
      attachTo: document.body,
    })

    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled()
    await wrapper.get('[data-test="start-scanning"]').trigger('click')

    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledOnce()
    wrapper.unmount()
  })

  it('keeps the capture control visible in the scanner shell', () => {
    const wrapper = mount(ScannerView, { global: { plugins: [createPinia()] } })
    expect(wrapper.get('[data-test="capture"]').exists()).toBe(true)
  })
})
