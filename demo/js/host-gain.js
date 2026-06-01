;(function () {
    'use strict'

    const tester = document.getElementById('gain-tester')
    const startBtn = document.getElementById('gain-start')
    const stopBtn = document.getElementById('gain-stop')
    const gainInput = document.getElementById('gain-value')
    const resultEl = document.getElementById('gain-result')

    let source = null
    let splitter = null
    let gainNode = null
    let dest = null
    let rawStream = null

    function clampGain(value) {
        const n = Number.parseFloat(value)
        if (!Number.isFinite(n)) return 1
        return Math.max(0, Math.min(200, n))
    }

    function buildGainChain(stream, ac) {
        rawStream = stream
        if (gainNode) return
        try {
            source = ac.createMediaStreamSource(stream)
            splitter = ac.createChannelSplitter(2)
            gainNode = ac.createGain()
            gainNode.gain.value = clampGain(gainInput.value)
            dest = ac.createMediaStreamDestination()
            dest.channelCount = 1
            source.connect(splitter)
            splitter.connect(gainNode, 0)
            gainNode.connect(dest)
            tester.inputStream = dest.stream
        } catch (e) {
            gainNode = null
            resultEl.innerHTML = '<div class="detail"><span class="unreliable">⚠️ Gain chain failed: ' + e.message + '</span></div>'
            startBtn.disabled = true
        }
    }

    // Fallback: session may already be established if this script loaded late
    if (window.demoAudioSession) {
        buildGainChain(window.demoAudioSession.stream, window.demoAudioSession.ac)
    }

    document.addEventListener('latency-demo-session-ready', (e) => {
        buildGainChain(e.detail.stream, e.detail.ac)
    })

    gainInput.addEventListener('input', () => {
        if (gainNode) gainNode.gain.value = clampGain(gainInput.value)
    })

    document.getElementById('gain-chain-toggle').addEventListener('change', (e) => {
        gainInput.disabled = !e.target.checked
        if (dest) tester.inputStream = e.target.checked ? dest.stream : rawStream
    })

    tester.addEventListener('latency-result', e => {
        const { latency, ratio, reliable } = e.detail
        resultEl.innerHTML = window.resultHTML(latency, ratio, reliable)
    })

    tester.addEventListener('latency-recording', () => {
        startBtn.disabled = true
        stopBtn.disabled = false
    })

    tester.addEventListener('latency-complete', () => {
        startBtn.disabled = false
        stopBtn.disabled = true
    })

    tester.addEventListener('latency-error', () => {
        startBtn.disabled = false
        stopBtn.disabled = true
    })

    startBtn.addEventListener('click', async () => {
        startBtn.disabled = true
        await window.startTest(tester)
    })

    stopBtn.addEventListener('click', () => tester.stop())
})()
