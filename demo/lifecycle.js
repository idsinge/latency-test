;(function () {
    'use strict'

    const tester = document.getElementById('lifecycle-tester')
    const startBtn = document.getElementById('lifecycle-start')
    const stopBtn = document.getElementById('lifecycle-stop')
    const clearBtn = document.getElementById('lifecycle-clear')
    const logEl = document.getElementById('lifecycle-log')

    const EVENTS = ['latency-start', 'latency-recording', 'latency-processing', 'latency-result', 'latency-error', 'latency-complete']

    EVENTS.forEach(name => {
        tester.addEventListener(name, e => {
            const time = new Date().toLocaleTimeString()
            const detail = e.detail && Object.keys(e.detail).length > 0 ? JSON.stringify(e.detail) : '{}'
            let cls = 'info'
            if (name === 'latency-result') cls = 'result'
            else if (name === 'latency-error') cls = 'error'
            const line = document.createElement('div')
            line.className = cls
            line.textContent = `[${time}] ${name} ${detail}`
            logEl.appendChild(line)
            logEl.scrollTop = logEl.scrollHeight
        })
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
        await window.startTest(tester)
    })
    stopBtn.addEventListener('click', () => tester.stop())
    clearBtn.addEventListener('click', () => {
        logEl.innerHTML = '<div class="info">// Event log ready</div>'
    })
})()
