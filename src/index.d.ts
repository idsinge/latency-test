export interface LatencyResultDetail {
  latency: number
  ratio: number
  reliable: boolean
  timestamp: number
  mode: 'mediarecorder' | 'mediarecorder-2ch' | 'audioworklet'
}

export interface LatencyCompleteDetail {
  results: LatencyResultDetail[]
  mean: number
  std: number
  min: number
  max: number
  aborted?: true
}

export interface LatencyErrorDetail {
  message: string
}

type EmptyDetail = Record<string, never>

export interface LatencyTestEventMap extends HTMLElementEventMap {
  'latency-start':      CustomEvent<EmptyDetail>
  'latency-recording':  CustomEvent<EmptyDetail>
  'latency-processing': CustomEvent<EmptyDetail>
  'latency-result':     CustomEvent<LatencyResultDetail>
  'latency-complete':   CustomEvent<LatencyCompleteDetail>
  'latency-error':      CustomEvent<LatencyErrorDetail>
}

export interface LatencyTestElement extends HTMLElement {
  start(): Promise<void>
  stop(): void
  audioContext: AudioContext | null
  inputStream: MediaStream | null
  inputGain: number
  numberOfTests: number
  mlsBits: number
  maxLagMs: number
  bufferSize: number
  recordingMode: 'mediarecorder' | 'mediarecorder-2ch' | 'audioworklet'
  signalType: 'mls' | 'chirp' | 'golay'
  debug: boolean
  addEventListener<K extends keyof LatencyTestEventMap>(
    type: K,
    listener: (this: LatencyTestElement, ev: LatencyTestEventMap[K]) => void,
    options?: boolean | AddEventListenerOptions
  ): void
  removeEventListener<K extends keyof LatencyTestEventMap>(
    type: K,
    listener: (this: LatencyTestElement, ev: LatencyTestEventMap[K]) => void,
    options?: boolean | EventListenerOptions
  ): void
}

declare global {
  interface HTMLElementTagNameMap {
    'latency-test': LatencyTestElement
  }
}
