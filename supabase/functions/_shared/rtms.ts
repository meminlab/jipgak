// 국토교통부_아파트 매매 실거래가 상세 자료(RTMSDataSvcAptTradeDev) 응답 처리 — 순수 함수만 둔다.
// Edge Function(Deno)과 vitest(Node) 양쪽에서 import 한다. 런타임 전용 API(Deno.*, fetch)는 쓰지 않는다.

export const RTMS_ENDPOINT =
  'https://apis.data.go.kr/1613000/RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev'

export const PAGE_SIZE = 1000

export type RtmsErrorKind = 'auth' | 'limit' | 'other'

export interface RtmsPage {
  ok: boolean
  code: string
  message: string
  errorKind: RtmsErrorKind | null
  totalCount: number
  items: Record<string, string>[]
}

/** ingest_trades() 가 받는 행 (마이그레이션 20261127000000 의 p_rows 원소) */
export interface TradeRow {
  apt_seq: string
  apt_name: string | null
  umd_code: string | null
  umd_name: string | null
  jibun: string | null
  bonbun: number | null
  bubun: number | null
  build_year: number | null
  exclusive_area: number
  contract_date: string // YYYY-MM-DD
  price: number // 만원
  floor: number | null
  is_direct: boolean
  cancelled_on: string | null
  registered_on: string | null
  dong: string | null
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

function decodeXml(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (m, e: string) => {
      if (e[0] === '#') {
        const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
        return Number.isFinite(n) ? String.fromCodePoint(n) : m
      }
      return ENTITIES[e.toLowerCase()] ?? m
    })
}

