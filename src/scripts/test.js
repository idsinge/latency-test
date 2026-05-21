import { generateMLS } from './mls'

export class TestLatencyMLS {

    noiseBuffer = null   
    
    audioContext = null

    startbutton = null

    content = null

    correlation = null

    worker = null

    signalrecorded = null
    
    btnId = null

    inputStream = null

    recordGainNode = null

    onResult = null

    onError = null

    async initialize(ac, stream, btnId, { onResult, onError } = {}) {

        this.onResult = onResult

        this.onError = onError

        this.btnId = btnId        

        this.worker = new Worker(
            new URL('worker.js', import.meta.url),
            {type: 'module'}
        )
        this.worker.addEventListener('message', (message) => {
            this.workerMessageHanlder(message)
        })
            
        this.audioContext = ac
        this.onAudioPermissionGranted(stream)
    }

    onAudioPermissionGranted(inputStream) {
        const noisemls = generateMLS(15)
        this.noiseBuffer = this.generateAudio(noisemls, this.audioContext.sampleRate)
        this.inputStream = inputStream
        this.displayStart()
    }

    displayStart() {

        this.content = document.getElementById(this.btnId)
        this.content.innerHTML = ''        
        this.startbutton = document.createElement('a')
        this.startbutton.innerText = 'TEST LATENCY'
        this.startbutton.onclick = () => this.onAudioSetupFinished()
        this.content.appendChild(this.startbutton)
    
    }

    async onAudioSetupFinished() {
        this.startbutton.innerText = 'STOP'       
        this.startbutton.onclick = () => this.displayStart()
        this.prepareAudioToPlayAndrecord()
    }

    prepareAudioToPlayAndrecord() {

        this.signalrecorded = null

        /* @cwilso:  https://github.com/cwilso/metronome/blob/28a6e49d9dd75985d67d94fa9f45327d7310d62f/js/metronome.js#L74 */
        const silenceBuffer = this.audioContext.createBuffer(1, 2*this.audioContext.sampleRate, this.audioContext.sampleRate)
        const silenceNode = this.audioContext.createBufferSource()
        silenceNode.buffer = silenceBuffer
       
        const doTheTest = () => {

            const noiseSource = this.audioContext.createBufferSource()
            noiseSource.buffer = this.noiseBuffer

            noiseSource.connect(this.audioContext.destination)

            let chunks = []

            const mediaRecorder = new MediaRecorder(this.inputStream)

            mediaRecorder.ondataavailable = async (event) => {
                chunks.push(event.data)
            }
            mediaRecorder.onstop = async () => {
                noiseSource.disconnect(this.audioContext.destination)
                this.displayAudioTagElem(chunks, mediaRecorder.mimeType)
            }

            mediaRecorder.start()

            noiseSource.start()
            noiseSource.onended = () => {
                mediaRecorder.stop()
                this.finishTest()
            }
        }
        silenceNode.start(0)
        doTheTest()
    }

    finishTest() {
        this.startbutton.innerText = 'PROCESSING... '
        this.startbutton.onclick = () => this.displayStart()
    }

    async blobToAudioBuffer(audioContext, blob) {
        const arrayBuffer = await blob.arrayBuffer()
        return await audioContext.decodeAudioData(arrayBuffer)
    }

    workerMessageHanlder(message){
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
            maxLag: (0.600 * this.audioContext.sampleRate),
            channel: 0
        })
        URL.revokeObjectURL(recordedAudio)
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
            if(!reliable){
                this.onError && this.onError('The Latency Test did not go well, there could be an issue with the audio settings')
            }
            this.startbutton.innerText = 'TEST AGAIN '
            this.onResult && this.onResult({latency, ratio, reliable})
        } else{
            console.log('Channel', peak.channel )
            const roundtriplatency = peak.peakIndex / mlssignal.sampleRate * 1000
            console.log('Latency = ', roundtriplatency + ' ms')
            const ratioIs = 10 * Math.log10(peak.peakValuePow / peak.mean)
            console.log('Corr Ratio', ratioIs)
        }      
    }
}