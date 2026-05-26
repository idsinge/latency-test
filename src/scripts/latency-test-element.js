import { LatencyTestController } from './test.js'

const MIC_CONSTRAINTS = {
    audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        latency: 0,
        channelCount: 1
    }
}

export class LatencyTest extends HTMLElement {
    #controller = null
    #audioContext = null
    #inputStream = null
    #hostProvidedStream = false

    constructor() {
        super()
        this.attachShadow({ mode: 'open' })
    }

    connectedCallback() {
        // Element inserted into DOM — ready to accept start() calls
    }

    disconnectedCallback() {
        this.stop()
    }

    static get observedAttributes() {
        return ['mls-bits', 'max-lag-ms', 'input-gain', 'number-of-tests', 'recording-mode', 'signal-type']
    }

    attributeChangedCallback(name, oldValue, newValue) {
        const prop = name.replace(/-([a-z])/g, (_, c) => c.toUpperCase())
        this[prop] = newValue
    }

    // Property: audioContext (read-write)
    get audioContext() {
        return this.#audioContext
    }

    set audioContext(context) {
        this.#audioContext = context
    }

    get inputStream() {
        return this.#inputStream
    }

    set inputStream(stream) {
        this.#inputStream = stream
        this.#hostProvidedStream = !!stream
    }

    // Method: start the test
    async start() {
        if (this.#controller) this.stop()  // cancel any in-progress test
        try {
            this.#setupAudioContext()         // was after #acquireMic
            if (!await this.#acquireMic()) return
            if (this.#hostProvidedStream) {
                this.#emitEvent('latency-start', {})
            }
            await this.#runTest()
        } catch (error) {
            this.#emitEvent('latency-error', { message: error.message })
        }
    }

    async #acquireMic() {
        if (this.#hostProvidedStream) return true
        if (this.#inputStream) return true
        this.#inputStream = await navigator.mediaDevices.getUserMedia(MIC_CONSTRAINTS)
        this.#startSilence()
        this.#emitEvent('latency-start', {})
        return false
    }

    // Start silent audio immediately after mic grant to warm up the audio
    // pipeline. Prevents Chrome from producing a higher latency value on the
    // first test run. Based on Chris Wilson's metronome technique:
    // https://github.com/cwilso/metronome/blob/28a6e49d9dd75985d67d94fa9f45327d7310d62f/js/metronome.js#L74
    #startSilence() {
        const buffer = this.#audioContext.createBuffer(1, 2 * this.#audioContext.sampleRate, this.#audioContext.sampleRate)
        const source = this.#audioContext.createBufferSource()
        source.buffer = buffer
        source.connect(this.#audioContext.destination)
        source.start()
    }


    #setupAudioContext() {
        if (!this.#audioContext) {
            this.#audioContext = new AudioContext({ latencyHint: 0 })
        }
    }

    async #runTest() {
        this.#controller = new LatencyTestController()
        await this.#controller.initialize(this.#audioContext, this.#inputStream, {
            mlsBits: Number.parseInt(this.mlsBits, 10) || 15,
            maxLagMs: Number.parseInt(this.maxLagMs, 10) || 600,
            recordingMode: this.recordingMode || 'mediarecorder',
            //inputGain: Number.parseFloat(this.inputGain) || 0,
            onReady: () => { },
            onRecording: () => this.#emitEvent('latency-recording', {}),
            onProcessing: () => this.#emitEvent('latency-processing', {}),
            onResult: (data) => {
                this.#emitEvent('latency-result', data)
                this.#emitEvent('latency-complete', {
                    results: [{ ...data, timestamp: Date.now() }],
                    mean: data.latency,
                    std: 0,
                    min: data.latency,
                    max: data.latency
                })
                this.#controller = null
            },
            onError: (message) => this.#emitEvent('latency-error', { message })
        })
        this.#controller?.onAudioSetupFinished()
    }

    stop() {
        this.#controller?.stop()
        this.#controller = null
        if (!this.#hostProvidedStream && this.#inputStream) {
            this.#inputStream.getTracks().forEach(t => t.stop())
            this.#inputStream = null
        }
    }

    // Helper: emit event with bubbles + composed
    #emitEvent(eventName, detail) {
        this.dispatchEvent(new CustomEvent(eventName, {
            bubbles: true,
            composed: true,
            detail
        }))
    }
}

// Register custom element
customElements.define('latency-test', LatencyTest)
