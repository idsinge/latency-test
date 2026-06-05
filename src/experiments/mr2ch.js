import { generateMLS } from '../scripts/mls.js'

const DEBUG = true

function debug(...args) {
    if (DEBUG) console.debug('[mr2ch]', performance.now().toFixed(2), ...args)
}

const MIC_CONSTRAINTS = {
    audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        latency: 0,
        channelCount: 1
    }
}

const mlsBits = 15
const mls = generateMLS(mlsBits)
const worker = new Worker(new URL('../scripts/worker.js', import.meta.url), { type: 'module' })

const connectBtn = document.getElementById('connect-btn')
const status = document.getElementById('status')
const testSection = document.getElementById('test-section')
const runCountInput = document.getElementById('run-count')
const runBtn = document.getElementById('run-btn')
const results = document.getElementById('results')
const aggregate = document.getElementById('aggregate')

let inputStream = null
let ac = null
let noiseBuffer = null

connectBtn.addEventListener('click', async () => {
    connectBtn.disabled = true
    status.textContent = 'Requesting microphone access...'

    try {
        inputStream = await navigator.mediaDevices.getUserMedia(MIC_CONSTRAINTS)
        ac = new AudioContext({ latencyHint: 0 })
        noiseBuffer = createNoiseBuffer(ac)
        debug('AudioContext created', { sampleRate: ac.sampleRate, state: ac.state })
        status.textContent = `Connected — sample rate: ${ac.sampleRate} Hz`
        testSection.hidden = false
    } catch (error) {
        status.textContent = `Could not connect audio: ${error.message}`
        connectBtn.disabled = false
    }
})

runBtn.addEventListener('click', async () => {
    const runCount = clampRunCount(runCountInput.value)
    runCountInput.value = runCount
    runBtn.disabled = true
    results.textContent = ''
    aggregate.textContent = ''

    const runResults = []

    for (let i = 1; i <= runCount; i++) {
        const line = appendRunLine(i, 'Recording...')
        const result = await runExperimentOnce()
        runResults.push(result)
        renderRunLine(line, i, result)
    }

    renderAggregate(runResults)
    runBtn.disabled = false
})

function createNoiseBuffer(audioContext) {
    const buffer = audioContext.createBuffer(1, mls.length, audioContext.sampleRate)
    const data = buffer.getChannelData(0)

    for (let i = 0; i < mls.length; i++) {
        data[i] = mls[i] === 1 ? 1.0 : -1.0
    }

    return buffer
}

async function runExperimentOnce() {
    const acState = ac ? ac.state : 'unknown'
    debug('run start', { acState })

    let noiseSource = null
    let micSource = null
    let merger = null
    let destNode = null

    try {
        if (!inputStream || !ac || !noiseBuffer) {
            throw new Error('Audio is not connected')
        }

        if (typeof MediaRecorder === 'undefined') {
            throw new Error('MediaRecorder is not supported in this browser')
        }

        if (ac.state !== 'running') {
            return { ok: false, error: `AudioContext is not running (state: ${ac.state}) — reconnect audio`, acState }
        }

        startSilenceKeepalive()
        debug('silence keepalive started')

        noiseSource = ac.createBufferSource()
        noiseSource.buffer = noiseBuffer

        micSource = ac.createMediaStreamSource(inputStream)
        merger = ac.createChannelMerger(2)
        destNode = ac.createMediaStreamDestination()

        micSource.connect(merger, 0, 0)
        noiseSource.connect(merger, 0, 1)
        noiseSource.connect(ac.destination)
        merger.connect(destNode)
        debug('audio graph wired', { merger: 'ChannelMerger(2)', destStreamId: destNode.stream.id })

        return await recordAndAnalyze(noiseSource, destNode, acState)
    } catch (error) {
        return { ok: false, error: error.message, acState }
    } finally {
        disconnectNode(noiseSource)
        disconnectNode(micSource)
        disconnectNode(merger)
        disconnectNode(destNode)

        if (destNode) {
            for (const track of destNode.stream.getTracks()) {
                track.stop()
            }
        }
    }
}

function recordAndAnalyze(noiseSource, destNode, acState) {
    return new Promise((resolve, reject) => {
        const chunks = []
        const mediaRecorder = new MediaRecorder(destNode.stream)
        let settled = false

        const settle = (result) => {
            if (settled) return
            settled = true
            resolve(result)
        }

        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                chunks.push(event.data)
            }
        }

        mediaRecorder.onerror = (event) => {
            mediaRecorder.ondataavailable = null
            mediaRecorder.onstop = null
            if (mediaRecorder.state !== 'inactive') {
                try { mediaRecorder.stop() } catch (e) { debug('mediaRecorder.stop() in onerror failed', { error: e.message }) }
            }
            settle({ ok: false, error: event.error?.message || 'MediaRecorder failed', acState })
        }

        mediaRecorder.onstop = async () => {
            debug('MediaRecorder stopped', { chunks: chunks.length })
            try {
                const blob = new Blob(chunks, { type: mediaRecorder.mimeType })
                if (blob.size === 0) {
                    throw new Error('MediaRecorder produced an empty recording')
                }
                debug('blob created', { size: blob.size, mimeType: mediaRecorder.mimeType })

                const decoded = await ac.decodeAudioData(await blob.arrayBuffer())
                debug('decodeAudioData', { channels: decoded.numberOfChannels, duration: decoded.duration.toFixed(3) + 's', length: decoded.length })

                if (decoded.numberOfChannels < 2) {
                    settle({
                        ok: false,
                        error: 'Browser downmixed stereo to mono — 2ch approach not supported in this browser/config',
                        channels: decoded.numberOfChannels,
                        acState
                    })
                    return
                }

                const ch0 = decoded.getChannelData(0)
                const ch1 = decoded.getChannelData(1)
                const maxLag = Math.floor((600 / 1000) * ac.sampleRate)
                const analysis = await correlateAndFindPeak(ch0, ch1, maxLag)

                settle({ ok: true, ...analysis, channels: decoded.numberOfChannels, duration: decoded.duration, acState })
            } catch (error) {
                settle({ ok: false, error: error.message, acState })
            }
        }

        try {
            debug('MediaRecorder ready', { mimeType: mediaRecorder.mimeType })
            mediaRecorder.start()
            noiseSource.start()
            debug('noiseSource started', { audioTime: ac.currentTime.toFixed(4) })
            noiseSource.onended = () => {
                debug('noiseSource ended → stopping MediaRecorder')
                if (mediaRecorder.state !== 'inactive') {
                    mediaRecorder.stop()
                }
            }
        } catch (error) {
            settled = true
            reject(error)
        }
    })
}

