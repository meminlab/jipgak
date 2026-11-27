/**
 * 계산 엔진(명세 5절): 대출 가능액(LTV·가격 구간 한도·DSR), 부대비용, 필요 자금. 순수 함수만 둔다.
 *
 * 단위·반올림(BANB-64 Q8)
 *   * 입력 금액은 만원 정수(DB 와 같음). 내부 계산은 원 단위.
 *   * 대출 금액(LTV·한도·DSR·대출 가능액)은 만원 미만 절사 → 만원 정수로 돌려준다.
 *   * 세금·보수는 원 미만 절사 → 원 정수.
 *   * 화면 표시: 필요 자금·부족은 만원 미만 올림, 여유는 만원 미만 내림(displayNeed / displayBalance).
 * 비율은 policy_rules 의 퍼센트를 정수 bp 로 바꿔 정수 연산한다(0.7 × 70000 같은 부동소수 오차 방지).
 * DSR 역산만 부동소수(거듭제곱)이고, 결과를 만원 미만 절사한다.
 */
import { lookup, num, pctToBp, PolicyError, requireRule, type Policy, type Region } from './policy'

export type HouseCount = 0 | 1 | 2 // 무주택 / 1주택 / 2주택 이상
export type LenderType = 'bank' | 'non_bank'

/** 내 조건(명세 2절). 금액은 만원. */
export interface BuyerProfile {
  seedMoney: number | null
  /** 연소득(세전). null = 미입력 */
  annualIncome: number | null
  existingAnnualDebt: number
  houseCount: HouseCount
  isFirstTimeBuyer: boolean
  /** 연 %. null = 설정 기본값(loan.default_interest_rate) */
  interestRatePct: number | null
  loanTermYears: number
  lenderType: LenderType
  includeMovingCost: boolean
  movingCost: number
}

export type NoticeCode =
  | 'multiHouseBanned' // 2주택+ 수도권·규제지역 주담대 불가
  | 'disposalCondition' // 1주택 처분조건부 LTV
  | 'dsrUnavailable' // 연소득 0·미입력
  | 'stressRateType' // DSR 옆: 고정·혼합형 안내
  | 'temporaryTwoHouseTax' // 1주택 보유자 조정지역 취득: 일시적 2주택 일반세율
  | 'threePlusHouseTax' // 비조정지역 2주택+ 8%: 3주택 이상이면 12%

export type LoanBinding = 'ltv' | 'cap' | 'dsr' | 'banned'

export interface LoanResult {
  /** LTV 기준액(만원) */
  ltv: number
  /** 가격 구간 한도(만원). 적용 안 되는 지역은 null */
  cap: number | null
  /** DSR 기준액(만원). 계산 불가(연소득 0·미입력)는 null */
  dsr: number | null
  /** 대출 가능액 = min(LTV, 한도, DSR) (만원) */
  available: number
  /** 실제로 적용된 값(화면 강조 대상) */
  binding: LoanBinding
  /** DSR 계산에 쓴 금리(입력 + 스트레스 × 반영비율) % */
  dsrRatePct: number
  /** 생애최초 LTV 가 적용됐는지(무주택일 때만) */
  firstTimeApplied: boolean
  notices: NoticeCode[]
}

export interface CostResult {
  /** 모두 원 */
  acquisitionTax: number
  firstTimeRelief: number
  educationTax: number
  ruralSpecialTax: number
  brokerage: number
  legalRegistration: number
  moving: number
  total: number
  /** 적용 취득세율 bp (167 = 1.67%) */
  acquisitionRateBp: number
  notices: NoticeCode[]
}

export interface NeedResult {
  price: number // 만원
  loan: LoanResult
  costs: CostResult
  /** 필요 자금(원) = 가격 − 대출 가능액 + 부대비용 */
  needWon: number
  /** 종잣돈 − 필요 자금(원). 종잣돈 미입력이면 null */
  balanceWon: number | null
  notices: NoticeCode[]
}

const MAN = 10000

function assertPrice(price: number) {
  if (!Number.isInteger(price) || price <= 0) throw new RangeError(`price(만원)는 양의 정수여야 합니다: ${price}`)
}

