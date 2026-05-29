import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { generateMLS } from '../src/scripts/mls.js'

describe('generateMLS', () => {
  describe('sequence length', () => {
    for (const n of [2, 3, 4, 5, 8, 15]) {
      it(`n=${n} has length ${(2 ** n) - 1}`, () => {
        assert.strictEqual(generateMLS(n).length, (2 ** n) - 1)
      })
    }
  })

  describe('binary values', () => {
    for (const n of [2, 5, 15]) {
      it(`n=${n} contains only 0 and 1`, () => {
        const seq = generateMLS(n)
        assert.ok(seq.every(v => v === 0 || v === 1))
      })
    }
  })

  describe('balance property', () => {
    it('n=2: 2 ones, 1 zero', () => {
      const seq = generateMLS(2)
      assert.strictEqual(seq.filter(v => v === 1).length, 2)
      assert.strictEqual(seq.filter(v => v === 0).length, 1)
    })

    it('n=3: 4 ones, 3 zeros', () => {
      const seq = generateMLS(3)
      assert.strictEqual(seq.filter(v => v === 1).length, 4)
      assert.strictEqual(seq.filter(v => v === 0).length, 3)
    })

    it('n=15: 16384 ones, 16383 zeros', () => {
      const seq = generateMLS(15)
      assert.strictEqual(seq.filter(v => v === 1).length, 16384)
      assert.strictEqual(seq.filter(v => v === 0).length, 16383)
    })
  })

  describe('determinism', () => {
    it('two calls with the same n return identical sequences', () => {
      assert.deepStrictEqual(generateMLS(5), generateMLS(5))
    })
  })

  describe('known sequences', () => {
    it('n=2 returns [1, 1, 0]', () => {
      assert.deepStrictEqual(generateMLS(2), [1, 1, 0])
    })

    it('n=3 returns [1, 1, 1, 0, 1, 0, 0]', () => {
      assert.deepStrictEqual(generateMLS(3), [1, 1, 1, 0, 1, 0, 0])
    })
  })

  describe('invalid nbits throws', () => {
    it('n=1 throws with message matching /taps/', () => {
      assert.throws(() => generateMLS(1), /taps/)
    })

    it('n=17 throws with message matching /taps/', () => {
      assert.throws(() => generateMLS(17), /taps/)
    })

    it('n=0 throws with message matching /taps/', () => {
      assert.throws(() => generateMLS(0), /taps/)
    })
  })
})
