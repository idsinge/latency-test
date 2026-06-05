import { LatencyTestController } from './test.js'

class LatencyTest extends (typeof HTMLElement !== 'undefined' ? HTMLElement : class {}) {
    #controller = null
    #worker = null
    #audioContext = null
    #inputStream = null
    #pendingRuns = 0
    #allResults = []
    #stopped = false

    numberOfTests = 1
    mlsBits = 15
    maxLagMs = 600
    bufferSize = 0
    recordingMode = 'mediarecorder'
    signalType = 'mls'
    inputGain = 0

    constructor() {
        super()
        this.attachShadow({ mode: 'open' })
    }

    connectedCallback() {
        // Element inserted into DOM — ready to accept start() calls
    }

    disconnectedCallback() {
        this.#log('disconnectedCallback', {})
        this.stop()
    }

    static get observedAttributes() {
        return ['mls-bits', 'max-lag-ms', 'input-gain', 'number-of-tests', 'recording-mode', 'signal-type', 'buffer-size']
    }

    attributeChangedCallback(name, oldValue, newValue) {
        this.#log('attributeChangedCallback', { name, oldValue, newValue })
        const prop = name.replace(/-([a-z])/g, (_, c) => c.toUpperCase())
        this[prop] = newValue
    }

    // Property: audioContext — must be set by the host before calling start()
    get audioContext() {
        return this.#audioContext
    }

    set audioContext(context) {
        this.#audioContext = context
    }

    // Property: inputStream — must be set by the host before calling start()
    get inputStream() {
        return this.#inputStream
    }

    set inputStream(stream) {
        this.#inputStream = stream
    }

    get debug() {
        return this.hasAttribute('debug')
    }

    set debug(v) {
        v ? this.setAttribute('debug', '') : this.removeAttribute('debug')
    }

