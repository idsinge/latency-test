;(function () {
    'use strict'

    const tester = document.getElementById('minimal-tester')
    const startBtn = document.getElementById('minimal-start')
    const stopBtn = document.getElementById('minimal-stop')
    const resultBox = document.getElementById('minimal-result')
    const detailEl = document.getElementById('minimal-detail')

    tester.addEventListener('latency-recording', () => {
        startBtn.disabled = true
        stopBtn.disabled = false
        detailEl.textContent = 'Recording…'
    })
    tester.addEventListener('latency-processing', () => {
        detailEl.textContent = 'Processing…'
    })
    tester.addEventListener('latency-result', e => {
        resultBox.querySelector('.latency').textContent = `${e.detail.latency.toFixed(2)} ms`
        detailEl.innerHTML = `Ratio: ${e.detail.ratio.toFixed(2)} dB · ${e.detail.reliable ? '✅ Reliable' : '⚠️ Unreliable'}`
    })
    tester.addEventListener('latency-complete', () => {
        startBtn.disabled = false
        stopBtn.disabled = true
    })
    tester.addEventListener('latency-error', e => {
        startBtn.disabled = false
        stopBtn.disabled = true
        detailEl.style.color = '#c62828'
        detailEl.textContent = `Error: ${e.detail.message}`
    })

    startBtn.addEventListener('click', async () => {
        detailEl.textContent = 'Starting…'
        stopBtn.disabled = false
        await window.startTest(tester)
    })

    stopBtn.addEventListener('click', () => {
        tester.stop()
        startBtn.disabled = false
        stopBtn.disabled = true
        detailEl.textContent = 'Stopped by user'
    })
})()
