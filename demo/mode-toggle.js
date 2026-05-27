;(function () {
    'use strict'

    const mrTester = document.getElementById('mode-mr')
    const awTester = document.getElementById('mode-aw')
    const compareBtn = document.getElementById('mode-compare')
    const mrResultBox = document.getElementById('mode-mr-result')
    const awResultBox = document.getElementById('mode-aw-result')
    const compareResultBox = document.getElementById('mode-compare-result')

    let stream = null
    let ac = null
    let results = {}

    mrTester.addEventListener('latency-result', e => {
        results.mr = e.detail
        mrResultBox.innerHTML = window.resultHTML(e.detail.latency, e.detail.ratio, e.detail.reliable)
    })
    awTester.addEventListener('latency-result', e => {
        results.aw = e.detail
        awResultBox.innerHTML = window.resultHTML(e.detail.latency, e.detail.ratio, e.detail.reliable)
    })

    function checkBothDone() {
        if (results.mr && results.aw) {
            const diff = Math.abs(results.mr.latency - results.aw.latency)
            compareResultBox.style.display = 'block'
            compareResultBox.innerHTML = `
                <div class="stat">Difference: <strong>${diff.toFixed(2)} ms</strong></div>
                <div class="detail">MediaRecorder: ${results.mr.latency.toFixed(2)} ms vs AudioWorklet: ${results.aw.latency.toFixed(2)} ms</div>
            `
            compareBtn.disabled = false
        }
    }

    mrTester.addEventListener('latency-complete', checkBothDone)
    awTester.addEventListener('latency-complete', checkBothDone)

    mrTester.addEventListener('latency-error', e => {
        mrResultBox.querySelector('.detail').style.color = '#c62828'
        mrResultBox.querySelector('.detail').textContent = e.detail.message
        compareBtn.disabled = false
    })
    awTester.addEventListener('latency-error', e => {
        awResultBox.querySelector('.detail').style.color = '#c62828'
        awResultBox.querySelector('.detail').textContent = e.detail.message
        compareBtn.disabled = false
    })

    // Chain: MR test completes → AW test starts (share AudioContext)
    mrTester.addEventListener('latency-complete', () => {
        if (results.aw !== undefined || !results.mr) return
        window.startTest(awTester)
    })

    compareBtn.addEventListener('click', async () => {
        compareBtn.disabled = true
        ac?.close()
        stream?.getTracks().forEach(t => t.stop())
        results = {}
        compareResultBox.style.display = 'none'
        mrResultBox.innerHTML = '<div class="detail">Running MR…</div>'
        awResultBox.innerHTML = '<div class="detail">Waiting for MR…</div>'

        try {
            ac = new AudioContext({ latencyHint: 0 })
            stream = await navigator.mediaDevices.getUserMedia({
                audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 }
            })
            mrTester.audioContext = ac
            mrTester.inputStream = stream
            awTester.audioContext = ac
            awTester.inputStream = stream
            compareBtn.disabled = false
            await window.startTest(mrTester)
        } catch (err) {
            mrResultBox.querySelector('.detail').style.color = '#c62828'
            mrResultBox.querySelector('.detail').textContent = err.message
            compareBtn.disabled = false
        }
    })
})()
