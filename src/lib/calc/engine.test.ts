/**
 * QA 손계산 케이스 확정본 v1.1(BANB-64 첨부 tc-calc-engine-v1.1.md)을 그대로 재현한다.
 * 설정값은 시드 마이그레이션(supabase/migrations/20261127000000_policy_rules_seed.sql)의 JSON 을 읽는다.
 * 케이스 ID(LTV-01 …)는 QA 표와 같다.
 */
import { describe, expect, it } from 'vitest'
import { formatManwon } from '../money'
import { seedPolicy } from './__fixtures__/seedPolicy'
import {
  computeCosts,
  computeLoan,
  computeNeed,
  computeNeedRange,
  displayBalance,
  displayNeed,
  isProfileReady,
  type BuyerProfile,
  type HouseCount,
} from './engine'
import { disclaimerText } from './notices'
import type { Region } from './policy'

const policy = seedPolicy()

const GANGNAM: Region = { isCapital: true, isRegulated: true } // 서울 강남구(규제·조정·수도권)
const INCHEON: Region = { isCapital: true, isRegulated: false } // 인천 연수구(수도권 비규제)
const LOCAL: Region = { isCapital: false, isRegulated: false } // 비수도권 비규제(엔진 단위 테스트 전용)

function profile(over: Partial<BuyerProfile> = {}): BuyerProfile {
  return {
    seedMoney: null,
    annualIncome: null,
    existingAnnualDebt: 0,
    houseCount: 0,
    isFirstTimeBuyer: false,
    interestRatePct: 4.0,
    loanTermYears: 30,
    lenderType: 'bank',
    includeMovingCost: false,
    movingCost: 0,
    ...over,
  }
}

/** QA 표기: "부족 1억 3,971만" / "여유 5,700만" / "여유 0원" */
function balanceText(balanceWon: number): string {
  const b = displayBalance(balanceWon)
  return `${b.kind === 'short' ? '부족' : '여유'} ${formatManwon(b.manwon)}`
}

describe('1. LTV 기준액', () => {
  const cases: [string, Region, HouseCount, boolean, number, number][] = [
    ['LTV-01', GANGNAM, 0, false, 100000, 40000],
    ['LTV-02', INCHEON, 0, false, 50000, 35000],
    ['LTV-03', GANGNAM, 0, true, 80000, 56000],
    ['LTV-04', INCHEON, 0, true, 50000, 35000],
    ['LTV-05', LOCAL, 0, true, 50000, 40000],
    ['LTV-06', GANGNAM, 2, false, 100000, 0],
    ['LTV-07', INCHEON, 2, false, 50000, 0],
    ['LTV-08', GANGNAM, 1, false, 100000, 40000],
    ['LTV-09', INCHEON, 1, false, 50000, 35000],
  ]
  it.each(cases)('%s', (_id, region, houseCount, firstTime, price, expected) => {
    const r = computeLoan(policy, profile({ houseCount, isFirstTimeBuyer: firstTime }), region, price)
    expect(r.ltv).toBe(expected)
  })

  it('LTV-06·07: 2주택+ 수도권은 대출 0 + "주담대 불가" 안내', () => {
    for (const region of [GANGNAM, INCHEON]) {
      const r = computeLoan(policy, profile({ houseCount: 2 }), region, 100000)
      expect(r.available).toBe(0)
      expect(r.binding).toBe('banned')
      expect(r.notices).toContain('multiHouseBanned')
    }
  })

  it('LTV-08·09: 1주택은 처분 조건 안내', () => {
    expect(computeLoan(policy, profile({ houseCount: 1 }), GANGNAM, 100000).notices).toContain('disposalCondition')
    expect(computeLoan(policy, profile({ houseCount: 1 }), INCHEON, 50000).notices).toContain('disposalCondition')
  })
})

