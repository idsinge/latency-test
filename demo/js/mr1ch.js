;(function () {
    'use strict'

    const tester = document.getElementById('mr1ch-tester')
    const startBtn = document.getElementById('mr1ch-start')
    const stopBtn = document.getElementById('mr1ch-stop')
    const countInput = document.getElementById('mr1ch-count')
    const currentBox = document.getElementById('mr1ch-current')
    const currentLatency = document.getElementById('mr1ch-current-latency')
    const currentDetail = document.getElementById('mr1ch-current-detail')
    const aggregateBox = document.getElementById('mr1ch-aggregate')
    const meanEl = document.getElementById('mr1ch-mean')
    const statsEl = document.getElementById('mr1ch-stats')

    let runNum = 0

    tester.addEventListener('latency-recording', () => {
        startBtn.disabled = true
        stopBtn.disabled = false
        currentBox.style.display = 'block'
        currentDetail.style.color = ''
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
        currentBox.style.display = 'block'
        currentDetail.style.color = '#c62828'
        currentDetail.textContent = e.detail.message
    })

    startBtn.addEventListener('click', async () => {
        startBtn.disabled = true
        runNum = 0
        aggregateBox.style.display = 'none'
        currentBox.style.display = 'none'
        currentLatency.textContent = ''
        tester.numberOfTests = countInput.value
        await window.startTest(tester)
    })

    stopBtn.addEventListener('click', () => {
        tester.stop()
        startBtn.disabled = false
        stopBtn.disabled = true
    })
})()
