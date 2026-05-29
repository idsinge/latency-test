;(function () {
    'use strict'

    // ── Audio session setup ──
    const MIC_CONSTRAINTS = {
        audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
            latency: 0,
            channelCount: 1
        }
    }

    const connectBtn = document.getElementById('connect-btn')
    const connectStatus = document.getElementById('connect-status')
    const demoSection = document.getElementById('demo-section')

    connectBtn.addEventListener('click', async () => {
        connectBtn.disabled = true
        connectStatus.textContent = 'Requesting mic access…'
        try {
            const stream = await navigator.mediaDevices.getUserMedia(MIC_CONSTRAINTS)
            const ac = new AudioContext({ latencyHint: 0 })
            document.querySelectorAll('latency-test').forEach(el => {
                el.inputStream = stream
                el.audioContext = ac
            })
            document.getElementById('connect-section').style.display = 'none'
            demoSection.removeAttribute('hidden')
        } catch (e) {
            connectStatus.textContent = `Could not access mic: ${e.message}`
            connectBtn.disabled = false
        }
    })

    // ── Tab system ──
    const tablist = document.querySelector('.tablist')
    const tabs = Array.from(tablist.querySelectorAll('[role="tab"]'))
    const panels = {}

    tabs.forEach(tab => {
        panels[tab.id] = document.getElementById(tab.getAttribute('aria-controls'))
    })

    function activateTab(tab) {
        tabs.forEach(t => {
            t.setAttribute('aria-selected', 'false')
            t.setAttribute('tabindex', '-1')
        })
        tab.setAttribute('aria-selected', 'true')
        tab.setAttribute('tabindex', '0')
        Object.entries(panels).forEach(([id, panel]) => {
            const hidden = id !== tab.id
            panel.setAttribute('aria-hidden', String(hidden))
            if (hidden) {
                panel.setAttribute('hidden', '')
            } else {
                panel.removeAttribute('hidden')
            }
        })
        tab.focus()
    }

    tablist.addEventListener('click', e => {
        const tab = e.target.closest('[role="tab"]')
        if (tab) activateTab(tab)
    })

    tablist.addEventListener('keydown', e => {
        const idx = tabs.indexOf(document.activeElement)
        if (idx === -1) return
        let next
        if (e.key === 'ArrowRight') {
            e.preventDefault(); next = (idx + 1) % tabs.length
        } else if (e.key === 'ArrowLeft') {
            e.preventDefault(); next = (idx - 1 + tabs.length) % tabs.length
        } else if (e.key === 'Home') {
            e.preventDefault(); next = 0
        } else if (e.key === 'End') {
            e.preventDefault(); next = tabs.length - 1
        }
        if (next !== undefined) activateTab(tabs[next])
    })

    // ── Activity indicator ──
    const activityDot = document.getElementById('activity-indicator')
    let activeTestCount = 0

    function updateActivity() {
        activityDot.className = activeTestCount > 0 ? 'activity-busy' : 'activity-idle'
    }

    document.querySelectorAll('latency-test').forEach(el => {
        el.addEventListener('latency-recording', () => { activeTestCount++; updateActivity() })
        el.addEventListener('latency-complete', () => { activeTestCount = Math.max(0, activeTestCount - 1); updateActivity() })
        el.addEventListener('latency-error', () => { activeTestCount = Math.max(0, activeTestCount - 1); updateActivity() })
    })

    // ── Start test and wait for completion ──
    function startTest(tester) {
        return new Promise((resolve) => {
            const onDone = () => { cleanup(); resolve(true) }
            const onError = () => { cleanup(); resolve(false) }
            const cleanup = () => {
                tester.removeEventListener('latency-complete', onDone)
                tester.removeEventListener('latency-error', onError)
            }
            tester.addEventListener('latency-complete', onDone, { once: true })
            tester.addEventListener('latency-error', onError, { once: true })
            tester.start()
        })
    }

    window.startTest = startTest

    // ── Result formatter ──
    function resultHTML(latency, ratio, reliable) {
        const rel = reliable ? '<span class="reliable">✅ Reliable</span>' : '<span class="unreliable">⚠️ Unreliable</span>'
        return `<div class="latency">${latency.toFixed(2)} ms</div><div class="detail">Ratio: ${ratio.toFixed(2)} dB · ${rel}</div>`
    }

    window.resultHTML = resultHTML
})()
