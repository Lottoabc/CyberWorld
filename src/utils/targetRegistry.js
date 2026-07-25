export function createTargetRegistry(targets) {
  const entries = Object.freeze(
    targets.map((target, index) => Object.freeze({ id: target.id, index })),
  )
  const byId = new Map(entries.map((entry) => [entry.id, entry.index]))
  const byIndex = entries.map((entry) => entry.id)

  return Object.freeze({
    entries,
    indexFor(id) {
      return byId.get(id) ?? null
    },
    idFor(index) {
      return byIndex[index] ?? null
    },
  })
}
