import './latency-test-element.js'

const tester = document.getElementById('tester')
const btn = document.getElementById('start-btn')
const results = document.getElementById('results')

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

tester.addEventListener('latency-complete', () => {
    btn.textContent = 'TEST AGAIN'
    btn.disabled = false
})

tester.addEventListener('latency-error', (e) => {
    results.textContent = `Error: ${e.detail.message}`
    btn.textContent = 'TEST LATENCY'
    btn.disabled = false
})
btn.onclick = () => {
    btn.disabled = true
    tester.start()
}