export function emojiTextureUrl(emoji) {
  const value = String(emoji || '✨').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&apos;',
  })[character])
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><text x="128" y="180" text-anchor="middle" font-size="168" font-family="Apple Color Emoji,Segoe UI Emoji,Noto Color Emoji,sans-serif">${value}</text></svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

function createEmojiVisual(target, documentRef) {
  const image = documentRef.createElement('a-image')
  image.setAttribute('src', emojiTextureUrl(target.emoji))
  image.setAttribute('position', '0 0 0.08')
  image.setAttribute('width', '0.72')
  image.setAttribute('height', '0.72')
  image.setAttribute('transparent', 'true')
  image.setAttribute('side', 'double')
  return image
}

export function createTargetAnchor({ target, index, documentRef = globalThis.document }) {
  const anchor = documentRef.createElement('a-entity')
  anchor.dataset.targetId = target.id
  anchor.setAttribute('mindar-image-target', `targetIndex: ${index}`)
  anchor.appendChild(createEmojiVisual(target, documentRef))
  return anchor
}
