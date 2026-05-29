// Listen for messages from the main thread
if (typeof WorkerGlobalScope !== 'undefined' && globalThis instanceof WorkerGlobalScope) {
  addEventListener('message', (message) => {
    const debug = message.data.debug || false
    if (message.data.command === 'correlation') {
      calculateCrossCorrelation(message.data.data1, message.data.data2, message.data.maxLag, message.data.channel, debug)
    }

    if (message.data.command === 'findpeak') {
      findPeakAndMean(message.data.array, message.data.channel, debug)
    }
  })
}


export function calculateCrossCorrelation(data1, data2, maxLag, channel, debug) {
    const t0 = performance.now()
    if (debug) console.debug('[latency-test]', (performance.timeOrigin + t0).toFixed(2), 'calculateCrossCorrelation', { data1Len: data1.length, data2Len: data2.length, maxLag, channel })
    const n1 = data1.length, n2 = data2.length
    let crossCorrelations = new Array(maxLag + 1).fill(0)

    for (let lag = 0; lag <= maxLag; lag++) {
      let sum = 0
      for (let i = lag; i < n1 && (i - lag) < n2; i++) {
        sum += (data1[i]) * (data2[i - lag])
      }
      crossCorrelations[lag] = sum / (n1 - lag)
    }

    if (debug) console.debug('[latency-test]', (performance.timeOrigin + performance.now()).toFixed(2), 'calculateCrossCorrelation complete', { elapsedMs: (performance.now() - t0).toFixed(2) })
    postMessage({ correlation: crossCorrelations, channel: channel })
  }

export function findPeakAndMean(array, channel, debug) {
    let peakIndex = 0
    let energy = 0
    let peakValuePow = Math.pow(array[0], 2)

    for (let i = 1; i < array.length; i++) {
        const samplePow = Math.pow(array[i], 2)
        if (samplePow > peakValuePow) {
            peakValuePow = samplePow
            peakIndex = i
        }
        energy += samplePow
    }
    const mean = energy / array.length
    if (debug) console.debug('[latency-test]', (performance.timeOrigin + performance.now()).toFixed(2), 'findPeakAndMean', { peakIndex, peakValuePow: peakValuePow.toFixed(6), mean: mean.toFixed(6), channel })
    postMessage({ peakValuePow, peakIndex, mean, channel })
  }
