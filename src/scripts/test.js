import { generateMLS } from './mls.js'

function concatFloat32(arrays) {
    let len = 0
    for (const a of arrays) len += a.length
    const result = new Float32Array(len)
    let offset = 0
    for (const a of arrays) { result.set(a, offset); offset += a.length }
    return result
}

const loadedProcessors = new WeakMap()

export class LatencyTestController {

    noiseBuffer = null
    audioContext = null
    correlation = null
    worker = null
    signalrecorded = null
    inputStream = null
    mediaRecorder = null
    noiseSource = null
    onResult = null
    onError = null
    onReady = null
    onRecording = null
    onProcessing = null
    mlsBits = 15
    maxLagMs = 600
    recordingMode = 'mediarecorder'
    workletNode = null
    stopped = false
    preRollMs = 300
    debug = false
    
    async initialize(ac, stream, { recordingMode = 'mediarecorder', mlsBits = 15, maxLagMs = 600, bufferSize = 0, debug = false, onResult, onError, onReady, onRecording, onProcessing } = {}) {

        this.recordingMode = recordingMode
        this.mlsBits = mlsBits
        this.maxLagMs = maxLagMs
        this.bufferSize = bufferSize
        this.debug = debug
        this.onResult = onResult
        this.onError = onError
        this.onReady = onReady
        this.onRecording = onRecording
        this.onProcessing = onProcessing
        
        this.worker = new Worker(
            new URL('worker.js', import.meta.url),
            {type: 'module'}
        )
        this.worker.addEventListener('message', (message) => {
            this.workerMessageHandler(message)
        })
        this.worker.addEventListener('error', (e) => {
            this.#log('worker error', { message: e.message })
        })
        this.worker.addEventListener('messageerror', (e) => {
            this.#log('worker messageerror', { message: e.message })
        })
            
        this.audioContext = ac
        this.onAudioPermissionGranted(stream)
        this.#log('initialize', { recordingMode, mlsBits, maxLagMs, sampleRate: ac.sampleRate, debug })
    }