describe('2. 가격 구간 한도', () => {
  const cases: [string, Region, boolean, number, number, number, number][] = [
    // id, region, 생애최초, 가격, LTV, 한도, 대출 가능액(소득 미입력)
    ['CAP-01', GANGNAM, true, 149999, 104999, 60000, 60000],
    ['CAP-02', GANGNAM, true, 150000, 105000, 60000, 60000],
    ['CAP-03', GANGNAM, true, 150001, 105000, 40000, 40000],
    ['CAP-04', GANGNAM, false, 150000, 60000, 60000, 60000],
    ['CAP-05', GANGNAM, false, 150001, 60000, 40000, 40000],
    ['CAP-06', GANGNAM, false, 250000, 100000, 40000, 40000],
    ['CAP-07', GANGNAM, false, 250001, 100000, 20000, 20000],
    ['CAP-08', GANGNAM, false, 300000, 120000, 20000, 20000],
    ['CAP-09', INCHEON, false, 100000, 70000, 60000, 60000],
  ]
  it.each(cases)('%s', (_id, region, firstTime, price, ltv, cap, available) => {
    const r = computeLoan(policy, profile({ isFirstTimeBuyer: firstTime }), region, price)
    expect(r.ltv).toBe(ltv)
    expect(r.cap).toBe(cap)
    expect(r.available).toBe(available)
  })

  it('비수도권은 구간 한도를 적용하지 않음(Q3: 수도권 전체만)', () => {
    expect(computeLoan(policy, profile(), LOCAL, 300000).cap).toBeNull()
  })
})

describe('3. DSR 기준액 (허용 오차 ±1만원)', () => {
  const cases: [string, number | null, number, 'bank' | 'non_bank', number, number | null][] = [
    ['DSR-01', 6000, 0, 'bank', 4.0, 30061],
    ['DSR-02', 10000, 0, 'bank', 4.0, 50102],
    ['DSR-03', 10000, 1200, 'bank', 4.0, 35071],
    ['DSR-04', 5000, 600, 'bank', 4.0, 17535],
    ['DSR-05', 6000, 0, 'non_bank', 4.0, 37576],
    ['DSR-06', 6000, 0, 'bank', 3.5, 31642],
    ['DSR-07', 3000, 1500, 'bank', 4.0, 0],
    ['DSR-08', 3000, 1200, 'bank', 4.0, 0],
    ['DSR-09', 0, 0, 'bank', 4.0, null],
    ['DSR-10', null, 0, 'bank', 4.0, null],
  ]
  it.each(cases)('%s', (_id, income, debt, lender, rate, expected) => {
    const r = computeLoan(
      policy,
      profile({ annualIncome: income, existingAnnualDebt: debt, lenderType: lender, interestRatePct: rate }),
      GANGNAM,
      100000,
    )
    if (expected === null) {
      expect(r.dsr).toBeNull()
      expect(r.notices).toContain('dsrUnavailable')
    } else {
      expect(Math.abs((r.dsr as number) - expected)).toBeLessThanOrEqual(1)
      expect(r.notices).toContain('stressRateType')
    }
  })

  it('금리 = 입력 4.0% + 스트레스 3.0% × 반영비율 100% = 7.0%', () => {
    expect(computeLoan(policy, profile({ annualIncome: 6000 }), GANGNAM, 100000).dsrRatePct).toBeCloseTo(7.0, 10)
  })

  it('금리 미입력이면 설정 기본값(loan.default_interest_rate)을 쓴다', () => {
    const r = computeLoan(policy, profile({ annualIncome: 6000, interestRatePct: null }), GANGNAM, 100000)
    expect(r.dsrRatePct).toBeCloseTo(7.0, 10)
    expect(r.dsr).toBe(30061)
  })
})

describe('4. 대출 가능액 = min(LTV, 한도, DSR)', () => {
  const cases: [string, Region, Partial<BuyerProfile>, number, number, string][] = [
    ['MIN-01', GANGNAM, { annualIncome: 10000 }, 100000, 40000, 'ltv'],
    ['MIN-02', GANGNAM, { isFirstTimeBuyer: true }, 150001, 40000, 'cap'],
    ['MIN-03', GANGNAM, { annualIncome: 6000 }, 100000, 30061, 'dsr'],
    ['MIN-04', INCHEON, { isFirstTimeBuyer: true, annualIncome: 5000, existingAnnualDebt: 600 }, 70000, 17535, 'dsr'],
    ['MIN-05', GANGNAM, { houseCount: 2, annualIncome: 10000 }, 100000, 0, 'banned'],
    ['MIN-06', GANGNAM, { annualIncome: 3000, existingAnnualDebt: 1500 }, 100000, 0, 'dsr'],
    ['MIN-07', GANGNAM, { annualIncome: 0 }, 100000, 40000, 'ltv'],
  ]
  it.each(cases)('%s', (_id, region, over, price, available, binding) => {
    const r = computeLoan(policy, profile(over), region, price)
    expect(r.available).toBe(available)
    expect(r.binding).toBe(binding)
  })

  it('MIN-04: 각 기준값', () => {
    const r = computeLoan(policy, profile({ isFirstTimeBuyer: true, annualIncome: 5000, existingAnnualDebt: 600 }), INCHEON, 70000)
    expect([r.ltv, r.cap, r.dsr]).toEqual([49000, 60000, 17535])
  })

  it('MIN-05: 2주택+ 는 DSR 이 있어도 0 + 안내', () => {
    const r = computeLoan(policy, profile({ houseCount: 2, annualIncome: 10000 }), GANGNAM, 100000)
    expect(r.dsr).toBe(50102)
    expect(r.notices[0]).toBe('multiHouseBanned')
  })

  it('MIN-07: DSR 계산 불가 표시', () => {
    expect(computeLoan(policy, profile({ annualIncome: 0 }), GANGNAM, 100000).notices).toContain('dsrUnavailable')
  })
})

