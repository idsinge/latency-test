;(function () {
    'use strict'

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
        el.addEventListener('latency-complete', () => { activeTestCount--; updateActivity() })
        el.addEventListener('latency-error', () => { activeTestCount--; updateActivity() })
    })

    // ── Warmup-aware start ──
    async function startTest(tester) {
        let recordingSeen = false
        let errorSeen = false
        let done = false

        const onRecording = () => { recordingSeen = true }
        const onError = () => { errorSeen = true }

        const cleanup = () => {
            done = true
            tester.removeEventListener('latency-recording', onRecording)
            tester.removeEventListener('latency-error', onError)
        }

        return new Promise((resolve) => {
            function attempt() {
                recordingSeen = false
                errorSeen = false

                tester.addEventListener('latency-recording', onRecording, { once: true })
                tester.addEventListener('latency-error', onError, { once: true })

                tester.addEventListener('latency-start', function onStart() {
                    setTimeout(() => {
                        if (done) return
                        if (errorSeen) { cleanup(); resolve(false); return }
                        if (!recordingSeen) {
                            attempt()
                        } else {
                            cleanup()
                            resolve(true)
                        }
                    }, 300)
                }, { once: true })

                tester.start()
            }

            attempt()
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
