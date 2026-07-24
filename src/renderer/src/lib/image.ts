/** Lee un File de imagen y devuelve un data URL, redimensionando si excede maxDim (px). */
export function fileToImageDataUrl(file: File, maxDim = 1568): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = reject
    reader.onload = () => {
      const src = reader.result as string
      const img = new Image()
      img.onerror = reject
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height))
        if (scale === 1) { resolve(src); return }
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(img.width * scale)
        canvas.height = Math.round(img.height * scale)
        const ctx = canvas.getContext('2d')
        if (!ctx) { resolve(src); return }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        // PNG conserva capturas nítidas; JPEG para fotos grandes.
        const isPng = file.type === 'image/png'
        resolve(canvas.toDataURL(isPng ? 'image/png' : 'image/jpeg', 0.85))
      }
      img.src = src
    }
    reader.readAsDataURL(file)
  })
}
