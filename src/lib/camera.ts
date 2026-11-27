export function cameraError(error: unknown) {
  const name = error instanceof Error ? error.name : ''
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Camera access is blocked. Allow camera access in your browser settings, or choose an image.'
    case 'NotFoundError':
      return 'No camera was found. Connect a camera or choose an image.'
    case 'NotReadableError':
      return 'The camera is busy. Close any app using it and try again.'
    default:
      return 'Could not open the camera. Try again or choose an image.'
  }
}

export async function photograph(
  video: HTMLVideoElement,
  createCanvas = () => document.createElement('canvas'),
) {
  if (!video.videoWidth || !video.videoHeight || video.readyState < 2)
    throw new Error('Wait for a live frame, then try again.')
  const scale = Math.min(1, 2400 / Math.max(video.videoWidth, video.videoHeight))
  const canvas = createCanvas()
  canvas.width = Math.max(1, Math.round(video.videoWidth * scale))
  canvas.height = Math.max(1, Math.round(video.videoHeight * scale))
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Could not capture a frame. Choose an image instead.')
  context.drawImage(video, 0, 0, canvas.width, canvas.height)
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92))
  if (!blob?.size) throw new Error('The photo was empty. Please take it again.')
  return new File([blob], 'camera-photo.jpg', { type: 'image/jpeg' })
}
