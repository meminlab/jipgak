import { describe, expect, it } from 'vitest'
import { formatManwon } from './money'

describe('formatManwon', () => {
  it.each([
    [73500, '7억 3,500만'],
    [70000, '7억'],
    [3500, '3,500만'],
    [9999, '9,999만'],
    [10000, '1억'],
    [10001, '1억 1만'],
    [1234567, '123억 4,567만'],
    [0, '0원'],
    [-1200, '-1,200만'],
    [-150000, '-15억'],
    [3500.4, '3,500만'],
  ])('%d만원 → %s', (input, expected) => {
    expect(formatManwon(input)).toBe(expected)
  })

  it('rejects non-finite values', () => {
    expect(() => formatManwon(Number.NaN)).toThrow(RangeError)
    expect(() => formatManwon(Number.POSITIVE_INFINITY)).toThrow(RangeError)
  })
})
