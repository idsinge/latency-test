import { TestLatencyMLS } from './test.js'

const TEST_LAT_MLS_BTN_ID = 'testlatencymlsbtn'

const constraints = {
    audio: {
        echoCancellation: false,
        noiseSuppression: false, 
        autoGainControl: false, 
        latency: 0, 
        channelCount: 1
    }
}

let button = null

const onReady = () => {
    button.innerText = 'TEST LATENCY'
    button.disabled = false
    button.onclick = () => controller.onAudioSetupFinished()
}

const onRecording = () => {
    button.innerText = 'RECORDING...'
    button.disabled = true
}

const onProcessing = () => {
    button.innerText = 'PROCESSING...'
    button.disabled = true
}

const onResult = ({latency, ratio, reliable}) => {
    button.innerText = 'TEST AGAIN'
    button.disabled = false
    button.onclick = () => controller.displayStart()
    button.innerHTML += `<span class='badge badge-info'>lat: ${latency.toFixed(2)} ms.</span><br>`
    button.innerHTML += `<span class='badge badge-light'>ratio: ${ratio.toFixed(2)} dB</span>`
}

const onError = (message) => {
    console.error(message)
}

let controller = null

const main = async () => {
    try {
        button = document.getElementById(TEST_LAT_MLS_BTN_ID)
        const stream = await navigator.mediaDevices.getUserMedia(constraints)
        const ac = new AudioContext({ latencyHint: 0 })
        controller = new TestLatencyMLS()
        controller.initialize(ac, stream, {
            onReady,
            onRecording,
            onProcessing,
            onResult,
            onError
        })
    } catch (error) {
        console.error('Error accessing audio stream:', error)
    }
}

main()