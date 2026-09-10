const DEFAULT_LIMITS = {
  maxImageBytes: 5 * 1024 * 1024,
  maxImagesPerMessage: 20,
  maxMessageImageBytes: 100 * 1024 * 1024,
  maxImagePixels: 40_000_000,
  mediaTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
}

export function imageLimitsOf(value) {
  if (!value || typeof value !== 'object') return DEFAULT_LIMITS
  return {
    maxImageBytes: value.maxImageBytes ?? DEFAULT_LIMITS.maxImageBytes,
    maxImagesPerMessage: value.maxImagesPerMessage ?? DEFAULT_LIMITS.maxImagesPerMessage,
    maxMessageImageBytes: value.maxMessageImageBytes ?? DEFAULT_LIMITS.maxMessageImageBytes,
    maxImagePixels: value.maxImagePixels ?? DEFAULT_LIMITS.maxImagePixels,
    mediaTypes: Array.isArray(value.mediaTypes) && value.mediaTypes.length
      ? value.mediaTypes
      : DEFAULT_LIMITS.mediaTypes,
  }
}

function formatBytes(n) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${Math.round(n / (1024 * 1024) * 10) / 10} MB`
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(new Error('图片读取失败'))
    reader.readAsDataURL(file)
  })
}

function pixelCount(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image.naturalWidth * image.naturalHeight)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(0)
    }
    image.src = url
  })
}

/**
 * Admit one local image against the host imageLimits projection.
 * @returns {{ name: string, mediaType: string, data: string, preview: string, bytes: number }}
 */
export async function readImageFile(file, limits, existing) {
  const spec = imageLimitsOf(limits)
  const type = file.type === 'image/jpg' ? 'image/jpeg' : file.type
  if (!spec.mediaTypes.includes(type)) {
    throw new Error('仅支持 PNG、JPG、WebP、GIF 格式的图片')
  }
  if (existing.length >= spec.maxImagesPerMessage) {
    throw new Error(`一条消息最多添加 ${spec.maxImagesPerMessage} 张图片`)
  }
  if (file.size > spec.maxImageBytes) {
    throw new Error(`单张图片不能超过 ${formatBytes(spec.maxImageBytes)}`)
  }
  const total = existing.reduce((sum, item) => sum + item.bytes, 0) + file.size
  if (total > spec.maxMessageImageBytes) {
    throw new Error(`图片总大小超过 ${formatBytes(spec.maxMessageImageBytes)}，请移除部分图片`)
  }
  const pixels = await pixelCount(file)
  if (pixels > spec.maxImagePixels) {
    throw new Error('图片分辨率过大，请压缩后重试')
  }
  const preview = await readAsDataUrl(file)
  const comma = preview.indexOf(',')
  const data = comma === -1 ? '' : preview.slice(comma + 1)
  if (data === '') throw new Error('图片读取失败')
  return {
    name: file.name || '图片',
    mediaType: type,
    data,
    preview,
    bytes: file.size,
  }
}

export function imageRefsFromContent(content) {
  if (!Array.isArray(content)) return []
  return content.flatMap((block) => {
    const id = block?.attachment?.attachmentId
    return block?.type === 'image' && typeof id === 'string' && id !== '' ? [id] : []
  })
}

export function attachmentUrl(result) {
  if (!result?.data || !result.attachment?.mediaType) return ''
  return `data:${result.attachment.mediaType};base64,${result.data}`
}
