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
        let ac
        try {
            ac = new AudioContext({ latencyHint: 0 })
            const stream = await navigator.mediaDevices.getUserMedia(MIC_CONSTRAINTS)
            document.querySelectorAll('latency-test').forEach(el => {
                el.inputStream = stream
                el.audioContext = ac
            })
            document.getElementById('connect-section').style.display = 'none'
            demoSection.removeAttribute('hidden')
            globalThis.demoAudioSession = { stream, ac }
            populateAudioInfo(ac, stream)
            document.dispatchEvent(new CustomEvent('latency-demo-session-ready', { detail: { stream, ac } }))
        } catch (e) {
            if (ac) ac.close()
            connectStatus.textContent = `Could not access mic: ${e.message}`
            connectBtn.disabled = false
        }
    })

    // ── Card grid toggle ──
    const cardGrid = document.getElementById('card-grid')
    const cards = Array.from(cardGrid.querySelectorAll('.demo-card'))

    cardGrid.addEventListener('click', e => {
        const card = e.target.closest('.demo-card')
        if (!card) return
        const panelId = card.dataset.panel
        const panel = document.getElementById(panelId)
        const isOpen = card.getAttribute('aria-expanded') === 'true'

        cards.forEach(c => {
            c.setAttribute('aria-expanded', 'false')
            c.classList.remove('is-active')
        })
        document.querySelectorAll('.demo-panel').forEach(p => p.setAttribute('hidden', ''))

        if (!isOpen) {
            card.setAttribute('aria-expanded', 'true')
            card.classList.add('is-active')
            panel.removeAttribute('hidden')
            panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
        }
    })

    // ── Audio info table ──
    function acRows(ac) {
        return [
            ['AudioContext · sampleRate', ac.sampleRate + ' Hz'],
            ['AudioContext · baseLatency', ac.baseLatency == null ? 'n/a' : ac.baseLatency.toFixed(4) + ' s'],
            ['AudioContext · outputLatency', ac.outputLatency == null ? 'n/a' : ac.outputLatency.toFixed(4) + ' s'],
            ['AudioContext · state', ac.state],
            ['AudioContext · destination.channelCount', String(ac.destination.channelCount)],
            ['AudioContext · destination.maxChannelCount', String(ac.destination.maxChannelCount)],
            ['AudioContext · audioWorklet', String(!!ac.audioWorklet)]
        ]
    }

    function settingsRows(settings) {
        const keys = ['channelCount', 'sampleRate', 'echoCancellation', 'noiseSuppression', 'autoGainControl', 'latency', 'label', 'deviceId', 'groupId']
        return keys
            .filter(k => k in settings)
            .map(k => {
                let v = String(settings[k])
                if (k === 'deviceId' || k === 'groupId') v = v.slice(0, 8) + '…'
                return [`track.getSettings() · ${k}`, v]
            })
    }

    function constraintsRows(constraints) {
        const entries = Object.entries(constraints)
        if (entries.length === 0) return [['track.getConstraints()', '(none)']]
        return entries.map(([k, v]) => [`track.getConstraints() · ${k}`, String(v)])
    }

    function capabilitiesRows(capabilities) {
        if (!capabilities) return [['track.getCapabilities()', '(unavailable)']]
        const keys = ['channelCount', 'sampleRate', 'echoCancellation', 'noiseSuppression', 'autoGainControl', 'latency']
        return keys
            .filter(k => k in capabilities)
            .map(k => {
                const v = capabilities[k]
                return [`track.getCapabilities() · ${k}`, typeof v === 'object' ? JSON.stringify(v) : String(v)]
            })
    }

    function trackRows(track) {
        return [
            ['track · kind', track.kind],
            ['track · readyState', track.readyState],
            ['track · enabled', String(track.enabled)],
            ['track · muted', String(track.muted)],
            ['track · contentHint', track.contentHint || '(none)'],
            ['track · id', track.id.slice(0, 8) + '…']
        ]
    }

    function streamRows(stream) {
        return [
            ['stream · active', String(stream.active)],
            ['stream · audio tracks', String(stream.getAudioTracks().length)]
        ]
    }

    function featureRows() {
        const sc = navigator.mediaDevices.getSupportedConstraints()
        const names = Object.keys(sc).filter(k => sc[k]).join(', ')
        return [
            ['feature · MediaRecorder', String(typeof MediaRecorder !== 'undefined')],
            ['feature · isSecureContext', String(isSecureContext)],
            ['getSupportedConstraints()', names || '(none)']
        ]
    }

    function browserRows() {
        return [
            ['browser · platform', String((navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform)],
            ['browser · userAgent', navigator.userAgent]
        ]
    }

    function populateAudioInfo(ac, stream) {
        const track = stream.getAudioTracks()[0]
        let capabilities = null
        if (typeof track.getCapabilities === 'function') {
            capabilities = track.getCapabilities()
        }

        const trackRate = track.getSettings().sampleRate ?? null
        const acRate = ac.sampleRate
        let rateValue
        if (trackRate === null) {
            rateValue = `⚠️ AC: ${acRate} Hz / track: unknown`
        } else if (trackRate === acRate) {
            rateValue = `✅ ${acRate} Hz`
        } else {
            rateValue = `⚠️ AC: ${acRate} Hz / track: ${trackRate} Hz`
        }
        const rateMatch = ['diagnostic · sampleRate match', rateValue]

        const rows = [
            rateMatch,
            ...acRows(ac),
            ...settingsRows(track.getSettings()),
            ...constraintsRows(track.getConstraints()),
            ...capabilitiesRows(capabilities),
            ...trackRows(track),
            ...streamRows(stream),
            ...featureRows(),
            ...browserRows()
        ]

        const tbody = document.querySelector('#audio-info tbody')
        rows.forEach(([label, value]) => {
            const tr = document.createElement('tr')
            const th = document.createElement('th')
            th.scope = 'row'
            th.textContent = label
            const td = document.createElement('td')
            const code = document.createElement('code')
            code.textContent = value
            td.appendChild(code)
            tr.appendChild(th)
            tr.appendChild(td)
            tbody.appendChild(tr)
        })

        document.getElementById('audio-info').removeAttribute('hidden')
    }

    // ── Activity indicator ──
    const activityDot = document.getElementById('activity-indicator')
    const activeTesters = new Set()

    function updateActivity() {
        activityDot.className = activeTesters.size > 0 ? 'activity-busy' : 'activity-idle'
    }

    document.querySelectorAll('latency-test').forEach(el => {
        el.addEventListener('latency-start', () => { activeTesters.add(el); updateActivity() })
        el.addEventListener('latency-complete', () => { activeTesters.delete(el); updateActivity() })
        el.addEventListener('latency-error', () => { activeTesters.delete(el); updateActivity() })
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

    globalThis.startTest = startTest

    // ── Result formatter ──
    function resultHTML(latency, ratio, reliable) {
        const rel = reliable ? '<span class="reliable">✅ Reliable</span>' : '<span class="unreliable">⚠️ Unreliable</span>'
        return `<div class="latency">${latency.toFixed(2)} ms</div><div class="detail">Ratio: ${ratio.toFixed(2)} dB · ${rel}</div>`
    }

    globalThis.resultHTML = resultHTML
})()
