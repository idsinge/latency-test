;(function () {
    'use strict'

    const tester = document.getElementById('multi-tester')
    const startBtn = document.getElementById('multi-start')
    const stopBtn = document.getElementById('multi-stop')
    const countInput = document.getElementById('multi-count')
    const currentBox = document.getElementById('multi-current')
    const currentLatency = document.getElementById('multi-current-latency')
    const currentDetail = document.getElementById('multi-current-detail')
    const aggregateBox = document.getElementById('multi-aggregate')
    const meanEl = document.getElementById('multi-mean')
    const statsEl = document.getElementById('multi-stats')

    let runNum = 0

    tester.addEventListener('latency-recording', () => {
        startBtn.disabled = true
        stopBtn.disabled = false
        currentBox.style.display = 'block'
        currentDetail.textContent = 'Recording…'
    })
    tester.addEventListener('latency-processing', () => {
        currentDetail.textContent = 'Processing…'
    })
    tester.addEventListener('latency-result', e => {
        runNum++
        currentLatency.textContent = `${e.detail.latency.toFixed(2)} ms`
        currentDetail.textContent = `Run ${runNum} · Ratio: ${e.detail.ratio.toFixed(2)} dB · ${e.detail.reliable ? '✅' : '⚠️'}`
    })
    tester.addEventListener('latency-complete', e => {
        startBtn.disabled = false
        stopBtn.disabled = true
        if (e.detail.results.length > 0) {
            aggregateBox.style.display = 'block'
            meanEl.textContent = `Mean: ${e.detail.mean.toFixed(2)} ms (${e.detail.results.length} runs)`
            statsEl.textContent = `SD (Standard Deviation): ${e.detail.std.toFixed(2)} · Min: ${e.detail.min.toFixed(2)} · Max: ${e.detail.max.toFixed(2)}${e.detail.aborted ? ' ⚠️ Aborted' : ''}`
        }
    })
    tester.addEventListener('latency-error', e => {
        startBtn.disabled = false
        stopBtn.disabled = true
        currentDetail.style.color = '#c62828'
        currentDetail.textContent = e.detail.message
    })

    startBtn.addEventListener('click', async () => {
        startBtn.disabled = true
        runNum = 0
        aggregateBox.style.display = 'none'
        currentBox.style.display = 'none'
        tester.numberOfTests = countInput.value
        await window.startTest(tester)
    })

    stopBtn.addEventListener('click', () => {
        tester.stop()
        startBtn.disabled = false
        stopBtn.disabled = true
    })
})()
