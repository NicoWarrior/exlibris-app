export async function comprimirImagen(file: File, maxAncho = 1200, calidad = 0.78): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(url)
      let { width, height } = img

      if (width > maxAncho) {
        height = Math.round((height * maxAncho) / width)
        width = maxAncho
      }

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height

      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('No se pudo inicializar el lienzo de compresión'))
        return
      }

      ctx.drawImage(img, 0, 0, width, height)
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob)
          else reject(new Error('Error al comprimir la imagen'))
        },
        'image/jpeg',
        calidad
      )
    }

    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('No se pudo leer la imagen seleccionada'))
    }

    img.src = url
  })
}