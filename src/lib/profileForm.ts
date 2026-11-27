/**
 * 내 조건 폼(명세 2절) ↔ user_profile 행 변환과 검증. 순수 함수(화면과 분리).
 * 금액 입력 단위는 만원(DB 와 같음). 입력 문자열은 숫자만 남기고 천 단위 쉼표로 보여준다.
 */
import type { BuyerProfile, HouseCount, LenderType } from './calc/engine'

export interface ProfileRow {
  seed_money: number | null
  annual_income: number | null
  existing_annual_debt: number
  house_count: number
  is_first_time_buyer: boolean
  interest_rate: number | null
  loan_term_years: number
  repayment_type: string
  include_moving_cost: boolean
  moving_cost: number
  lender_type: string
  updated_at?: string
}

export type ProfileValues = Omit<ProfileRow, 'updated_at'>

export interface ProfileForm {
  seedMoney: string
  annualIncome: string
  existingAnnualDebt: string
  houseCount: HouseCount
  isFirstTimeBuyer: boolean
  lenderType: LenderType
  interestRate: string
  loanTermYears: string
  includeMovingCost: boolean
  movingCost: string
}

export type ProfileField = keyof ProfileForm
export type ProfileErrors = Partial<Record<ProfileField, string>>

/** 만원 입력 상한(999억). DB integer 범위 안에서 오입력을 막는다. */
export const MAX_MANWON = 9_999_999

export const EMPTY_FORM: ProfileForm = {
  seedMoney: '',
  annualIncome: '',
  existingAnnualDebt: '0',
  houseCount: 0,
  isFirstTimeBuyer: false,
  lenderType: 'bank',
  interestRate: '',
  loanTermYears: '30',
  includeMovingCost: false,
  movingCost: '',
}

/** 금리 입력 범위(기획 확정 2026-11-27, BANB-64 Q15): 0.00~20.00%, 소수 둘째 자리까지 */
export const MAX_RATE_PCT = 20

/**
 * 입력 중 금액 문자열 정리: 숫자·쉼표만 있으면 천 단위 쉼표로 다시 쓴다. "05,0000" → "50,000"
 * 소수점·음수 부호·문자가 섞이면(붙여넣기 등) 바꾸지 않고 그대로 둔다 → 검증에서 저장을 막는다.
 * 조용히 다른 값(1.5 → 15)으로 바꾸지 않기 위해서다.
 */
export function formatMoneyInput(raw: string): string {
  const compact = raw.replace(/\s/g, '')
  if (!/^[\d,]*$/.test(compact)) return raw.slice(0, 20)
  const digits = compact.replace(/,/g, '').replace(/^0+(?=\d)/, '').slice(0, 7)
  return digits === '' ? '' : Number(digits).toLocaleString('ko-KR')
}

/** "50,000" → 50000, "" → null, 정수가 아닌 값("1.5", "-300", "abc") → NaN */
export function parseManwon(text: string): number | null {
  const compact = text.replace(/\s/g, '')
  if (compact === '') return null
  if (!/^[\d,]+$/.test(compact)) return Number.NaN
  return Number(compact.replace(/,/g, ''))
}

/** 금리 입력 정리: 숫자와 소수점 하나, 소수 둘째 자리까지. */
export function formatRateInput(raw: string): string {
  const cleaned = raw.replace(/[^\d.]/g, '')
  const [int, ...rest] = cleaned.split('.')
  const intPart = int.slice(0, 2)
  return rest.length === 0 ? intPart : `${intPart}.${rest.join('').slice(0, 2)}`
}

/** 주택 수 변경: 1주택 이상이면 생애최초 체크를 자동으로 푼다(Q10). */
export function setHouseCount(form: ProfileForm, houseCount: HouseCount): ProfileForm {
  return { ...form, houseCount, isFirstTimeBuyer: houseCount === 0 ? form.isFirstTimeBuyer : false }
}

