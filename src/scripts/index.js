import './latency-test-element.js'

const tester = document.getElementById('tester')
const btn = document.getElementById('start-btn')
const results = document.getElementById('results')
const aggregate = document.getElementById('aggregate')
const runCount = document.getElementById('run-count')
const modeSelect = document.getElementById('mode-select')

modeSelect.addEventListener('change', () => {
    tester.recordingMode = modeSelect.value
})

tester.addEventListener('latency-start', () => {
    btn.textContent = 'TAP TO START'
    btn.disabled = false
})
tester.addEventListener('latency-recording', () => {
    btn.textContent = 'RECORDING...'
    btn.disabled = true
})
tester.addEventListener('latency-processing', () => { 
    btn.textContent = 'PROCESSING...' })

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