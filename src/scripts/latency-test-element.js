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

class LatencyTest extends (typeof HTMLElement !== 'undefined' ? HTMLElement : class {}) {
    #controller = null
    #audioContext = null
    #inputStream = null
    #hostProvidedStream = false
    #pendingRuns = 0
    #allResults = []
    #stopped = false

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

    get debug() {
        return this.hasAttribute('debug')
    }

    set debug(v) {
        v ? this.setAttribute('debug', '') : this.removeAttribute('debug')
    }

    #log(label, data) {
        if (this.debug) console.debug('[latency-test]', performance.now().toFixed(2), label, data ?? '')
    }

    // Method: start the test
    async start() {
        if (this.#controller) this.stop()
        this.#stopped = false
        let streamState = 'none'
        if (this.#hostProvidedStream) streamState = 'host-provided'
        else if (this.#inputStream) streamState = 'reused'
        this.#log('start', { recordingMode: this.recordingMode || 'mediarecorder', numberOfTests: this.numberOfTests || 1, streamState })
        try {
            this.#setupAudioContext()
            await this.#acquireMic()
            this.#pendingRuns = Number.parseInt(this.numberOfTests, 10) || 1
            this.#allResults = []
            await this.#runNextTest()
        } catch (error) {
            this.#emitEvent('latency-error', { message: error.message })
        }
    }

    async #acquireMic() {
        if (this.#hostProvidedStream) {
            this.#log('#acquireMic', { streamState: 'host-provided' })
            this.#emitEvent('latency-start', {}); return
        }
        if (this.#inputStream) {
            this.#log('#acquireMic', { streamState: 'reused' })
            this.#emitEvent('latency-start', {}); return
        }
        this.#log('#acquireMic', { streamState: 'calling getUserMedia' })
        const t0 = performance.now()
        try {
            this.#inputStream = await navigator.mediaDevices.getUserMedia(MIC_CONSTRAINTS)
        } catch (e) {
            this.#log('#acquireMic getUserMedia failure', { error: e.name + ': ' + e.message })
            throw e
        }
        const track = this.#inputStream.getAudioTracks()[0]
        const s = track?.getSettings() ?? {}
        this.#log('#acquireMic getUserMedia success', { elapsedMs: (performance.now() - t0).toFixed(2), readyState: track?.readyState, enabled: track?.enabled, muted: track?.muted, sampleRate: s.sampleRate, channelCount: s.channelCount, echoCancellation: s.echoCancellation })
        this.#emitEvent('latency-start', {})
    }

    #setupAudioContext() {
        if (this.#audioContext) {
            this.#log('#setupAudioContext reused', { sampleRate: this.#audioContext.sampleRate, state: this.#audioContext.state })
        } else {
            this.#audioContext = new AudioContext({ latencyHint: 0 })
            this.#log('#setupAudioContext created', { sampleRate: this.#audioContext.sampleRate, state: this.#audioContext.state })
        }
    }

    async #runNextTest() {
        this.#log('#runNextTest', { pendingRuns: this.#pendingRuns })
        this.#controller = new LatencyTestController()
        await this.#controller.initialize(this.#audioContext, this.#inputStream, {
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
        this.#log('#emitComplete', { resultCount: this.#allResults.length, streamWillStop: !this.#hostProvidedStream && !!this.#inputStream, aborted: !!aborted })
        const results = [...this.#allResults]
        const l = results.map(r => r.latency)
        const mean = l.length > 0 ? l.reduce((a, b) => a + b, 0) / l.length : 0
        if (!this.#hostProvidedStream && this.#inputStream) {
            this.#inputStream.getTracks().forEach(t => t.stop())
            this.#inputStream = null
        }
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
        this.#emitEvent('latency-error', { message })
        this.#controller?.stop()
        this.#controller = null
        const hadPending = this.#pendingRuns
        this.#pendingRuns = 0
        this.#stopped = true
        if (hadPending > 0) {
            this.#emitComplete(true)
        }
    }

    stop() {
        if (this.#stopped) return
        this.#log('stop', { wasInProgress: !!this.#controller })
        this.#stopped = true
        this.#controller?.stop()
        this.#controller = null
        const hadPending = this.#pendingRuns
        this.#pendingRuns = 0
        if (hadPending > 0) {
            this.#emitComplete(true)
        }
        if (!this.#hostProvidedStream && this.#inputStream) {
            this.#inputStream.getTracks().forEach(t => t.stop())
            this.#inputStream = null
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