function isFirstTimeApplied(profile: BuyerProfile): boolean {
  // Q10: 생애최초는 무주택일 때만. 엔진도 방어적으로 무시한다.
  return profile.isFirstTimeBuyer && profile.houseCount === 0
}

/** 구간 표 [{max_price(이하)|below_price(미만), …}] 에서 가격에 맞는 행 */
function pickBracket(brackets: unknown, price: number, key: string): Record<string, unknown> {
  if (!Array.isArray(brackets)) throw new PolicyError(`policy_rules ${key}.brackets 가 없습니다`)
  for (const b of brackets as Record<string, unknown>[]) {
    if ('max_price' in b) {
      if (b.max_price === null || price <= (b.max_price as number)) return b
    } else if ('below_price' in b) {
      if (b.below_price === null || price < (b.below_price as number)) return b
    }
  }
  throw new PolicyError(`policy_rules ${key} 에 가격 ${price}만원 구간이 없습니다`)
}

// ---------------------------------------------------------------------------
// 대출
// ---------------------------------------------------------------------------

/**
 * DSR 기준액(만원): (연소득 × DSR한도 − 기존 연간 원리금)을 월 상환액으로 보고 원리금균등으로 역산한 원금.
 * 연소득 0·미입력이면 null(계산 불가). 여력이 0 이하면 0.
 */
export function dsrPrincipal(
  annualIncome: number | null,
  existingAnnualDebt: number,
  dsrLimitBp: number,
  ratePct: number,
  termYears: number,
): number | null {
  if (annualIncome === null || annualIncome <= 0) return null
  const capacityWon = annualIncome * dsrLimitBp - existingAnnualDebt * MAN // income×10000×bp/10000
  if (capacityWon <= 0) return 0
  const monthly = capacityWon / 12
  const n = Math.round(termYears * 12)
  const r = ratePct / 100 / 12
  const principalWon = r === 0 ? monthly * n : (monthly * (1 - Math.pow(1 + r, -n))) / r
  return Math.floor(principalWon / MAN)
}

export function computeLoan(policy: Policy, profile: BuyerProfile, region: Region, price: number): LoanResult {
  assertPrice(price)
  const notices: NoticeCode[] = []
  const firstTimeApplied = isFirstTimeApplied(profile)

  // 2주택 이상
  const multi = profile.houseCount >= 2 ? requireRule(policy, 'ltv.multi_house', region) : null
  const banned = multi?.banned === true

  // LTV
  const ltvKey = firstTimeApplied ? 'ltv.first_time' : 'ltv.base'
  const ltvBp = pctToBp(num(requireRule(policy, ltvKey, region), 'rate_pct', ltvKey))
  const ltv = banned ? 0 : Math.floor((price * ltvBp) / 10000)
  if (profile.houseCount === 1) notices.push('disposalCondition')

  // 가격 구간 한도 (설정이 없는 지역은 적용 안 함)
  const capRule = lookup(policy, 'loan.price_cap', region) as { brackets?: unknown } | undefined
  const cap = capRule ? num(pickBracket(capRule.brackets, price, 'loan.price_cap'), 'cap', 'loan.price_cap') : null

  // DSR
  const limit = requireRule(policy, 'dsr.limit', region)
  const dsrLimitBp = pctToBp(num(limit, profile.lenderType === 'bank' ? 'bank_pct' : 'non_bank_pct', 'dsr.limit'))
  const stressPct = num(requireRule(policy, 'dsr.stress_rate', region), 'rate_pct', 'dsr.stress_rate')
  const stressRatioPct = num(requireRule(policy, 'dsr.stress_ratio', region), 'ratio_pct', 'dsr.stress_ratio')
  const baseRatePct = profile.interestRatePct ?? defaultRate(policy)
  const dsrRatePct = baseRatePct + (stressPct * stressRatioPct) / 100
  const dsr = dsrPrincipal(profile.annualIncome, profile.existingAnnualDebt, dsrLimitBp, dsrRatePct, profile.loanTermYears)
  notices.push(dsr === null ? 'dsrUnavailable' : 'stressRateType')

  let available: number
  let binding: LoanBinding
  if (banned) {
    available = 0
    binding = 'banned'
    notices.unshift('multiHouseBanned')
  } else {
    // 동률이면 LTV → 한도 → DSR 순으로 강조(값은 같다)
    available = ltv
    binding = 'ltv'
    if (cap !== null && cap < available) {
      available = cap
      binding = 'cap'
    }
    if (dsr !== null && dsr < available) {
      available = dsr
      binding = 'dsr'
    }
  }

  return { ltv, cap, dsr, available, binding, dsrRatePct, firstTimeApplied, notices }
}