describe('5. 취득세 + 지방교육세 + 농특세', () => {
  const cases: [string, number, number, number, number, number, number][] = [
    // id, 가격(만원), 전용, 취득세, 교육세, 농특세, 합계 (원)
    ['TAX-01', 50000, 84.9, 5_000_000, 500_000, 0, 5_500_000],
    ['TAX-02', 60000, 84.9, 6_000_000, 600_000, 0, 6_600_000],
    ['TAX-03', 60001, 84.9, 6_000_100, 600_010, 0, 6_600_110],
    ['TAX-04', 65000, 84.9, 8_645_000, 864_500, 0, 9_509_500],
    ['TAX-05', 70000, 84.9, 11_690_000, 1_169_000, 0, 12_859_000],
    ['TAX-06', 80000, 84.9, 18_640_000, 1_864_000, 0, 20_504_000],
    ['TAX-07', 89999, 84.9, 26_999_700, 2_699_970, 0, 29_699_670],
    ['TAX-08', 90000, 101, 27_000_000, 2_700_000, 1_800_000, 31_500_000],
    ['TAX-09', 90001, 84.9, 27_000_300, 2_700_030, 0, 29_700_330],
    ['TAX-10', 60000, 85.0, 6_000_000, 600_000, 0, 6_600_000],
    ['TAX-11', 60000, 85.01, 6_000_000, 600_000, 1_200_000, 7_800_000],
    ['TAX-12', 180000, 101, 54_000_000, 5_400_000, 3_600_000, 63_000_000],
  ]
  it.each(cases)('%s', (_id, price, area, acq, edu, rural, sum) => {
    const c = computeCosts(policy, profile(), GANGNAM, price, area)
    expect([c.acquisitionTax, c.educationTax, c.ruralSpecialTax]).toEqual([acq, edu, rural])
    expect(c.acquisitionTax + c.educationTax + c.ruralSpecialTax).toBe(sum)
  })

  it('6~9억 세율은 비율 소수 넷째 자리까지(Q1): 7억 → 1.67%', () => {
    expect(computeCosts(policy, profile(), GANGNAM, 70000, 84.9).acquisitionRateBp).toBe(167)
  })
})

describe('5. 중과', () => {
  const cases: [string, Region, HouseCount, number, number, number, number, number][] = [
    ['HVY-01', GANGNAM, 1, 84.9, 30_000_000, 3_000_000, 0, 33_000_000],
    ['HVY-02', GANGNAM, 1, 101, 30_000_000, 3_000_000, 2_000_000, 35_000_000],
    ['HVY-03', GANGNAM, 2, 101, 120_000_000, 4_000_000, 10_000_000, 134_000_000],
    ['HVY-04', GANGNAM, 2, 84.9, 120_000_000, 4_000_000, 0, 124_000_000],
    ['HVY-05', INCHEON, 1, 84.9, 5_000_000, 500_000, 0, 5_500_000],
    ['HVY-06', INCHEON, 2, 84.9, 40_000_000, 2_000_000, 0, 42_000_000],
  ]
  it.each(cases)('%s', (_id, region, houseCount, area, acq, edu, rural, sum) => {
    const price = region === GANGNAM ? 100000 : 50000
    const c = computeCosts(policy, profile({ houseCount }), region, price, area)
    expect([c.acquisitionTax, c.educationTax, c.ruralSpecialTax]).toEqual([acq, edu, rural])
    expect(c.acquisitionTax + c.educationTax + c.ruralSpecialTax).toBe(sum)
  })

  it('HVY-01·02: 일시적 2주택 추징 안내, HVY-05(비조정 1주택)는 안내 없음', () => {
    expect(computeCosts(policy, profile({ houseCount: 1 }), GANGNAM, 100000, 84.9).notices).toContain('temporaryTwoHouseTax')
    expect(computeCosts(policy, profile({ houseCount: 1 }), INCHEON, 50000, 84.9).notices).toEqual([])
  })

  it('HVY-06: 비조정 2주택+ 는 "3주택 이상 보유 시 12%" 안내', () => {
    expect(computeCosts(policy, profile({ houseCount: 2 }), INCHEON, 50000, 84.9).notices).toContain('threePlusHouseTax')
  })
})

