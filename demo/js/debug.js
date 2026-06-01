;(function () {
    'use strict'

    const tester = document.getElementById('debug-tester')
    const startBtn = document.getElementById('debug-start')
    const stopBtn = document.getElementById('debug-stop')
    const toggleCheckbox = document.getElementById('debug-toggle')
    const consoleEl = document.getElementById('debug-console')
    const resultEl = document.getElementById('debug-result')

    // Intercept console.debug to capture [latency-test] lines into the on-page log.
    // Always forwards to the original so other console output is unaffected.
    const _origDebug = console.debug.bind(console)
    console.debug = function (...args) {
        _origDebug(...args)
        if (typeof args[0] === 'string' && args[0].startsWith('[latency-test]')) {
            const line = args.map(a => (a !== null && typeof a === 'object') ? JSON.stringify(a) : String(a)).join(' ')
            const div = document.createElement('div')
            div.className = 'info'
            div.textContent = line
            consoleEl.appendChild(div)
            consoleEl.scrollTop = consoleEl.scrollHeight
        }
    }

    toggleCheckbox.checked = tester.debug
    toggleCheckbox.addEventListener('change', () => {
        tester.debug = toggleCheckbox.checked
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
        consoleEl.innerHTML = '<div class="info">// Debug log</div>'
        await window.startTest(tester)
    })

    stopBtn.addEventListener('click', () => tester.stop())
})()
