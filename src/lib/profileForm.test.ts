import { describe, expect, it } from 'vitest'
import {
  EMPTY_FORM,
  formatMoneyInput,
  formatRateInput,
  formFromRow,
  parseManwon,
  profileFromRow,
  setHouseCount,
  validateForm,
  type ProfileRow,
} from './profileForm'

const ROW: ProfileRow = {
  seed_money: 50000,
  annual_income: 9000,
  existing_annual_debt: 0,
  house_count: 0,
  is_first_time_buyer: true,
  interest_rate: 4.2,
  loan_term_years: 30,
  repayment_type: 'annuity',
  include_moving_cost: true,
  moving_cost: 200,
  lender_type: 'bank',
}

describe('금액 입력', () => {
  it('숫자만 남기고 천 단위 쉼표, 앞자리 0 제거', () => {
    expect(formatMoneyInput('50000')).toBe('50,000')
    expect(formatMoneyInput('05,0000')).toBe('50,000')
    expect(formatMoneyInput('')).toBe('')
    expect(formatMoneyInput('0')).toBe('0')
  })
  it('7자리(999억 9,999만)까지만', () => {
    expect(formatMoneyInput('123456789')).toBe('1,234,567')
  })
  it('parseManwon', () => {
    expect(parseManwon('50,000')).toBe(50000)
    expect(parseManwon('')).toBeNull()
    expect(parseManwon('1.5')).toBeNaN()
    expect(parseManwon('-300')).toBeNaN()
  })
  it('D2: 소수점·음수·문자가 섞이면 다른 값으로 바꾸지 않고 그대로 둔다', () => {
    expect(formatMoneyInput('1.5')).toBe('1.5')
    expect(formatMoneyInput('-300')).toBe('-300')
    expect(formatMoneyInput('5억')).toBe('5억')
  })
  it('D2: 정수가 아닌 금액은 저장을 막고 해당 필드에 문구', () => {
    for (const bad of ['1.5', '-300', '5억']) {
      const r = validateForm({ ...EMPTY_FORM, seedMoney: bad, annualIncome: bad })
      expect(!r.ok && r.errors).toEqual({
        seedMoney: '만원 단위 0 이상 정수로 입력해 주세요',
        annualIncome: '만원 단위 0 이상 정수로 입력해 주세요',
      })
    }
  })
  it('금리 입력: 소수점 하나, 둘째 자리까지', () => {
    expect(formatRateInput('4.25')).toBe('4.25')
    expect(formatRateInput('4.125')).toBe('4.12')
    expect(formatRateInput('4..2567')).toBe('4.25')
    expect(formatRateInput('a4%')).toBe('4')
  })
})

describe('주택 수와 생애최초 (Q10)', () => {
  it('1주택 이상으로 바꾸면 생애최초 자동 해제, 무주택으로 돌아와도 다시 켜지지 않음', () => {
    const on = { ...EMPTY_FORM, isFirstTimeBuyer: true }
    const one = setHouseCount(on, 1)
    expect(one.isFirstTimeBuyer).toBe(false)
    expect(setHouseCount(one, 0).isFirstTimeBuyer).toBe(false)
  })
  it('저장값도 무주택일 때만 생애최초', () => {
    const r = validateForm({ ...EMPTY_FORM, seedMoney: '1', houseCount: 2, isFirstTimeBuyer: true })
    expect(r.ok && r.values.is_first_time_buyer).toBe(false)
  })
})

describe('검증', () => {
  it('종잣돈 필수', () => {
    const r = validateForm(EMPTY_FORM)
    expect(r.ok).toBe(false)
    expect(!r.ok && r.errors.seedMoney).toBe('종잣돈을 입력해야 계산할 수 있어요')
  })
  it('연소득 비우면 null(DSR 계산 불가), 금리 비우면 null(설정 기본값)', () => {
    const r = validateForm({ ...EMPTY_FORM, seedMoney: '50,000' })
    expect(r).toEqual({
      ok: true,
      values: {
        seed_money: 50000,
        annual_income: null,
        existing_annual_debt: 0,
        house_count: 0,
        is_first_time_buyer: false,
        interest_rate: null,
        loan_term_years: 30,
        repayment_type: 'annuity',
        include_moving_cost: false,
        moving_cost: 0,
        lender_type: 'bank',
      },
    })
  })
  it('D1: 금리 0.00~20.00%, 소수 둘째 자리까지 (기획 확정 Q15)', () => {
    const rate = (t: string) => validateForm({ ...EMPTY_FORM, seedMoney: '1', interestRate: t })
    for (const [t, v] of [['0', 0], ['0.00', 0], ['4.25', 4.25], ['20', 20], ['20.00', 20], ['3.', 3]] as const) {
      const r = rate(t)
      expect(r.ok && r.values.interest_rate).toBe(v)
    }
    for (const t of ['20.01', '20.5', '25', '4.125', '-1', '.5', 'abc']) {
      const r = rate(t)
      expect(!r.ok && r.errors.interestRate).toBe('0~20% 사이, 소수 둘째 자리까지 입력해 주세요')
    }
  })
  it('만기 범위', () => {
    const r = validateForm({ ...EMPTY_FORM, seedMoney: '1', loanTermYears: '51' })
    expect(!r.ok && r.errors).toEqual({ loanTermYears: '1~50년으로 입력해 주세요' })
  })
  it('이사비 포함이면 금액 필수, 끄면 0으로 저장', () => {
    const on = validateForm({ ...EMPTY_FORM, seedMoney: '1', includeMovingCost: true })
    expect(!on.ok && on.errors.movingCost).toBe('이사비를 입력하거나 이사비 포함을 꺼 주세요')
    const off = validateForm({ ...EMPTY_FORM, seedMoney: '1', includeMovingCost: false, movingCost: '300' })
    expect(off.ok && off.values.moving_cost).toBe(0)
  })
})

describe('행 ↔ 폼 ↔ 엔진', () => {
  it('저장된 행을 폼으로 되살리고 다시 검증하면 같은 값', () => {
    const form = formFromRow(ROW)
    expect(form.seedMoney).toBe('50,000')
    const r = validateForm(form)
    expect(r.ok && r.values).toEqual(ROW)
  })
  it('행이 없으면 빈 폼(만기 30년·은행 기본)', () => {
    expect(formFromRow(null)).toEqual(EMPTY_FORM)
  })
  it('엔진 입력으로 변환', () => {
    expect(profileFromRow(ROW)).toEqual({
      seedMoney: 50000,
      annualIncome: 9000,
      existingAnnualDebt: 0,
      houseCount: 0,
      isFirstTimeBuyer: true,
      interestRatePct: 4.2,
      loanTermYears: 30,
      lenderType: 'bank',
      includeMovingCost: true,
      movingCost: 200,
    })
  })
})
