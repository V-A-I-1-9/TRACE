'use client'

import { useEffect, useRef, useState } from 'react'
import { Camera, ImagePlus, SwitchCamera } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cameraError, photograph } from '@/lib/camera'

export function CameraCapture({
  onPhoto,
  onUpload,
  onCancel,
}: {
  onPhoto: (file: File) => void
  onUpload: () => void
  onCancel: () => void
}) {
  const video = useRef<HTMLVideoElement>(null)
  const stream = useRef<MediaStream | null>(null)
  const nativeInput = useRef<HTMLInputElement>(null)
  const attempt = useRef(0)
  const facing = useRef<'environment' | 'user'>('environment')
  const [phase, setPhase] = useState<'idle' | 'opening' | 'live' | 'taking'>('idle')
  const [message, setMessage] = useState('')
  const [nextDevice, setNextDevice] = useState('')

  function release() {
    ++attempt.current
    stream.current?.getTracks().forEach((track) => {
      track.onended = null
      track.stop()
    })
    stream.current = null
    if (video.current) video.current.srcObject = null
  }
  useEffect(() => {
    function pause() {
      if (document.hidden && (stream.current || attempt.current)) {
        release()
        setPhase('idle')
      }
    }
    document.addEventListener('visibilitychange', pause)
    return () => {
      document.removeEventListener('visibilitychange', pause)
      release()
    }
  }, [])

  async function openCamera(preferred: 'environment' | 'user', deviceId?: string) {
    release()
    const current = attempt.current
    setMessage('')
    setNextDevice('')
    if (!navigator.mediaDevices?.getUserMedia) {
      setPhase('idle')
      setMessage(
        window.isSecureContext
          ? 'This browser cannot show a live camera. Choose an image or use your device camera.'
          : 'Live camera needs HTTPS or localhost. Choose an image or use your device camera.',
      )
      return
    }
    setPhase('opening')
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: preferred } }),
          width: { ideal: 1920 },
          height: { ideal: 1440 },
        },
      })
      if (attempt.current !== current || !video.current) {
        media.getTracks().forEach((t) => t.stop())
        return
      }
      stream.current = media
      const track = media.getVideoTracks()[0]
      if (!track) throw new Error('No video track')
      facing.current =
        track.getSettings().facingMode === 'user'
          ? 'user'
          : track.getSettings().facingMode === 'environment'
            ? 'environment'
            : preferred
      track.onended = () => {
        release()
        setPhase('idle')
        setMessage('Camera disconnected. Reconnect it or choose an image.')
      }
      video.current.srcObject = media
      await video.current.play()
      if (attempt.current !== current) return
      setPhase('live')
      const devices = await navigator.mediaDevices.enumerateDevices().catch(() => [])
      const cameras = devices.filter((d) => d.kind === 'videoinput' && d.deviceId)
      const index = cameras.findIndex((d) => d.deviceId === track.getSettings().deviceId)
      if (attempt.current === current && cameras.length > 1)
        setNextDevice(cameras[(index + 1) % cameras.length].deviceId)
    } catch (error) {
      if (attempt.current !== current) return
      release()
      setMessage(cameraError(error))
      setPhase('idle')
    }
  }
  async function takePhoto() {
    if (!video.current || phase !== 'live') return
    const current = attempt.current
    setPhase('taking')
    try {
      const file = await photograph(video.current)
      if (current !== attempt.current) return
      release()
      onPhoto(file)
    } catch (error) {
      if (current !== attempt.current) return
      setMessage(error instanceof Error ? error.message : 'Could not take the photo.')
      setPhase('live')
    }
  }
  const active = phase !== 'idle'
  return (
    <section className="rounded-xl border bg-card p-5 space-y-4">
      <h2 className="text-xl font-medium">Image capture</h2>
      <video
        ref={video}
        playsInline
        muted
        autoPlay
        aria-label="Live camera preview"
        hidden={!active}
        className="max-h-[52dvh] w-full rounded-lg bg-black object-contain"
      />
      {phase === 'opening' && (
        <p role="status" className="text-sm">
          Waiting for your camera…
        </p>
      )}
      {message && (
        <p role="alert" className="text-sm text-muted-foreground">
          {message}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {phase === 'idle' && (
          <>
            <Button onClick={() => openCamera('environment')}>
              <Camera size={16} /> Open camera
            </Button>
            <Button variant="outline" onClick={onUpload}>
              <ImagePlus size={16} /> Choose an image
            </Button>
            {message && (
              <Button
                variant="outline"
                className="hidden pointer-coarse:inline-flex"
                onClick={() => nativeInput.current?.click()}
              >
                Use device camera
              </Button>
            )}
          </>
        )}
        {(phase === 'live' || phase === 'taking') && (
          <Button disabled={phase === 'taking'} onClick={takePhoto}>
            <Camera size={16} /> Take photo
          </Button>
        )}
        {phase === 'live' && nextDevice && (
          <Button
            variant="outline"
            onClick={() => openCamera(facing.current === 'user' ? 'environment' : 'user', nextDevice)}
          >
            <SwitchCamera size={16} /> Switch camera
          </Button>
        )}
        <Button
          variant="ghost"
          onClick={() => {
            release()
            onCancel()
          }}
        >
          Cancel
        </Button>
      </div>
      <input
        ref={nativeInput}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onPhoto(file)
        }}
      />
    </section>
  )
}