describe('5. 생애최초 감면 (취득세 본세만)', () => {
  const cases: [string, number, number, number, number, number, number][] = [
    // id, 가격, 전용, 취득세, 감면, 교육세, 합계(취득세 − 감면 + 교육세)
    ['FT-01', 50000, 84.9, 5_000_000, 2_000_000, 500_000, 3_500_000],
    ['FT-02', 15000, 59, 1_500_000, 1_500_000, 150_000, 150_000],
    ['FT-03', 70000, 84.9, 11_690_000, 2_000_000, 1_169_000, 10_859_000],
    ['FT-04', 120000, 84.9, 36_000_000, 2_000_000, 3_600_000, 37_600_000],
    ['FT-05', 120001, 84.9, 36_000_300, 0, 3_600_030, 39_600_330],
  ]
  it.each(cases)('%s', (_id, price, area, acq, relief, edu, sum) => {
    const c = computeCosts(policy, profile({ isFirstTimeBuyer: true }), INCHEON, price, area)
    expect([c.acquisitionTax, c.firstTimeRelief, c.educationTax]).toEqual([acq, relief, edu])
    expect(c.acquisitionTax - c.firstTimeRelief + c.educationTax + c.ruralSpecialTax).toBe(sum)
  })

  it('FT-06: 생애최초=Y 인데 1주택이면 엔진은 무시(감면·생애최초 LTV 미적용)', () => {
    const p = profile({ isFirstTimeBuyer: true, houseCount: 1 })
    expect(computeCosts(policy, p, GANGNAM, 50000, 84.9).firstTimeRelief).toBe(0)
    const loan = computeLoan(policy, p, GANGNAM, 50000)
    expect(loan.firstTimeApplied).toBe(false)
    expect(loan.ltv).toBe(20000) // 규제 40%, 생애최초 70% 아님
  })
})

describe('6. 중개보수 (상한)', () => {
  const cases: [string, number, number][] = [
    ['BRK-01', 4999, 250_000],
    ['BRK-02', 19999, 800_000],
    ['BRK-03', 20000, 800_000],
    ['BRK-04', 80000, 3_200_000],
    ['BRK-05', 89999, 3_599_960],
    ['BRK-06', 90000, 4_500_000],
    ['BRK-07', 119999, 5_999_950],
    ['BRK-08', 120000, 7_200_000],
    ['BRK-09', 149999, 8_999_940],
    ['BRK-10', 150000, 10_500_000],
    ['BRK-11', 300000, 21_000_000],
  ]
  it.each(cases)('%s', (_id, price, expected) => {
    expect(computeCosts(policy, profile(), GANGNAM, price, 84.9).brokerage).toBe(expected)
  })
})

