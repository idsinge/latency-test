import { generateMLS } from './mls'

export class LatencyTestController {

    noiseBuffer = null
    audioContext = null
    correlation = null
    worker = null
    signalrecorded = null
    inputStream = null
    recordGainNode = null
    mediaRecorder = null
    noiseSource = null
    onResult = null
    onError = null
    onReady = null
    onRecording = null
    onProcessing = null
    mlsBits = 15
    maxLagMs = 600
    inputGain = 0

    async initialize(ac, stream, {  mlsBits = 15, maxLagMs = 600, inputGain = 0, onResult, onError, onReady, onRecording, onProcessing } = {}) {
        
        this.mlsBits = mlsBits
        this.maxLagMs = maxLagMs
        this.inputGain = inputGain
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
            this.workerMessageHandlder(message)
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
        this.prepareAudioToPlayAndRecord()
    }

    prepareAudioToPlayAndRecord() {

        this.signalrecorded = null

        /* @cwilso:  https://github.com/cwilso/metronome/blob/28a6e49d9dd75985d67d94fa9f45327d7310d62f/js/metronome.js#L74 */
        const silenceBuffer = this.audioContext.createBuffer(1, 2*this.audioContext.sampleRate, this.audioContext.sampleRate)
        const silenceNode = this.audioContext.createBufferSource()
        silenceNode.buffer = silenceBuffer
       
        const doTheTest = () => {

            this.noiseSource = this.audioContext.createBufferSource()
            this.noiseSource.buffer = this.noiseBuffer

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
        silenceNode.start(0)
        doTheTest()
    }

    finishTest() {
        this.onProcessing?.()
    }

    stop() {
        if (this.noiseSource) {
            this.noiseSource.onended = null
            try { this.noiseSource.stop() } catch (e) {}
        }
        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            this.mediaRecorder.onstop = null  // prevent stale handler after worker terminated
            this.mediaRecorder.stop()
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

    workerMessageHandlder(message){
        if(message.data.correlation){
            this.correlation = message.data.correlation
            this.worker.postMessage({
                command: 'findpeak',
                array: this.correlation,
                channel: message.data.channel
            })
        }
        if(message.data.peakValuePow){                 
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