import { useCallback, useEffect, useRef, useState } from 'react'

export type AudioRecorderState = {
  recording: boolean
  transcribing: boolean
  audioUrl: string
  error: string
}

type Options = {
  transcribe: (audioBase64: string, mimeType: string) => Promise<string>
  onTranscribed: (text: string) => void
}

const EMPTY_STATE: AudioRecorderState = {
  recording: false,
  transcribing: false,
  audioUrl: '',
  error: '',
}

function blobToBase64(blob: Blob): Promise<string> {
  return blob.arrayBuffer().then((buffer) => {
    const bytes = new Uint8Array(buffer)
    const chunkSize = 0x8000
    let binary = ''
    for (let index = 0; index < bytes.length; index += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
    }
    return btoa(binary)
  })
}

export function useAudioRecorder({ transcribe, onTranscribed }: Options) {
  const [state, setState] = useState<AudioRecorderState>(EMPTY_STATE)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const audioUrlRef = useRef('')
  const operationRef = useRef(0)
  const transcribeRef = useRef(transcribe)
  const onTranscribedRef = useRef(onTranscribed)

  useEffect(() => { transcribeRef.current = transcribe }, [transcribe])
  useEffect(() => { onTranscribedRef.current = onTranscribed }, [onTranscribed])

  const releaseAudioUrl = useCallback(() => {
    if (!audioUrlRef.current) return
    URL.revokeObjectURL(audioUrlRef.current)
    audioUrlRef.current = ''
  }, [])

  const stop = useCallback(() => {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
  }, [])

  const reset = useCallback(() => {
    operationRef.current += 1
    stop()
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    releaseAudioUrl()
    setState(EMPTY_STATE)
  }, [releaseAudioUrl, stop])

  const start = useCallback(async () => {
    if (recorderRef.current?.state === 'recording') return
    if (!navigator.mediaDevices?.getUserMedia) {
      setState((current) => ({ ...current, error: '当前浏览器不支持录音，请使用文字回答。' }))
      return
    }

    const operation = operationRef.current + 1
    operationRef.current = operation
    try {
      releaseAudioUrl()
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (operation !== operationRef.current) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      const recorder = new MediaRecorder(stream)
      streamRef.current = stream
      recorderRef.current = recorder
      chunksRef.current = []

      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data)
      }
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop())
        streamRef.current = null
        if (operation !== operationRef.current) return
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' })
        releaseAudioUrl()
        const audioUrl = URL.createObjectURL(blob)
        audioUrlRef.current = audioUrl
        setState({ recording: false, transcribing: true, audioUrl, error: '' })

        try {
          const text = await transcribeRef.current(await blobToBase64(blob), blob.type)
          if (operation !== operationRef.current) return
          onTranscribedRef.current(text)
          setState({ recording: false, transcribing: false, audioUrl, error: '' })
        } catch (error) {
          if (operation !== operationRef.current) return
          setState({
            recording: false,
            transcribing: false,
            audioUrl,
            error: error instanceof Error ? error.message : '语音转写失败，请改用文字回答。',
          })
        }
      }

      recorder.start()
      setState({ recording: true, transcribing: false, audioUrl: '', error: '' })
    } catch (error) {
      if (operation !== operationRef.current) return
      setState({
        recording: false,
        transcribing: false,
        audioUrl: '',
        error: error instanceof Error && error.name === 'NotAllowedError'
          ? '麦克风权限未开启，请允许后重试。'
          : '无法访问麦克风，请改用文字回答。',
      })
    }
  }, [releaseAudioUrl])

  useEffect(() => () => {
    operationRef.current += 1
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
    streamRef.current?.getTracks().forEach((track) => track.stop())
    releaseAudioUrl()
  }, [releaseAudioUrl])

  return { state, start, stop, reset }
}