function tag(xml: string, name: string): string | null {
  const m = xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`))
  return m ? decodeXml(m[1]).trim() : null
}

/** 평평한 <item> 목록을 가진 XML 응답을 읽는다. 인증·한도 오류 응답(OpenAPI_ServiceResponse)도 처리한다. */
export function parseRtmsResponse(xml: string): RtmsPage {
  // 게이트웨이 오류 형식: <OpenAPI_ServiceResponse><cmmMsgHeader><returnAuthMsg>…</returnAuthMsg><returnReasonCode>30</returnReasonCode>
  const authMsg = tag(xml, 'returnAuthMsg')
  const reason = tag(xml, 'returnReasonCode')
  if (authMsg !== null || reason !== null) {
    const code = reason ?? ''
    const message = authMsg ?? tag(xml, 'errMsg') ?? 'SERVICE ERROR'
    return { ok: false, code, message, errorKind: classifyError(code, message), totalCount: 0, items: [] }
  }

  const code = tag(xml, 'resultCode')
  const message = tag(xml, 'resultMsg') ?? ''
  if (code === null) {
    return {
      ok: false,
      code: '',
      message: 'unexpected response: ' + xml.slice(0, 200),
      errorKind: 'other',
      totalCount: 0,
      items: [],
    }
  }
  if (!/^0+$/.test(code)) {
    return { ok: false, code, message, errorKind: classifyError(code, message), totalCount: 0, items: [] }
  }

  const items: Record<string, string>[] = []
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const item: Record<string, string> = {}
    for (const f of m[1].matchAll(/<([A-Za-z0-9_]+)>([\s\S]*?)<\/\1>/g)) {
      item[f[1]] = decodeXml(f[2])
    }
    // 빈 태그 <aptDong/> 는 빈 문자열로
    for (const f of m[1].matchAll(/<([A-Za-z0-9_]+)\s*\/>/g)) {
      item[f[1]] ??= ''
    }
    items.push(item)
  }
  const totalCount = Number(tag(xml, 'totalCount') ?? items.length) || 0
  return { ok: true, code, message, errorKind: null, totalCount, items }
}

export function classifyError(code: string, message: string): RtmsErrorKind {
  const m = message.toUpperCase()
  if (code === '22' || m.includes('LIMITED_NUMBER_OF_SERVICE_REQUESTS')) return 'limit'
  if (
    code === '30' ||
    code === '31' ||
    code === '32' ||
    code === '20' ||
    m.includes('SERVICE_KEY') ||
    m.includes('SERVICE ACCESS DENIED') ||
    m.includes('UNREGISTERED')
  ) {
    return 'auth'
  }
  return 'other'
}

/** "  82,500" → 82500 (만원). 숫자가 아니면 null */
export function parseDealAmount(raw: string | undefined): number | null {
  if (raw == null) return null
  const s = raw.replace(/[,\s]/g, '')
  if (!/^\d+$/.test(s)) return null
  const n = Number(s)
  return n > 0 ? n : null
}

function blank(raw: string | undefined): string | null {
  if (raw == null) return null
  const s = raw.trim()
  return s === '' ? null : s
}

function toInt(raw: string | undefined): number | null {
  const s = blank(raw)
  if (s === null || !/^-?\d+$/.test(s)) return null
  return Number(s)
}

function isoDate(y: number, m: number, d: number): string | null {
  if (!(y >= 1900 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null
  const dt = new Date(Date.UTC(y, m - 1, d))
  if (dt.getUTCMonth() !== m - 1) return null // 2/30 같은 날짜
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** 해제사유발생일·등기일자: "24.08.13" / "2024.08.13" / "2024-08-13" / "20240813" → "2024-08-13" */
export function parseLooseDate(raw: string | undefined): string | null {
  const s = blank(raw)
  if (s === null) return null
  let m = s.match(/^(\d{2}|\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})$/)
  if (!m) m = s.match(/^(\d{4})(\d{2})(\d{2})$/)
  if (!m) return null
  let y = Number(m[1])
  if (m[1].length === 2) y += 2000
  return isoDate(y, Number(m[2]), Number(m[3]))
}

/** API item 1건 → ingest_trades 행. 필수값(aptSeq·면적·계약일·가격)이 없으면 null */
export function normalizeTrade(item: Record<string, string>): TradeRow | null {
  const aptSeq = blank(item.aptSeq)
  const area = Number(blank(item.excluUseAr) ?? NaN)
  const price = parseDealAmount(item.dealAmount)
  const contract = isoDate(Number(item.dealYear), Number(item.dealMonth), Number(item.dealDay))
  if (aptSeq === null || !(area > 0) || price === null || contract === null) return null

  const cancelled = blank(item.cdealType) === 'O'
  return {
    apt_seq: aptSeq,
    apt_name: blank(item.aptNm),
    umd_code: blank(item.umdCd),
    umd_name: blank(item.umdNm),
    jibun: blank(item.jibun),
    bonbun: toInt(item.bonbun),
    bubun: toInt(item.bubun),
    build_year: toInt(item.buildYear),
    exclusive_area: Math.round(area * 100) / 100,
    contract_date: contract,
    price,
    floor: toInt(item.floor),
    is_direct: blank(item.dealingGbn) === '직거래',
    // 해제 표시(cdealType=O)인데 날짜가 없으면 계약일로 채워 "해제됨"을 잃지 않는다.
    cancelled_on: cancelled ? (parseLooseDate(item.cdealDay) ?? contract) : null,
    registered_on: parseLooseDate(item.rgstDate),
    dong: blank(item.aptDong),
  }
}

/** today 가 속한 달부터 거꾸로 n개월. 반환: ['202611', '202610', …] */
export function recentMonths(today: string, n: number): string[] {
  const [y, m] = today.split('-').map(Number)
  const out: string[] = []
  for (let i = 0; i < n; i++) {
    const idx = y * 12 + (m - 1) - i
    out.push(`${Math.floor(idx / 12)}${String((idx % 12) + 1).padStart(2, '0')}`)
  }
  return out
}

export type CollectMode = 'daily' | 'backfill'

/** 일일 갱신: 최근 3개월 / 최초 적재: 7년(84개월). 최근 달부터. */
export const MONTHS_BY_MODE: Record<CollectMode, number> = { daily: 3, backfill: 84 }

export function taskKey(code: string, ym: string): string {
  return `${code}:${ym}`
}

/**
 * 아직 끝나지 않은 (시군구, 월) 작업 목록. 월 순서(최근 → 과거) 우선, 같은 달 안에서는 코드 순.
 * 최초 적재 중 끊겨도 최근 데이터부터 채워진다.
 */
export function pendingTasks(
  codes: string[],
  months: string[],
  done: ReadonlySet<string>,
): { code: string; ym: string; key: string }[] {
  const out: { code: string; ym: string; key: string }[] = []
  for (const ym of months) {
    for (const code of [...codes].sort()) {
      const key = taskKey(code, ym)
      if (!done.has(key)) out.push({ code, ym, key })
    }
  }
  return out
}

/** Asia/Seoul 기준 오늘(YYYY-MM-DD). 수집 run 구분과 월 계산에 쓴다. */
export function seoulToday(now: Date = new Date()): string {
  const kst = new Date(now.getTime() + 9 * 3600 * 1000)
  return kst.toISOString().slice(0, 10)
}

export function buildRtmsUrl(serviceKey: string, lawdCd: string, ym: string, pageNo: number): string {
  // 공공데이터포털 "Decoding" 키를 받는다고 가정하고 한 번만 인코딩한다.
  // "Encoding" 키(이미 %xx 포함)가 들어오면 이중 인코딩되므로 먼저 디코딩한다.
  const key = /%[0-9A-Fa-f]{2}/.test(serviceKey) ? decodeURIComponent(serviceKey) : serviceKey
  const q = new URLSearchParams({
    serviceKey: key,
    LAWD_CD: lawdCd,
    DEAL_YMD: ym,
    pageNo: String(pageNo),
    numOfRows: String(PAGE_SIZE),
  })
  return `${RTMS_ENDPOINT}?${q.toString()}`
}
