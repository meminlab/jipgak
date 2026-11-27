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

/** 입력 중 금액 문자열 정리: 숫자만 남기고 천 단위 쉼표. "05,0000" → "50,000" */
export function formatMoneyInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, 7)
  return digits === '' ? '' : Number(digits).toLocaleString('ko-KR')
}

/** "50,000" → 50000, "" → null */
export function parseManwon(text: string): number | null {
  const digits = text.replace(/[^\d]/g, '')
  return digits === '' ? null : Number(digits)
}

/** 금리 입력 정리: 숫자와 소수점 하나, 소수 셋째 자리까지(numeric(5,3)). */
export function formatRateInput(raw: string): string {
  const cleaned = raw.replace(/[^\d.]/g, '')
  const [int, ...rest] = cleaned.split('.')
  const intPart = int.slice(0, 2)
  return rest.length === 0 ? intPart : `${intPart}.${rest.join('').slice(0, 3)}`
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
    if (v > MAX_MANWON) errors[field] = '999억 이하로 입력해 주세요'
    return v
  }

  const seedMoney = money('seedMoney', form.seedMoney, true)
  if (errors.seedMoney === '금액을 입력해 주세요') errors.seedMoney = '종잣돈을 입력해야 계산할 수 있어요'
  const annualIncome = money('annualIncome', form.annualIncome, false)
  const existingAnnualDebt = money('existingAnnualDebt', form.existingAnnualDebt, false) ?? 0

  let interestRate: number | null = null
  if (form.interestRate.trim() !== '') {
    const v = Number(form.interestRate)
    if (!Number.isFinite(v) || v <= 0 || v > 30) errors.interestRate = '0보다 크고 30 이하로 입력해 주세요'
    else interestRate = Math.round(v * 1000) / 1000
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