export function formFromRow(row: ProfileRow | null): ProfileForm {
  if (!row) return EMPTY_FORM
  const money = (v: number | null) => (v === null ? '' : v.toLocaleString('ko-KR'))
  const houseCount = Math.min(Math.max(row.house_count, 0), 2) as HouseCount
  return {
    seedMoney: money(row.seed_money),
    annualIncome: money(row.annual_income),
    existingAnnualDebt: money(row.existing_annual_debt),
    houseCount,
    isFirstTimeBuyer: row.is_first_time_buyer && houseCount === 0,
    lenderType: row.lender_type === 'non_bank' ? 'non_bank' : 'bank',
    interestRate: row.interest_rate === null ? '' : String(row.interest_rate),
    loanTermYears: String(row.loan_term_years),
    includeMovingCost: row.include_moving_cost,
    movingCost: row.include_moving_cost || row.moving_cost > 0 ? money(row.moving_cost) : '',
  }
}

export type ValidateResult = { ok: true; values: ProfileValues } | { ok: false; errors: ProfileErrors }

export function validateForm(form: ProfileForm): ValidateResult {
  const errors: ProfileErrors = {}
  const money = (field: ProfileField, text: string, required: boolean): number | null => {
    const v = parseManwon(text)
    if (v === null) {
      if (required) errors[field] = '금액을 입력해 주세요'
      return null
    }
    if (Number.isNaN(v)) {
      errors[field] = '만원 단위 0 이상 정수로 입력해 주세요'
      return null
    }
    if (v > MAX_MANWON) errors[field] = '999억 이하로 입력해 주세요'
    return v
  }

  const seedMoney = money('seedMoney', form.seedMoney, true)
  if (errors.seedMoney === '금액을 입력해 주세요') errors.seedMoney = '종잣돈을 입력해야 계산할 수 있어요'
  const annualIncome = money('annualIncome', form.annualIncome, false)
  const existingAnnualDebt = money('existingAnnualDebt', form.existingAnnualDebt, false) ?? 0

  let interestRate: number | null = null
  const rateText = form.interestRate.trim()
  if (rateText !== '') {
    const v = Number(rateText)
    if (!/^\d{1,2}(\.\d{0,2})?$/.test(rateText) || !Number.isFinite(v) || v < 0 || v > MAX_RATE_PCT) {
      errors.interestRate = '0~20% 사이, 소수 둘째 자리까지 입력해 주세요'
    } else {
      interestRate = v
    }
  }

  const term = Number(form.loanTermYears)
  if (!Number.isInteger(term) || term < 1 || term > 50) errors.loanTermYears = '1~50년으로 입력해 주세요'

  let movingCost = 0
  if (form.includeMovingCost) {
    const v = money('movingCost', form.movingCost, true)
    if (errors.movingCost === '금액을 입력해 주세요') errors.movingCost = '이사비를 입력하거나 이사비 포함을 꺼 주세요'
    movingCost = v ?? 0
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors }
  return {
    ok: true,
    values: {
      seed_money: seedMoney,
      annual_income: annualIncome,
      existing_annual_debt: existingAnnualDebt,
      house_count: form.houseCount,
      is_first_time_buyer: form.houseCount === 0 && form.isFirstTimeBuyer,
      interest_rate: interestRate,
      loan_term_years: term,
      repayment_type: 'annuity',
      include_moving_cost: form.includeMovingCost,
      moving_cost: movingCost,
      lender_type: form.lenderType,
    },
  }
}

/** user_profile 행 → 계산 엔진 입력 */
export function profileFromRow(row: ProfileRow): BuyerProfile {
  return {
    seedMoney: row.seed_money,
    annualIncome: row.annual_income,
    existingAnnualDebt: row.existing_annual_debt,
    houseCount: Math.min(Math.max(row.house_count, 0), 2) as HouseCount,
    isFirstTimeBuyer: row.is_first_time_buyer,
    interestRatePct: row.interest_rate === null ? null : Number(row.interest_rate),
    loanTermYears: row.loan_term_years,
    lenderType: row.lender_type === 'non_bank' ? 'non_bank' : 'bank',
    includeMovingCost: row.include_moving_cost,
    movingCost: row.moving_cost,
  }
}
