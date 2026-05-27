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
    
    async initialize(ac, stream, { recordingMode = 'mediarecorder', mlsBits = 15, maxLagMs = 600, bufferSize = 0, onResult, onError, onReady, onRecording, onProcessing } = {}) {
        
        this.recordingMode = recordingMode
        this.mlsBits = mlsBits
        this.maxLagMs = maxLagMs
        this.bufferSize = bufferSize
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
            
        this.audioContext = ac
        this.onAudioPermissionGranted(stream)
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
        this.signalrecorded = null
        this.noiseSource = this.audioContext.createBufferSource()
        this.noiseSource.buffer = this.noiseBuffer

        // Keep the audio thread scheduled during every test run (cwilso keepalive).
        // Without this, Firefox's audio scheduler may relax between runs and
        // introduce timing jitter. The element's one-time #startSilence() warmup
        // handles Chrome's first-run cold-start; this covers all runs.
        const silenceBuffer = this.audioContext.createBuffer(
            1,
            2 * this.audioContext.sampleRate,
            this.audioContext.sampleRate
        )
        const silenceNode = this.audioContext.createBufferSource()
        silenceNode.buffer = silenceBuffer
        silenceNode.connect(this.audioContext.destination)
        silenceNode.start()

        if (this.recordingMode === 'audioworklet') {
            await this.startWorkletCapture()
        } else {
            this.startMediaRecorderCapture()
        }
    }

    startMediaRecorderCapture() {
        this.noiseSource.connect(this.audioContext.destination)

        let chunks = []
        this.mediaRecorder = new MediaRecorder(this.inputStream)
        this.mediaRecorder.ondataavailable = async (event) => {
            chunks.push(event.data)
        }
        this.mediaRecorder.onstop = async () => {
            this.noiseSource.disconnect(this.audioContext.destination)
            this.displayAudioTagElem(chunks, this.mediaRecorder.mimeType)
        }
        this.mediaRecorder.start()
        this.noiseSource.start()
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
        this.noiseSource.connect(this.workletNode, 0, 1)
        this.noiseSource.connect(this.audioContext.destination)

        this.workletNode.port.postMessage({ command: 'start' })
        this.noiseSource.start()
        this.onRecording?.()

        this.workletNode.port.onmessage = (e) => {
            const mic = concatFloat32(e.data.mic)
            const ref = concatFloat32(e.data.ref)
            this.correlation = null
            this.worker.postMessage({
                command: 'correlation',
                data1: mic,
                data2: ref,
                maxLag: (this.maxLagMs / 1000) * this.audioContext.sampleRate,
                channel: 0
            })
            this.workletNode.port.onmessage = null
            this.workletNode.disconnect()
            this.workletNode = null
            this.micSource?.disconnect()
            this.micSource = null
        }

        this.noiseSource.onended = () => {
            this.workletNode.port.postMessage({ command: 'stop' })
            this.finishTest()
        }
    }

   async loadRecorderProcessor(ac) {
        const pending = loadedProcessors.get(ac)
        if (pending) {
            await pending
            return
        }
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
            loadedProcessors.delete(ac)
            throw e
        }))
        await loadedProcessors.get(ac)
    }

    finishTest() {
        this.onProcessing?.()
    }

    stop() {
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
            this.worker.postMessage({
                command: 'findpeak',
                array: this.correlation,
                channel: message.data.channel
            })
        }
        if('peakValuePow' in message.data){
            this.displayresults(message.data, this.signalrecorded, this.noiseBuffer, this.correlation)                      
        }
    }  

    async displayAudioTagElem(chunks, mimeType) {
        
        const recordedAudio = new Blob(chunks, { type: mimeType })
        
        this.signalrecorded = await this.blobToAudioBuffer(this.audioContext, recordedAudio)       
        
        this.correlation = null
        this.worker.postMessage({
            command: 'correlation',
            data1: this.signalrecorded.getChannelData(0), 
            data2: this.noiseBuffer.getChannelData(0), 
            maxLag: (this.maxLagMs / 1000) * this.audioContext.sampleRate,
            channel: 0
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
            this.onResult?.({latency, ratio, reliable, timestamp: Date.now()})
        } else{
            console.log('Channel', peak.channel )
            const roundtriplatency = peak.peakIndex / mlssignal.sampleRate * 1000
            console.log('Latency = ', roundtriplatency + ' ms')
            const ratioIs = 10 * Math.log10(peak.peakValuePow / peak.mean)
            console.log('Corr Ratio', ratioIs)
        }      
    }
}