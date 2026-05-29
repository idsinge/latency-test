import './latency-test-element.js'

const MIC_CONSTRAINTS = {
    audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        latency: 0,
        channelCount: 1
    }
}

const tester = document.getElementById('tester')
const connectSection = document.getElementById('connect-section')
const connectBtn = document.getElementById('connect-btn')
const connectStatus = document.getElementById('connect-status')
const testSection = document.getElementById('test-section')
const btn = document.getElementById('start-btn')
const results = document.getElementById('results')
const aggregate = document.getElementById('aggregate')
const runCount = document.getElementById('run-count')

// --- Audio session setup ---

connectBtn.addEventListener('click', async () => {
    connectBtn.disabled = true
    connectStatus.textContent = 'Requesting mic access...'
    try {
        const stream = await navigator.mediaDevices.getUserMedia(MIC_CONSTRAINTS)
        const ac = new AudioContext({ latencyHint: 0 })
        tester.inputStream = stream
        tester.audioContext = ac
        connectSection.style.display = 'none'
        testSection.style.display = 'block'
    } catch (e) {
        connectStatus.textContent = `Could not access mic: ${e.message}`
        connectBtn.disabled = false
    }
})

// --- Measurement ---

tester.addEventListener('latency-start', () => {
    btn.textContent = 'STARTING...'
    btn.disabled = true
})
tester.addEventListener('latency-recording', () => {
    btn.textContent = 'RECORDING...'
    btn.disabled = true
})
tester.addEventListener('latency-processing', () => {
    btn.textContent = 'PROCESSING...'
})
tester.addEventListener('latency-result', (e) => {
    const { latency, ratio, reliable } = e.detail
    results.innerHTML = `Latency: ${latency.toFixed(2)} ms | Ratio: ${ratio.toFixed(2)} dB | ${reliable ? '✅' : '⚠️ Unreliable'}`
})
tester.addEventListener('latency-complete', (e) => {
    const d = e.detail
    btn.textContent = 'TEST AGAIN'
    btn.disabled = false
    if (d.results.length > 0) {
        aggregate.style.display = 'block'
        aggregate.innerHTML = `Mean: ${d.mean.toFixed(2)} ms (SD: ${d.std.toFixed(2)}) | Min: ${d.min.toFixed(2)} | Max: ${d.max.toFixed(2)}${d.aborted ? ' ⚠️ (aborted)' : ''}`
    } else {
        aggregate.style.display = 'none'
    }
})
tester.addEventListener('latency-error', (e) => {
    results.textContent = `Error: ${e.detail.message}`
    btn.textContent = 'TEST LATENCY'
    btn.disabled = false
})

btn.onclick = () => {
    btn.disabled = true
    aggregate.style.display = 'none'
    aggregate.innerHTML = ''
    tester.numberOfTests = runCount.value
    tester.start()
}