describe('7. 필요 자금과 부족/여유', () => {
  const need01 = profile({ annualIncome: 10000, includeMovingCost: true, movingCost: 300, seedMoney: 70000 })
  const need02 = profile({ isFirstTimeBuyer: true, annualIncome: 5000, existingAnnualDebt: 600, seedMoney: 40000 })

  it('NEED-01: 6억 4,300만 / 여유 5,700만', () => {
    const r = computeNeed(policy, need01, GANGNAM, 100000, 84.9)
    expect(r.loan.available).toBe(40000)
    expect(r.costs).toMatchObject({
      acquisitionTax: 30_000_000,
      educationTax: 3_000_000,
      brokerage: 5_000_000,
      legalRegistration: 2_000_000,
      moving: 3_000_000,
      total: 43_000_000,
    })
    expect(formatManwon(displayNeed(r.needWon))).toBe('6억 4,300만')
    expect(balanceText(r.balanceWon as number)).toBe('여유 5,700만')
  })

  it('NEED-02: 내부 539,709,000원 → 5억 3,971만(올림) / 부족 1억 3,971만(올림)', () => {
    const r = computeNeed(policy, need02, INCHEON, 70000, 84.9)
    expect(r.loan.available).toBe(17535)
    expect(r.costs.total).toBe(15_059_000)
    expect(r.needWon).toBe(539_709_000)
    expect(formatManwon(displayNeed(r.needWon))).toBe('5억 3,971만')
    expect(r.balanceWon).toBe(-139_709_000)
    expect(balanceText(r.balanceWon as number)).toBe('부족 1억 3,971만')
  })

  it('NEED-03: 구간이면 최저·최고 각각 (Q11)', () => {
    const { low, high } = computeNeedRange(policy, profile({ seedMoney: 60000 }), GANGNAM, 90000, 95000, 84.9)
    expect([low.loan.available, high.loan.available]).toEqual([36000, 38000])
    expect([low.costs.total, high.costs.total]).toEqual([36_000_000, 38_000_000])
    expect(formatManwon(displayNeed(low.needWon))).toBe('5억 7,600만')
    expect(formatManwon(displayNeed(high.needWon))).toBe('6억 800만')
    expect(balanceText(low.balanceWon as number)).toBe('여유 2,400만')
    expect(balanceText(high.balanceWon as number)).toBe('부족 800만')
  })

  it('NEED-04: 0원이면 "여유 0원"', () => {
    const r = computeNeed(policy, { ...need01, seedMoney: 64300 }, GANGNAM, 100000, 84.9)
    expect(r.balanceWon).toBe(0)
    expect(balanceText(0)).toBe('여유 0원')
  })

  it('NEED-09: 내부 +60,291,000원 → 여유 6,029만(내림)', () => {
    const r = computeNeed(policy, { ...need02, seedMoney: 60000 }, INCHEON, 70000, 84.9)
    expect(r.balanceWon).toBe(60_291_000)
    expect(balanceText(r.balanceWon as number)).toBe('여유 6,029만')
  })

  it('NEED-05: 2주택+ 강남 → 11억 4,100만 / 부족 6억 4,100만 + 주담대 불가', () => {
    const r = computeNeed(policy, profile({ houseCount: 2, annualIncome: 10000, seedMoney: 50000 }), GANGNAM, 100000, 101)
    expect(r.loan.available).toBe(0)
    expect(r.costs.total).toBe(141_000_000)
    expect(formatManwon(displayNeed(r.needWon))).toBe('11억 4,100만')
    expect(balanceText(r.balanceWon as number)).toBe('부족 6억 4,100만')
    expect(r.notices).toContain('multiHouseBanned')
  })

  it('NEED-06: 18억 → 14억 7,920만 / 부족 4억 7,920만, DSR 계산 불가', () => {
    const r = computeNeed(policy, profile({ seedMoney: 100000 }), GANGNAM, 180000, 101)
    expect(r.loan.available).toBe(40000)
    expect(r.loan.binding).toBe('cap')
    expect(r.costs.total).toBe(79_200_000)
    expect(formatManwon(displayNeed(r.needWon))).toBe('14억 7,920만')
    expect(balanceText(r.balanceWon as number)).toBe('부족 4억 7,920만')
    expect(r.loan.dsr).toBeNull()
  })

  it('NEED-07: 내 조건 미입력이면 계산하지 않음("조건을 입력하세요")', () => {
    expect(isProfileReady(null)).toBe(false)
    expect(isProfileReady(profile({ seedMoney: null }))).toBe(false)
    expect(isProfileReady(profile({ seedMoney: 0 }))).toBe(true)
  })

  it('NEED-08: 고지 문구 + 규제 기준일(policy_rules 확인일)', () => {
    expect(policy.regulationDate).toBe('2026-11-19')
    expect(disclaimerText(policy.regulationDate)).toBe(
      '참고용 계산이며 실제 대출 한도는 금융기관 심사에 따릅니다. 규제 기준일: 2026-11-19',
    )
  })
})

describe('입력 방어', () => {
  it('가격은 양의 정수(만원)', () => {
    expect(() => computeLoan(policy, profile(), GANGNAM, 0)).toThrow(RangeError)
    expect(() => computeCosts(policy, profile(), GANGNAM, 1.5, 84)).toThrow(RangeError)
  })
  it('구간 최저 > 최고는 오류', () => {
    expect(() => computeNeedRange(policy, profile(), GANGNAM, 2, 1, 84)).toThrow(RangeError)
  })
})