function defaultRate(policy: Policy): number {
  const v = requireRule(policy, 'loan.default_interest_rate', { isCapital: false, isRegulated: false })
  return num(v, 'rate_pct', 'loan.default_interest_rate')
}

// ---------------------------------------------------------------------------
// 부대비용
// ---------------------------------------------------------------------------

/** 일반세율 취득세율(bp). 직선 보간 구간은 bp 정수로 반올림(= 비율 소수 다섯째 자리 반올림, Q1). */
export function generalAcquisitionRateBp(policy: Policy, region: Region, price: number): number {
  const rule = requireRule(policy, 'tax.acquisition.general', region)
  const brackets = rule.brackets as Record<string, unknown>[]
  const b = pickBracket(brackets, price, 'tax.acquisition.general')
  if (typeof b.rate_pct === 'number') return pctToBp(b.rate_pct)
  // 직선 보간: 앞 구간 상한(lo) ~ 이 구간 상한(hi)
  const idx = brackets.indexOf(b)
  const lo = idx > 0 ? (brackets[idx - 1].max_price as number) : 0
  const hi = b.max_price as number
  const fromBp = pctToBp(num(b, 'linear_from_pct', 'tax.acquisition.general'))
  const toBp = pctToBp(num(b, 'linear_to_pct', 'tax.acquisition.general'))
  const numer = (price - lo) * (toBp - fromBp)
  const denom = hi - lo
  return fromBp + Math.floor((2 * numer + denom) / (2 * denom)) // 반올림(half-up), 정수 연산
}

export function computeCosts(
  policy: Policy,
  profile: BuyerProfile,
  region: Region,
  price: number,
  exclusiveArea: number,
): CostResult {
  assertPrice(price)
  const notices: NoticeCode[] = []
  const heavy = profile.houseCount >= 2

  // 취득세: 무주택·1주택(일시적 2주택, Q4)은 일반세율, 2주택+ 보유는 중과(Q5)
  const acquisitionRateBp = heavy
    ? pctToBp(num(requireRule(policy, 'tax.acquisition.multi_owner', region), 'rate_pct', 'tax.acquisition.multi_owner'))
    : generalAcquisitionRateBp(policy, region, price)
  const acquisitionTax = price * acquisitionRateBp // 원 = price×10000×bp/10000
  if (profile.houseCount === 1 && region.isRegulated) notices.push('temporaryTwoHouseTax')
  if (heavy && !region.isRegulated) notices.push('threePlusHouseTax')

  // 생애최초 감면: 취득세 본세만(Q6)
  let firstTimeRelief = 0
  if (isFirstTimeApplied(profile)) {
    const relief = requireRule(policy, 'tax.first_time_relief', region)
    if (price <= num(relief, 'max_price', 'tax.first_time_relief')) {
      firstTimeRelief = Math.min(acquisitionTax, num(relief, 'max_amount_won', 'tax.first_time_relief'))
    }
  }

  // 지방교육세
  const edu = requireRule(policy, 'tax.local_education', region)
  const educationTax = heavy
    ? price * pctToBp(num(edu, 'heavy_rate_pct', 'tax.local_education'))
    : Math.floor((price * acquisitionRateBp * pctToBp(num(edu, 'general_ratio_pct', 'tax.local_education'))) / 10000)

  // 농어촌특별세: 전용 85㎡ 초과만
  const rural = requireRule(policy, 'tax.rural_special', region)
  let ruralSpecialTax = 0
  if (exclusiveArea > num(rural, 'exempt_max_area_m2', 'tax.rural_special')) {
    let rateBp: number
    if (heavy) {
      const byRate = rural.heavy_rate_pct as Record<string, unknown> | undefined
      const v = byRate?.[String(acquisitionRateBp / 100)]
      if (typeof v !== 'number') throw new PolicyError(`policy_rules tax.rural_special.heavy_rate_pct 에 ${acquisitionRateBp / 100}% 값이 없습니다`)
      rateBp = pctToBp(v)
    } else {
      rateBp = pctToBp(num(rural, 'general_rate_pct', 'tax.rural_special'))
    }
    ruralSpecialTax = price * rateBp
  }

  // 중개보수(상한)
  const brk = pickBracket(requireRule(policy, 'fee.brokerage', region).brackets, price, 'fee.brokerage')
  let brokerage = price * pctToBp(num(brk, 'rate_pct', 'fee.brokerage'))
  if (typeof brk.cap_won === 'number') brokerage = Math.min(brokerage, brk.cap_won)

  // 법무·등기비(설정값), 이사비(입력)
  const legalRegistration = price * pctToBp(num(requireRule(policy, 'fee.legal_registration', region), 'rate_pct', 'fee.legal_registration'))
  const moving = profile.includeMovingCost ? profile.movingCost * MAN : 0

  const total = acquisitionTax - firstTimeRelief + educationTax + ruralSpecialTax + brokerage + legalRegistration + moving
  return {
    acquisitionTax,
    firstTimeRelief,
    educationTax,
    ruralSpecialTax,
    brokerage,
    legalRegistration,
    moving,
    total,
    acquisitionRateBp,
    notices,
  }
}