    #log(label, data) {
        if (this.debug) console.debug('[latency-test]', performance.now().toFixed(2), label, data ?? '')
    }

    async start() {
        if (this.#controller) this.stop()
        if (!this.#inputStream) {
            this.#emitEvent('latency-error', { message: 'inputStream is required — assign a MediaStream to element.inputStream before calling start()' })
            return
        }
        if (!this.#audioContext) {
            this.#emitEvent('latency-error', { message: 'audioContext is required — assign an AudioContext to element.audioContext before calling start()' })
            return
        }
        if (this.#audioContext.state === 'suspended') {
            console.warn('[latency-test] AudioContext is suspended — call audioContext.resume() from a user gesture before start()')
        }
        const inputSampleRate = this.#inputStream.getAudioTracks()[0]?.getSettings()?.sampleRate
        if (inputSampleRate && inputSampleRate !== this.#audioContext.sampleRate) {
            console.warn(`[latency-test] Sample rate mismatch — input device: ${inputSampleRate} Hz, AudioContext: ${this.#audioContext.sampleRate} Hz. The AudioContext rate matches the output device (correct for MLS playback). Input resampling is handled transparently.`)
        }
        const mode = this.recordingMode || 'mediarecorder'
        if (!['mediarecorder', 'mediarecorder-1ch', 'audioworklet'].includes(mode)) {
            this.#emitEvent('latency-error', { message: `Unknown recording-mode "${mode}" — valid values: mediarecorder, mediarecorder-1ch, audioworklet` })
            return
        }
        this.#stopped = false
        this.#log('start', { recordingMode: mode, numberOfTests: this.numberOfTests || 1 })
        if (this.debug) {
            const track = this.#inputStream.getAudioTracks()[0]
            this.#log('inputStream', { readyState: track?.readyState, settings: track?.getSettings() })
            this.#log('audioContext', { sampleRate: this.#audioContext.sampleRate, state: this.#audioContext.state, baseLatency: this.#audioContext.baseLatency?.toFixed(4), outputLatency: this.#audioContext.outputLatency?.toFixed(4) })
        }
        this.#emitEvent('latency-start', {})
        this.#pendingRuns = Number.parseInt(this.numberOfTests, 10) || 1
        this.#allResults = []
        try {
            if (!this.#worker) {
                this.#worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' })
            }
            await this.#runNextTest()
        } catch (error) {
            this.#controller?.stop()
            this.#controller = null
            this.#pendingRuns = 0
            this.#stopped = true
            this.#worker?.terminate()
            this.#worker = null
            this.#emitEvent('latency-error', { message: error.message })
        }
    }

    async #runNextTest() {
        this.#log('#runNextTest', { pendingRuns: this.#pendingRuns })
        this.#controller = new LatencyTestController()
        await this.#controller.initialize(this.#audioContext, this.#inputStream, {
            worker: this.#worker,
            mlsBits: Number.parseInt(this.mlsBits, 10) || 15,
            maxLagMs: Number.parseInt(this.maxLagMs, 10) || 600,
            bufferSize: Number.parseInt(this.bufferSize, 10) || 0,
            recordingMode: this.recordingMode || 'mediarecorder',
            debug: this.debug,
            onReady: () => { },
            onRecording: () => this.#emitEvent('latency-recording', {}),
            onProcessing: () => this.#emitEvent('latency-processing', {}),
            onResult: (data) => {
                this.#emitEvent('latency-result', data)
                if (this.#stopped) return
                this.#allResults.push({ ...data, timestamp: Date.now() })
                this.#controller?.stop()
                this.#controller = null
                this.#pendingRuns--
                if (this.#pendingRuns > 0) {
                    this.#runNextTest().catch(e => this.#handleError(e.message))
                } else {
                    this.#emitComplete()
                }
            },
            onError: (message) => this.#handleError(message)
        })
        await this.#controller?.onAudioSetupFinished()
    }

    #emitComplete(aborted) {
        this.#log('#emitComplete', { resultCount: this.#allResults.length, aborted: !!aborted })
        const results = [...this.#allResults]
        const l = results.map(r => r.latency)
        const mean = l.length > 0 ? l.reduce((a, b) => a + b, 0) / l.length : 0
        this.#emitEvent('latency-complete', {
            results,
            mean,
            std: l.length > 1 ? Math.sqrt(l.reduce((s, v) => s + (v - mean) ** 2, 0) / l.length) : 0,
            min: l.length > 0 ? Math.min(...l) : 0,
            max: l.length > 0 ? Math.max(...l) : 0,
            ...(aborted ? { aborted: true } : {})
        })
    }

    #handleError(message) {
        this.#log('#handleError', { message })
        this.#controller?.stop()
        this.#controller = null
        this.#worker?.terminate()
        this.#worker = null
        const hadPending = this.#pendingRuns
        this.#pendingRuns = 0
        this.#stopped = true
        if (hadPending > 0) {
            this.#emitComplete(true)
        }
        this.#emitEvent('latency-error', { message })
    }

    stop() {
        if (this.#stopped) return
        this.#log('stop', { wasInProgress: !!this.#controller })
        this.#stopped = true
        this.#controller?.stop()
        this.#controller = null
        const hadPending = this.#pendingRuns
        this.#pendingRuns = 0
        this.#worker?.terminate()
        this.#worker = null
        if (hadPending > 0) {
            this.#emitComplete(true)
        }
    }

    // Helper: emit event with bubbles + composed
    #emitEvent(eventName, detail) {
        let logDetail
        if (eventName === 'latency-result') {
            logDetail = { latency: detail.latency, ratio: detail.ratio, reliable: detail.reliable, mode: detail.mode }
        } else if (eventName === 'latency-complete') {
            logDetail = { resultCount: detail.results?.length, mean: detail.mean, aborted: detail.aborted }
        } else {
            logDetail = detail
        }
        this.#log('#emitEvent', { event: eventName, detail: logDetail })
        this.dispatchEvent(new CustomEvent(eventName, {
            bubbles: true,
            composed: true,
            detail
        }))
    }
}

// Register custom element
if (typeof customElements !== 'undefined' && !customElements.get('latency-test')) {
    customElements.define('latency-test', LatencyTest)
}
export { LatencyTest }
export default LatencyTest
