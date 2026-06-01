import '../scripts/latency-test-element.js'

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
const gainInput = document.getElementById('gain-value')

let source = null
let splitter = null
let gainNode = null
let dest = null
let stream = null

function clampGain(value) {
    const n = Number.parseFloat(value)
    if (!Number.isFinite(n)) return 1
    return Math.max(0, Math.min(200, n))
}

// --- Audio session setup ---

connectBtn.addEventListener('click', async () => {
    connectBtn.disabled = true
    connectStatus.textContent = 'Requesting mic access...'
    try {
        stream = await navigator.mediaDevices.getUserMedia(MIC_CONSTRAINTS)
        const ac = new AudioContext({ latencyHint: 0 })

        // Host-controlled gain chain: routes the left channel (output 0) through a
        // GainNode before passing the processed stream to the component.
        // For mono inputs, output 0 carries the full signal.
        // For stereo inputs (e.g. wired earpods on Safari which force stereo with
        // signal only on the left), this isolates the useful channel before applying gain.
        // Empirical value: 50 for Safari >= 16 with echoCancellation: false.
        source = ac.createMediaStreamSource(stream)
        splitter = ac.createChannelSplitter(2)
        gainNode = ac.createGain()
        gainNode.gain.value = clampGain(gainInput.value)
        dest = ac.createMediaStreamDestination()
        dest.channelCount = 1
        source.connect(splitter)
        splitter.connect(gainNode, 0)
        gainNode.connect(dest)

        tester.audioContext = ac
        tester.inputStream = dest.stream
        connectSection.style.display = 'none'
        testSection.style.display = 'block'
    } catch (e) {
        connectStatus.textContent = `Could not access mic: ${e.message}`
        connectBtn.disabled = false
    }
})

gainInput.addEventListener('input', () => {
    if (gainNode) gainNode.gain.value = clampGain(gainInput.value)
})

document.getElementById('gain-chain').addEventListener('change', (e) => {
    gainInput.disabled = !e.target.checked
    if (dest) tester.inputStream = e.target.checked ? dest.stream : stream
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
