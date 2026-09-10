const FULL_ACCESS = 'danger-full-access'

/** Official chip label: kebab-case → Title Case; Full access is the product name. */
export function permissionLabel(option) {
  const value = typeof option === 'string' ? option : option?.value
  const name = typeof option === 'string' ? option : option?.name ?? option?.value ?? ''
  if (value === FULL_ACCESS) return 'Full access'
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) return name
  return name.split('-').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
}

export function isFullAccess(value) {
  return value === FULL_ACCESS
}

export function modelTriggerLabel(catalog) {
  if (!catalog?.current) return '选择模型'
  const current = catalog.current
  for (const group of catalog.groups ?? []) {
    const model = group.models?.find((item) => item.id === current.model)
    if (group.id === current.provider && model) {
      const effort = effortLabel(model, current)
      return effort ? `${model.name} · ${effort}` : model.name
    }
  }
  return current.model
}

export function effortLabel(model, current) {
  const reasoning = model?.reasoning
  if (!reasoning) return undefined
  const effort = current?.reasoningEffort ?? reasoning.defaultEffort
  if (effort === undefined) return '默认'
  return reasoning.efforts?.find((item) => item.id === effort)?.name ?? effort
}