    #log(label, data) {
        if (this.debug) console.debug('[latency-test]', performance.now().toFixed(2), label, data ?? '')
    }

    onAudioPermissionGranted(inputStream) {
        const noisemls = generateMLS(this.mlsBits)
        this.noiseBuffer = this.generateAudio(noisemls, this.audioContext.sampleRate)
        this.inputStream = inputStream
        this.displayStart()
    }

    displayStart() {
        this.onReady?.()
    }

    async onAudioSetupFinished() {
        return this.prepareAudioToPlayAndRecord()
    }

    async prepareAudioToPlayAndRecord() {
        this.#log('prepareAudioToPlayAndRecord', { recordingMode: this.recordingMode, preRollMs: this.preRollMs, audioTime: this.audioContext.currentTime.toFixed(4) })
        this.signalrecorded = null
        this.noiseSource = this.audioContext.createBufferSource()
        this.noiseSource.buffer = this.noiseBuffer

        // Keep the audio thread scheduled during every test run (cwilso keepalive).
        // Without this, Firefox's audio scheduler may relax between runs and
        // introduce timing jitter.
        const silenceBuffer = this.audioContext.createBuffer(
            1,
            2 * this.audioContext.sampleRate,
            this.audioContext.sampleRate
        )
        const silenceNode = this.audioContext.createBufferSource()
        silenceNode.buffer = silenceBuffer
        silenceNode.connect(this.audioContext.destination)
        silenceNode.start()
        this.#log('silence started', { audioTime: this.audioContext.currentTime.toFixed(4) })

        const preRollT0 = performance.now()
        this.#log('pre-roll start', { preRollMs: this.preRollMs, targetAudioTime: (this.audioContext.currentTime + this.preRollMs / 1000).toFixed(4) })
        await new Promise(resolve => {
            const targetAudioTime = this.audioContext.currentTime + this.preRollMs / 1000
            const wallDeadline = Date.now() + this.preRollMs * 2
            const poll = () => {
                if (this.stopped || this.audioContext.currentTime >= targetAudioTime || Date.now() >= wallDeadline) {
                    resolve()
                } else {
                    setTimeout(poll, 10)
                }
            }
            setTimeout(poll, 10)
        })
        this.#log('pre-roll complete', { audioTime: this.audioContext.currentTime.toFixed(4), elapsedMs: (performance.now() - preRollT0).toFixed(2) })
        if (this.stopped) return

        if (this.recordingMode === 'audioworklet') {
            await this.startWorkletCapture()
        } else if (this.recordingMode === 'mediarecorder-2ch') {
            this.onError?.('recording-mode "mediarecorder-2ch" is not yet implemented')
            return
        } else {
            this.startMediaRecorderCapture()
        }
    }

    startMediaRecorderCapture() {
        this.noiseSource.connect(this.audioContext.destination)

        let chunks = []
        try {
            this.mediaRecorder = new MediaRecorder(this.inputStream)
        } catch (e) {
            this.#log('MediaRecorder constructor failure', { error: e.name + ': ' + e.message })
            throw e
        }
        this.mediaRecorder.ondataavailable = async (event) => {
            chunks.push(event.data)
        }
        this.mediaRecorder.onstop = async () => {
            this.#log('mediaRecorder.onstop', { chunks: chunks.length })
            this.noiseSource.disconnect(this.audioContext.destination)
            try {
                await this.displayAudioTagElem(chunks, this.mediaRecorder.mimeType)
            } catch (e) {
                this.onError?.(e.message)
            }
        }
        const mrStartTime = performance.now()
        try {
            this.mediaRecorder.start()
        } catch (e) {
            this.#log('mediaRecorder.start failure', { error: e.name + ': ' + e.message })
            throw e
        }
        this.noiseSource.start()
        const nsStartTime = performance.now()
        this.#log('mediaRecorder.start', { mimeType: this.mediaRecorder.mimeType, t: mrStartTime.toFixed(2) })
        this.#log('noiseSource.start', { audioTime: this.audioContext.currentTime.toFixed(4), startPairSpanMs: (nsStartTime - mrStartTime).toFixed(2) })
        this.onRecording?.()
        this.noiseSource.onended = () => {
            this.mediaRecorder.stop()
            this.finishTest()
        }
    }

    async startWorkletCapture() {
        await this.loadRecorderProcessor(this.audioContext)

        this.workletNode = new AudioWorkletNode(this.audioContext, 'recorder-processor', {
            numberOfInputs: 2,
            numberOfOutputs: 1,
            outputChannelCount: [1],
            processorOptions: { bufferSize: this.bufferSize }
        })

        this.micSource = this.audioContext.createMediaStreamSource(this.inputStream)
        this.micSource.connect(this.workletNode, 0, 0)
        this.#log('worklet mic source connected', { audioTime: this.audioContext.currentTime.toFixed(4) })
        this.noiseSource.connect(this.workletNode, 0, 1)
        this.#log('worklet ref source connected', { audioTime: this.audioContext.currentTime.toFixed(4) })
        this.noiseSource.connect(this.audioContext.destination)

        this.workletNode.port.postMessage({ command: 'start' })
        this.#log('workletNode start', { audioTime: this.audioContext.currentTime.toFixed(4) })
        this.noiseSource.start()
        this.#log('noiseSource.start (worklet)', { audioTime: this.audioContext.currentTime.toFixed(4) })
        this.onRecording?.()

        this.workletNode.port.onmessage = (e) => {
            const mic = concatFloat32(e.data.mic)
            const ref = concatFloat32(e.data.ref)
            this.#log('worklet message received', { micLen: mic.length, refLen: ref.length })
            this.correlation = null
            const wMaxLag = Math.floor((this.maxLagMs / 1000) * this.audioContext.sampleRate)
            this.#log('worker postMessage correlation (worklet)', { maxLag: wMaxLag, data1Len: mic.length, data2Len: ref.length, channel: 0, debug: this.debug })
            this.worker.postMessage({
                command: 'correlation',
                data1: mic,
                data2: ref,
                maxLag: wMaxLag,
                channel: 0,
                debug: this.debug
            })
            this.workletNode.port.onmessage = null
            this.workletNode.disconnect()
            this.workletNode = null
            this.micSource?.disconnect()
            this.micSource = null
        }

        this.noiseSource.onended = () => {
            this.workletNode.port.postMessage({ command: 'stop' })
            this.#log('workletNode stop', { audioTime: this.audioContext.currentTime.toFixed(4) })
            this.finishTest()
        }
    }

   async loadRecorderProcessor(ac) {
        const t0 = performance.now()
        const pending = loadedProcessors.get(ac)
        if (pending) {
            this.#log('loadRecorderProcessor cache-hit', {})
            await pending
            return
        }
        this.#log('loadRecorderProcessor start', {})
        const p = (async () => {
            const url = new URL('./recorder-processor.js', import.meta.url)
            const resp = await fetch(url)
            const source = await resp.text()
            const blob = new Blob([source], { type: 'application/javascript' })
            const blobUrl = URL.createObjectURL(blob)
            await ac.audioWorklet.addModule(blobUrl)
            URL.revokeObjectURL(blobUrl)
        })()
        loadedProcessors.set(ac, p.catch(e => {
            this.#log('loadRecorderProcessor failure', { error: e.message })
            loadedProcessors.delete(ac)
            throw e
        }))
        await loadedProcessors.get(ac)
        this.#log('loadRecorderProcessor complete', { elapsedMs: (performance.now() - t0).toFixed(2) })
    }

    finishTest() {
        this.onProcessing?.()
    }

    stop() {
        this.#log('stop', { alreadyStopped: this.stopped, hasRecorder: !!this.mediaRecorder, hasWorklet: !!this.workletNode })
        this.stopped = true
        if (this.noiseSource) {
            this.noiseSource.onended = null
            try { this.noiseSource.stop() } catch (e) {}
            this.noiseSource.disconnect()
        }
        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            this.mediaRecorder.onstop = null
            this.mediaRecorder.stop()
        }
        if (this.workletNode) {
            this.workletNode.port.onmessage = null
            this.workletNode.port.postMessage({ command: 'stop' })
            this.workletNode.disconnect()
            this.workletNode = null
        }
        if (this.micSource) {
            this.micSource.disconnect()
            this.micSource = null
        }
        if (this.worker) {
            this.worker.terminate()
            this.worker = null
        }
    }

    async blobToAudioBuffer(audioContext, blob) {
        const arrayBuffer = await blob.arrayBuffer()
        return await audioContext.decodeAudioData(arrayBuffer)
    }

    workerMessageHandler(message){
        if(message.data.correlation){
            this.correlation = message.data.correlation
            this.#log('worker postMessage findpeak', { correlationLen: this.correlation.length })
            this.worker.postMessage({
                command: 'findpeak',
                array: this.correlation,
                channel: message.data.channel,
                debug: this.debug
            })
        }
        if('peakValuePow' in message.data){
            this.#log('worker result', { peakIndex: message.data.peakIndex, channel: message.data.channel })
            this.displayresults(message.data, this.signalrecorded, this.noiseBuffer, this.correlation)
        }
    }  

    async displayAudioTagElem(chunks, mimeType) {

        const recordedAudio = new Blob(chunks, { type: mimeType })

        try {
            this.signalrecorded = await this.blobToAudioBuffer(this.audioContext, recordedAudio)
        } catch (e) {
            this.#log('decodeAudioData failure', { error: e.name + ': ' + e.message })
            throw e
        }
        this.#log('decodeAudioData result', { channels: this.signalrecorded.numberOfChannels, duration: this.signalrecorded.duration.toFixed(3) + 's', sampleRate: this.signalrecorded.sampleRate, length: this.signalrecorded.length })

        const maxLag = Math.floor((this.maxLagMs / 1000) * this.audioContext.sampleRate)
        this.#log('worker postMessage correlation', { maxLag, data1Len: this.signalrecorded.getChannelData(0).length, data2Len: this.noiseBuffer.getChannelData(0).length, channel: 0, debug: this.debug })
        this.correlation = null
        this.worker.postMessage({
            command: 'correlation',
            data1: this.signalrecorded.getChannelData(0),
            data2: this.noiseBuffer.getChannelData(0),
            maxLag,
            channel: 0,
            debug: this.debug
        })
    }

    generateAudio(mlsSequence, frequency) {        

        const audioBuffer = this.audioContext.createBuffer(1, mlsSequence.length, frequency)
        let bufferData = audioBuffer.getChannelData(0)
        for (let i = 0; i < mlsSequence.length; i++) {
            // Convert binary sequence to audio signal
            bufferData[i] = mlsSequence[i] === 1 ? 1.0 : -1.0  // Map 1 to 1.0 and 0 to -1.0
        }
        return audioBuffer
    }

    displayresults(peak, signalrecorded, mlssignal, correlation) {
        if(peak.channel === 0){
            const latency = peak.peakIndex / mlssignal.sampleRate * 1000
            const ratio = 10 * Math.log10(peak.peakValuePow / peak.mean)
            const reliable = ratio > 18
            this.#log('displayresults', { latency: latency.toFixed(2) + 'ms', ratio: ratio.toFixed(2) + 'dB', reliable, mode: this.recordingMode })
            this.onResult?.({latency, ratio, reliable, timestamp: Date.now(), mode: this.recordingMode})
        } else{
            console.log('Channel', peak.channel )
            const roundtriplatency = peak.peakIndex / mlssignal.sampleRate * 1000
            console.log('Latency = ', roundtriplatency + ' ms')
            const ratioIs = 10 * Math.log10(peak.peakValuePow / peak.mean)
            console.log('Corr Ratio', ratioIs)
        }      
    }
}