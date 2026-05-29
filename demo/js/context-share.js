;(function () {
    'use strict'

    const tester = document.getElementById('context-tester')
    const initBtn = document.getElementById('context-init')
    const stopBtn = document.getElementById('context-stop')
    const statusEl = document.getElementById('context-status')
    const resultBox = document.getElementById('context-result')
    const latencyEl = document.getElementById('context-latency')
    const detailEl = document.getElementById('context-detail')

    tester.addEventListener('latency-start', () => {
        initBtn.disabled = true
        stopBtn.disabled = false
        statusEl.querySelector('.detail').textContent = 'Test running…'
    })
    tester.addEventListener('latency-recording', () => {
        statusEl.querySelector('.detail').textContent = 'Recording…'
    })
    tester.addEventListener('latency-processing', () => {
        statusEl.querySelector('.detail').textContent = 'Processing…'
    })
    tester.addEventListener('latency-result', e => {
        resultBox.style.display = 'block'
        latencyEl.textContent = `${e.detail.latency.toFixed(2)} ms`
        detailEl.textContent = `Ratio: ${e.detail.ratio.toFixed(2)} dB · ${e.detail.reliable ? '✅ Reliable' : '⚠️ Unreliable'}`
    })
    tester.addEventListener('latency-complete', () => {
        initBtn.disabled = false
        stopBtn.disabled = true
        statusEl.querySelector('.detail').textContent = 'Done — host AudioContext and stream were used.'
    })
    tester.addEventListener('latency-error', e => {
        initBtn.disabled = false
        stopBtn.disabled = true
        statusEl.querySelector('.detail').textContent = `Error: ${e.detail.message}`
    })

    initBtn.addEventListener('click', async () => {
        initBtn.disabled = true
        stopBtn.disabled = false
        resultBox.style.display = 'none'
        statusEl.querySelector('.detail').textContent = 'Starting test with host-provided resources…'
        await window.startTest(tester)
        initBtn.disabled = false
    })

    stopBtn.addEventListener('click', () => {
        tester.stop()
        initBtn.disabled = false
        stopBtn.disabled = true
    })
})()
