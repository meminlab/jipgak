import { describe, expect, it } from 'vitest'
import { seedPolicy, seedRows } from './__fixtures__/seedPolicy'
import { computeLoan } from './engine'
import { buildPolicy, defaultInterestRatePct, isRegulatedSigungu, PolicyError, regionOf, scopeChain, type PolicyRuleRow } from './policy'

const row = (over: Partial<PolicyRuleRow>): PolicyRuleRow => ({
  key: 'ltv.base',
  region_scope: 'all',
  value: { rate_pct: 70 },
  effective_from: '2025-01-01',
  effective_to: null,
  checked_on: '2025-01-01',
  ...over,
})

describe('buildPolicy', () => {
  it('기준일에 유효한 행만, 같은 key·scope 면 시행일이 늦은 행', () => {
    const p = buildPolicy(
      [
        row({ value: { rate_pct: 60 }, effective_from: '2024-01-01', effective_to: '2024-12-31' }),
        row({ value: { rate_pct: 70 }, effective_from: '2025-01-01' }),
        row({ value: { rate_pct: 50 }, effective_from: '2025-06-01', checked_on: '2025-06-02' }),
        row({ value: { rate_pct: 99 }, effective_from: '2030-01-01', checked_on: '2030-01-01' }),
      ],
      '2025-07-01',
    )
    expect(p.values.get('ltv.base')?.get('all')).toEqual({ rate_pct: 50 })
    expect(p.regulationDate).toBe('2025-06-02') // 미래 행의 확인일은 쓰지 않음
  })

  it('종료일 당일까지 유효', () => {
    const p = buildPolicy([row({ effective_to: '2025-03-31' })], '2025-03-31')
    expect(p.values.has('ltv.base')).toBe(true)
    expect(buildPolicy([row({ effective_to: '2025-03-31' })], '2025-04-01').values.has('ltv.base')).toBe(false)
  })

  it('필요한 설정이 없으면 조용히 넘기지 않고 PolicyError', () => {
    const p = buildPolicy([], '2026-11-19')
    expect(() =>
      computeLoan(
        p,
        {
          seedMoney: 1,
          annualIncome: null,
          existingAnnualDebt: 0,
          houseCount: 0,
          isFirstTimeBuyer: false,
          interestRatePct: 4,
          loanTermYears: 30,
          lenderType: 'bank',
          includeMovingCost: false,
          movingCost: 0,
        },
        { isCapital: true, isRegulated: true },
        100000,
      ),
    ).toThrow(PolicyError)
  })
})

describe('지역 판정', () => {
  const policy = seedPolicy()
  it('scopeChain: 규제 → 수도권 → 전체', () => {
    expect(scopeChain({ isCapital: true, isRegulated: true })).toEqual(['regulated', 'capital', 'all'])
    expect(scopeChain({ isCapital: true, isRegulated: false })).toEqual(['capital', 'all'])
    expect(scopeChain({ isCapital: false, isRegulated: false })).toEqual(['all'])
  })
  it('규제지역 목록: 서울 강남구 O, 인천 연수구 X, 성남 분당 O', () => {
    expect(isRegulatedSigungu(policy, '11680')).toBe(true)
    expect(isRegulatedSigungu(policy, '28185')).toBe(false)
    expect(regionOf(policy, '41135', true)).toEqual({ isCapital: true, isRegulated: true })
  })
  it('기본 금리 설정값', () => {
    expect(defaultInterestRatePct(policy)).toBe(4.0)
  })
})

describe('시드 데이터 형식', () => {
  const rows = seedRows()
  it('모든 행에 확인일, 규제 기준일 = 2026-11-19', () => {
    for (const r of rows) expect(r.checked_on).toBe('2026-11-19')
  })
  it('key·scope·시행일 중복 없음(테이블 unique 제약과 같음)', () => {
    const ids = rows.map((r) => `${r.key}|${r.region_scope}|${r.effective_from}`)
    expect(new Set(ids).size).toBe(ids.length)
  })
  it('⚠️ 항목은 verified=false (지방 스트레스 금리·다주택 세부·생애최초 감면 한도)', () => {
    const unverified = (key: string, scope: string) =>
      rows.find((r) => r.key === key && r.region_scope === scope)?.verified
    expect(unverified('dsr.stress_rate', 'all')).toBe(false)
    expect(unverified('ltv.multi_house', 'capital')).toBe(false)
    expect(unverified('tax.acquisition.multi_owner', 'regulated')).toBe(false)
    expect(unverified('tax.first_time_relief', 'all')).toBe(false)
  })
})
