class RecorderProcessor extends AudioWorkletProcessor {
    constructor(options) {
        super()
        this.mic = []
        this.ref = []
        this.recording = false
        this.bufferSize = options?.processorOptions?.bufferSize || 0
        this.port.onmessage = (e) => {
            if (e.data.command === 'start') {
                this.mic = []
                this.ref = []
                this.recording = true
            }
            if (e.data.command === 'stop' && this.recording) {
                this.recording = false
                this.port.postMessage({
                    mic: this.mic,
                    ref: this.ref
                })
            }
        }
    }

    process(inputs) {
        if (!this.recording) return true
        const mic = inputs[0]?.[0]
        const ref = inputs[1]?.[0]
        if (mic) this.mic.push(new Float32Array(mic))
        if (ref) this.ref.push(new Float32Array(ref))
        return true
    }
}

registerProcessor('recorder-processor', RecorderProcessor)