function createEmojiVisual(target, documentRef) {
  const text = documentRef.createElement('a-text')
  text.setAttribute('value', target.emoji || '✨')
  text.setAttribute('align', 'center')
  text.setAttribute('anchor', 'center')
  text.setAttribute('position', '0 0 0.08')
  text.setAttribute('scale', '2.4 2.4 2.4')
  text.setAttribute('side', 'double')
  return text
}

export function createTargetAnchor({ target, index, documentRef = globalThis.document }) {
  const anchor = documentRef.createElement('a-entity')
  anchor.dataset.targetId = target.id
  anchor.setAttribute('mindar-image-target', `targetIndex: ${index}`)
  anchor.appendChild(createEmojiVisual(target, documentRef))
  return anchor
}
