import { TestLatencyMLS } from './test.js'

export class LatencyTest extends HTMLElement {
    #controller = null
    #audioContext = null
    #inputStream = null

    constructor() {
        super()
        this.attachShadow({ mode: 'open' })
    }

    connectedCallback() {
        // Element inserted into DOM — ready to accept start() calls
    }
    
    disconnectedCallback() {
        this.stop()
        if (this.#inputStream) {
            this.#inputStream.getTracks().forEach(t => t.stop())
        }
    }

    // Property: audioContext (read-write)
    get audioContext() {
        return this.#audioContext
    }

    set audioContext(context) {
        this.#audioContext = context
    }

    // Method: start the test
    async start() {
        try {
            // Step 1: Request microphone
            const constraints = {
                audio: {
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false,
                    latency: 0,
                    channelCount: 1
                }
            }
            this.#inputStream = await navigator.mediaDevices.getUserMedia(constraints)

            // Step 2: Create or use provided AudioContext
            if (!this.#audioContext) {
                this.#audioContext = new AudioContext({ latencyHint: 0 })
            }

            // Step 3: Emit latency-start event
            this.dispatchEvent(new CustomEvent('latency-start', {
                bubbles: true,
                composed: true,
                detail: {}
            }))

            // Step 4: Create controller and wire callbacks to events
            this.#controller = new TestLatencyMLS()
            this.#controller.initialize(this.#audioContext, this.#inputStream, {
                onReady: () => {},
                onRecording: () => this.#emitEvent('latency-recording', {}),
                onProcessing: () => this.#emitEvent('latency-processing', {}),
                onResult: (data) => this.#emitEvent('latency-result', data),
                onError: (message) => this.#emitEvent('latency-error', { message })
            })

        } catch (error) {
            this.dispatchEvent(new CustomEvent('latency-error', {
                bubbles: true,
                composed: true,
                detail: { message: error.message }
            }))
        }
    }

    stop() {
        this.#controller?.stop()
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
