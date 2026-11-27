/**
 * policy_rules 행 → 계산 엔진이 쓰는 설정값(Policy). 순수 함수.
 * 규제·세율 숫자는 코드에 두지 않고 모두 여기서 읽는다(명세 5절).
 *
 * region_scope 선택: 규제지역이면 regulated → capital → all, 수도권이면 capital → all, 그 외는 all.
 * 같은 key·scope 에 유효한 행이 여럿이면 시행일이 가장 늦은 행을 쓴다.
 */

export type RegionScope = 'regulated' | 'capital' | 'all'

export interface Region {
  /** 수도권(서울·인천·경기) */
  isCapital: boolean
  /** 투기과열·조정대상지역(= 조정지역) */
  isRegulated: boolean
}

export interface PolicyRuleRow {
  key: string
  region_scope: string
  value: unknown
  effective_from: string // YYYY-MM-DD
  effective_to: string | null
  checked_on: string | null
  verified?: boolean
}

export interface Policy {
  /** key → scope → value */
  readonly values: ReadonlyMap<string, ReadonlyMap<string, unknown>>
  /** 화면의 "규제 기준일" — 적용 중인 행의 출처 확인일 중 가장 최근 값 */
  readonly regulationDate: string | null
}

export class PolicyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PolicyError'
  }
}

/** onDate(YYYY-MM-DD) 기준으로 유효한 행만 모아 Policy 를 만든다. */
export function buildPolicy(rows: readonly PolicyRuleRow[], onDate: string): Policy {
  const chosen = new Map<string, PolicyRuleRow>()
  for (const row of rows) {
    if (row.effective_from > onDate) continue
    if (row.effective_to !== null && row.effective_to < onDate) continue
    const id = `${row.key}\u0000${row.region_scope}`
    const prev = chosen.get(id)
    if (!prev || prev.effective_from < row.effective_from) chosen.set(id, row)
  }
  const values = new Map<string, Map<string, unknown>>()
  let regulationDate: string | null = null
  for (const row of chosen.values()) {
    let byScope = values.get(row.key)
    if (!byScope) values.set(row.key, (byScope = new Map()))
    byScope.set(row.region_scope, row.value)
    if (row.checked_on && (regulationDate === null || row.checked_on > regulationDate)) {
      regulationDate = row.checked_on
    }
  }
  return { values, regulationDate }
}

export function scopeChain(region: Region): RegionScope[] {
  const chain: RegionScope[] = []
  if (region.isRegulated) chain.push('regulated')
  if (region.isCapital) chain.push('capital')
  chain.push('all')
  return chain
}

/** 지역에 맞는 가장 구체적인 값. 없으면 undefined. */
export function lookup(policy: Policy, key: string, region: Region): unknown {
  const byScope = policy.values.get(key)
  if (!byScope) return undefined
  for (const scope of scopeChain(region)) {
    if (byScope.has(scope)) return byScope.get(scope)
  }
  return undefined
}

/** 지역에 맞는 값. 없으면 PolicyError (설정 누락은 조용히 넘기지 않는다). */
export function requireRule(policy: Policy, key: string, region: Region): Record<string, unknown> {
  const v = lookup(policy, key, region)
  if (v === undefined || v === null || typeof v !== 'object') {
    throw new PolicyError(`policy_rules 에 ${key} 값이 없습니다`)
  }
  return v as Record<string, unknown>
}

export function num(obj: Record<string, unknown>, field: string, key: string): number {
  const v = obj[field]
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new PolicyError(`policy_rules ${key}.${field} 가 숫자가 아닙니다`)
  }
  return v
}

/** 퍼센트(40, 0.6, 0.75 …) → 정수 bp(1/100 %). 엔진의 금액 계산은 bp 정수로 한다. */
export function pctToBp(pct: number): number {
  return Math.round(pct * 100)
}

/** 규제지역 판정: 시군구 코드가 region.regulated_sigungu 목록에 있는지. */
export function isRegulatedSigungu(policy: Policy, sigunguCode: string): boolean {
  const v = lookup(policy, 'region.regulated_sigungu', { isCapital: false, isRegulated: false })
  const codes = (v as { codes?: unknown } | undefined)?.codes
  return Array.isArray(codes) && codes.includes(sigunguCode)
}

/** 단지의 지역 판정(명세 5절). 수도권 여부는 sigungu_codes.is_capital_area 에서 받는다. */
export function regionOf(policy: Policy, sigunguCode: string, isCapitalArea: boolean): Region {
  return { isCapital: isCapitalArea, isRegulated: isRegulatedSigungu(policy, sigunguCode) }
}

/** 내 조건 금리 입력 기본값(%). 설정이 없으면 null. */
export function defaultInterestRatePct(policy: Policy): number | null {
  const v = lookup(policy, 'loan.default_interest_rate', { isCapital: false, isRegulated: false })
  const rate = (v as { rate_pct?: unknown } | undefined)?.rate_pct
  return typeof rate === 'number' ? rate : null
}
