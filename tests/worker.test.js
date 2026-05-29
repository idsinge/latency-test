import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { calculateCrossCorrelation, findPeakAndMean } from '../src/scripts/worker.js'
import { generateMLS } from '../src/scripts/mls.js'

describe('calculateCrossCorrelation', () => {
  let originalPostMessage
  let postMessageCalls

  beforeEach(() => {
    originalPostMessage = globalThis.postMessage
    postMessageCalls = []
    globalThis.postMessage = (message) => postMessageCalls.push(message)
  })

  afterEach(() => {
    if (originalPostMessage === undefined) {
      delete globalThis.postMessage
    } else {
      globalThis.postMessage = originalPostMessage
    }
  })

  it('correlation.length equals maxLag + 1', () => {
    const data = [1, 0, 1, 0, 1, 0, 1, 0, 1, 0]
    calculateCrossCorrelation(data, data, 5, 0, false)
    assert.strictEqual(postMessageCalls[0].correlation.length, 6)
  })

  it('auto-correlation peak is at lag 0', () => {
    const seq = generateMLS(4)
    calculateCrossCorrelation(seq, seq, seq.length - 1, 0, false)
    const corr = postMessageCalls[0].correlation
    assert.strictEqual(corr[0], Math.max(...corr))
  })

  it('known shifted impulse: peak at index 3', () => {
    const data1 = [0, 0, 0, 1, 0, 0, 0, 0, 0, 0]
    const data2 = [1, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    calculateCrossCorrelation(data1, data2, 5, 0, false)
    const corr = postMessageCalls[0].correlation
    assert.strictEqual(corr.indexOf(Math.max(...corr)), 3)
  })

  it('all-zero inputs produce all-zero correlation', () => {
    const zeros = new Array(10).fill(0)
    calculateCrossCorrelation(zeros, zeros, 5, 0, false)
    assert.ok(postMessageCalls[0].correlation.every(v => v === 0))
  })

  it('channel value is passed through to postMessage', () => {
    const data = [1, 0, 1]
    calculateCrossCorrelation(data, data, 2, 7, false)
    assert.strictEqual(postMessageCalls[0].channel, 7)
  })

  it('postMessage called exactly once with correct shape', () => {
    const data = [1, 0, 1]
    calculateCrossCorrelation(data, data, 2, 0, false)
    assert.strictEqual(postMessageCalls.length, 1)
    assert.ok(Array.isArray(postMessageCalls[0].correlation))
    assert.ok(typeof postMessageCalls[0].channel === 'number')
  })

  it('debug=false produces no console.debug output', () => {
    const orig = console.debug
    const debugCalls = []
    console.debug = (...args) => debugCalls.push(args)
    try {
      calculateCrossCorrelation([1, 0], [1, 0], 1, 0, false)
      assert.strictEqual(debugCalls.length, 0)
    } finally {
      console.debug = orig
    }
  })

  it('debug=true produces console.debug output', () => {
    const orig = console.debug
    const debugCalls = []
    console.debug = (...args) => debugCalls.push(args)
    try {
      calculateCrossCorrelation([1, 0], [1, 0], 1, 0, true)
      assert.ok(debugCalls.length > 0)
    } finally {
      console.debug = orig
    }
  })
})

describe('findPeakAndMean', () => {
  let originalPostMessage
  let postMessageCalls

  beforeEach(() => {
    originalPostMessage = globalThis.postMessage
    postMessageCalls = []
    globalThis.postMessage = (message) => postMessageCalls.push(message)
  })

  afterEach(() => {
    if (originalPostMessage === undefined) {
      delete globalThis.postMessage
    } else {
      globalThis.postMessage = originalPostMessage
    }
  })

  it('clear mid-array peak: peakIndex=2, peakValuePow=25', () => {
    findPeakAndMean([0, 0, 5, 0, 0], 0, false)
    assert.strictEqual(postMessageCalls[0].peakIndex, 2)
    assert.strictEqual(postMessageCalls[0].peakValuePow, 25)
  })

  it('peak at index 0: peakIndex=0, peakValuePow=9', () => {
    findPeakAndMean([3, 1, 0], 0, false)
    assert.strictEqual(postMessageCalls[0].peakIndex, 0)
    assert.strictEqual(postMessageCalls[0].peakValuePow, 9)
  })

  it('peak at last index: peakIndex=2, peakValuePow=16', () => {
    findPeakAndMean([0, 0, 4], 0, false)
    assert.strictEqual(postMessageCalls[0].peakIndex, 2)
    assert.strictEqual(postMessageCalls[0].peakValuePow, 16)
  })

  it('mean excludes index 0 — locked behaviour', () => {
    findPeakAndMean([2, 2, 2], 0, false)
    // energy = 2^2 + 2^2 = 8 (index 0 excluded from loop), mean = 8 / 3
    assert.strictEqual(postMessageCalls[0].mean, 8 / 3)
  })

  it('channel value is passed through to postMessage', () => {
    findPeakAndMean([1, 2, 3], 3, false)
    assert.strictEqual(postMessageCalls[0].channel, 3)
  })

  it('postMessage called exactly once with correct shape', () => {
    findPeakAndMean([1, 2, 3], 0, false)
    assert.strictEqual(postMessageCalls.length, 1)
    const msg = postMessageCalls[0]
    for (const key of ['peakValuePow', 'peakIndex', 'mean', 'channel']) {
      assert.ok(typeof msg[key] === 'number', `${key} should be a number`)
    }
  })

  it('debug=false produces no console.debug output', () => {
    const orig = console.debug
    const debugCalls = []
    console.debug = (...args) => debugCalls.push(args)
    try {
      findPeakAndMean([1, 2, 3], 0, false)
      assert.strictEqual(debugCalls.length, 0)
    } finally {
      console.debug = orig
    }
  })

  it('debug=true produces console.debug output', () => {
    const orig = console.debug
    const debugCalls = []
    console.debug = (...args) => debugCalls.push(args)
    try {
      findPeakAndMean([1, 2, 3], 0, true)
      assert.ok(debugCalls.length > 0)
    } finally {
      console.debug = orig
    }
  })
})