// ---------------------------------------------------------------------------
// 필요 자금
// ---------------------------------------------------------------------------

export function computeNeed(
  policy: Policy,
  profile: BuyerProfile,
  region: Region,
  price: number,
  exclusiveArea: number,
): NeedResult {
  const loan = computeLoan(policy, profile, region, price)
  const costs = computeCosts(policy, profile, region, price, exclusiveArea)
  const needWon = price * MAN - loan.available * MAN + costs.total
  const balanceWon = profile.seedMoney === null ? null : profile.seedMoney * MAN - needWon
  return { price, loan, costs, needWon, balanceWon, notices: [...loan.notices, ...costs.notices] }
}

/** 기준가가 구간(최근 6개월 최저~최고)이면 양 끝을 각각 계산한다(Q11). 같으면 low === high 값. */
export function computeNeedRange(
  policy: Policy,
  profile: BuyerProfile,
  region: Region,
  minPrice: number,
  maxPrice: number,
  exclusiveArea: number,
): { low: NeedResult; high: NeedResult } {
  if (minPrice > maxPrice) throw new RangeError(`minPrice > maxPrice: ${minPrice} > ${maxPrice}`)
  const low = computeNeed(policy, profile, region, minPrice, exclusiveArea)
  const high = minPrice === maxPrice ? low : computeNeed(policy, profile, region, maxPrice, exclusiveArea)
  return { low, high }
}

/** 화면 표시용 필요 자금(만원): 만원 미만 올림(Q8). */
export function displayNeed(needWon: number): number {
  return Math.ceil(needWon / MAN)
}

export type Balance = { kind: 'short'; manwon: number } | { kind: 'enough'; manwon: number }

/** 화면 표시용 부족/여유(만원): 부족은 올림, 여유는 내림, 0원은 "여유 0원"(Q8·Q11). */
export function displayBalance(balanceWon: number): Balance {
  if (balanceWon < 0) return { kind: 'short', manwon: Math.ceil(-balanceWon / MAN) }
  return { kind: 'enough', manwon: Math.floor(balanceWon / MAN) }
}

/** 내 조건이 계산에 쓸 만큼 입력됐는지(NEED-07: 아니면 "조건을 입력하세요"). */
export function isProfileReady(profile: BuyerProfile | null): profile is BuyerProfile {
  return profile !== null && profile.seedMoney !== null
}
