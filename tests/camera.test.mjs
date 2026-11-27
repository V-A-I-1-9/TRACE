import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cameraError, photograph } from '../src/lib/camera.ts'
import { readSource } from '../src/lib/source-input.ts'

test('a portrait or landscape camera frame goes through the image capture contract', async () => {
  for (const [width, height, expected] of [
    [3840, 2160, [2400, 1350]],
    [1080, 1920, [1080, 1920]],
  ]) {
    const video = { videoWidth: width, videoHeight: height, readyState: 4 }
    const canvas = {
      getContext: () => ({
        drawImage: (source, x, y, w, h) => {
          assert.equal(source, video)
          assert.deepEqual([x, y, w, h], [0, 0, ...expected])
        },
      }),
      toBlob: (callback, mime) => callback(new Blob(['camera fixture'], { type: mime })),
    }
    const file = await photograph(video, () => canvas)
    const form = new FormData()
    form.set('file', file)
    const source = await readSource(
      new Request('http://localhost/capture', { method: 'POST', body: form }),
      'IMAGE',
    )
    assert.equal(source.ext, 'jpg')
    assert.deepEqual([canvas.width, canvas.height], expected)
    assert.equal(source.name, 'camera-photo.jpg')
  }
})

test('unready or unreadable frames can be retried without saving an empty photo', async () => {
  await assert.rejects(photograph({ videoWidth: 0, videoHeight: 0, readyState: 0 }), /live frame/)
  await assert.rejects(
    photograph({ videoWidth: 640, videoHeight: 480, readyState: 2 }, () => ({
      getContext: () => ({ drawImage() {} }),
      toBlob: (cb) => cb(null),
    })),
    /empty/,
  )
})
test('permission denial, missing camera and device contention have distinct recovery instructions', () => {
  for (const [name, expected] of [
    ['NotAllowedError', /Allow camera/],
    ['NotFoundError', /Connect a camera/],
    ['NotReadableError', /busy/],
  ]) {
    assert.match(cameraError(Object.assign(new Error(), { name })), expected)
  }
})