async function correlateAndFindPeak(ch0, ch1, maxLag) {
    debug('sending correlation to worker', { ch0Len: ch0.length, ch1Len: ch1.length, maxLag })

    const correlationResult = await postWorkerCommand(
        { command: 'correlation', data1: ch0, data2: ch1, maxLag, channel: 0, debug: false },
        (data) => data.channel === 0 && 'correlation' in data
    )
    debug('correlation received', { len: correlationResult.correlation.length })

    const peakResult = await postWorkerCommand(
        { command: 'findpeak', array: correlationResult.correlation, channel: 0, debug: false },
        (data) => data.channel === 0 && 'peakIndex' in data
    )
    debug('peak found', { peakIndex: peakResult.peakIndex, peakValuePow: peakResult.peakValuePow.toExponential(3), mean: peakResult.mean.toExponential(3) })

    const latency = peakResult.peakIndex / ac.sampleRate * 1000
    const ratio = 10 * Math.log10(peakResult.peakValuePow / peakResult.mean)
    const reliable = ratio > 18
    debug('result', { latency: latency.toFixed(2) + 'ms', ratio: ratio.toFixed(2) + 'dB', reliable })

    return { latency, ratio, reliable }
}

function postWorkerCommand(message, isExpectedResponse) {
    return new Promise((resolve, reject) => {
        const cleanup = () => {
            worker.removeEventListener('message', onMessage)
            worker.removeEventListener('error', onError)
            worker.removeEventListener('messageerror', onMessageError)
        }

        const onMessage = (event) => {
            if (!isExpectedResponse(event.data)) return
            cleanup()
            resolve(event.data)
        }

        const onError = (event) => {
            cleanup()
            reject(new Error(event.message || 'Worker failed'))
        }

        const onMessageError = () => {
            cleanup()
            reject(new Error('Worker message could not be decoded'))
        }

        worker.addEventListener('message', onMessage)
        worker.addEventListener('error', onError)
        worker.addEventListener('messageerror', onMessageError)

        try {
            worker.postMessage(message)
        } catch (error) {
            cleanup()
            reject(error)
        }
    })
}

function startSilenceKeepalive() {
    const source = ac.createBufferSource()
    source.buffer = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate)
    source.connect(ac.destination)
    source.onended = () => disconnectNode(source)
    source.start()
}

function appendRunLine(runNumber, text) {
    const line = document.createElement('div')
    line.className = 'run-result'
    line.textContent = `Run ${runNumber}: ${text}`
    results.append(line)
    return line
}

function renderRunLine(line, runNumber, result) {
    if (!result.ok) {
        line.classList.add('error')
        line.textContent = `Run ${runNumber}: Error: ${result.error} [ac: ${result.acState}]`
        return
    }

    line.textContent = `Run ${runNumber}: ${result.latency.toFixed(2)} ms | ratio ${result.ratio.toFixed(2)} dB | reliable ${result.reliable ? 'yes' : 'no'} | ch ${result.channels} | ac: ${result.acState}`
}

function renderAggregate(runResults) {
    const reliableLatencies = runResults
        .filter((result) => result.ok && result.reliable)
        .map((result) => result.latency)

    if (reliableLatencies.length === 0) {
        aggregate.textContent = 'Aggregate: no reliable runs.'
        return
    }

    const mean = reliableLatencies.reduce((sum, value) => sum + value, 0) / reliableLatencies.length
    const variance = reliableLatencies.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / reliableLatencies.length
    const std = Math.sqrt(variance)
    const min = Math.min(...reliableLatencies)
    const max = Math.max(...reliableLatencies)

    aggregate.textContent = `Reliable aggregate (${reliableLatencies.length}/${runResults.length}): mean ${mean.toFixed(2)} ms | std dev ${std.toFixed(2)} | min ${min.toFixed(2)} | max ${max.toFixed(2)}`
}

function clampRunCount(value) {
    const parsed = Number.parseInt(value, 10)
    if (!Number.isFinite(parsed)) return 5
    return Math.min(20, Math.max(1, parsed))
}

function disconnectNode(node) {
    if (!node) return
    try {
        node.disconnect()
    } catch {
        // node may already be disconnected
    }
}

window.addEventListener('pagehide', () => {
    worker.terminate()

    if (inputStream) {
        for (const track of inputStream.getTracks()) {
            track.stop()
        }
    }

    if (ac && ac.state !== 'closed') {
        ac.close()
    }
})
