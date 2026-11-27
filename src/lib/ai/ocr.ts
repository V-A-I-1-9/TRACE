import path from 'node:path'
import sharp from 'sharp'
import { createWorker } from 'tesseract.js'

export async function readScreenshot(bytes: Buffer) {
  // Reject decompression bombs and bound the worker's pixel count.
  const image = await sharp(bytes, { limitInputPixels: 32000000 })
    .rotate()
    .resize({
      width: 1800,
      height: 2400,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .flatten({ background: '#fff' })
    .png()
    .toBuffer()
  const worker = await createWorker('eng', 1, {
    langPath: path.join(process.cwd(), 'node_modules/@tesseract.js-data/eng/4.0.0_best_int'),
    cacheMethod: 'none',
  })
  try {
    const { data } = await worker.recognize(image)
    return data.confidence >= 80 ? data.text.trim().slice(0, 16000) : ''
  } finally {
    await worker.terminate()
  }
}
