import { describe, expect, it } from 'vitest'
import {
  buildRtmsUrl,
  classifyError,
  normalizeTrade,
  parseDealAmount,
  parseLooseDate,
  parseRtmsResponse,
  pendingTasks,
  recentMonths,
  seoulToday,
  taskKey,
} from './rtms.ts'

const OK_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<response><header><resultCode>000</resultCode><resultMsg>OK</resultMsg></header>
<body><items>
<item><aptDong>101</aptDong><aptNm>래미안 &amp; 힐</aptNm><aptSeq>11680-1234</aptSeq><bonbun>0012</bonbun><bubun>0000</bubun><buildYear>2015</buildYear><buyerGbn>개인</buyerGbn><cdealDay> </cdealDay><cdealType> </cdealType><dealAmount>   235,000</dealAmount><dealDay>1</dealDay><dealMonth>10</dealMonth><dealYear>2026</dealYear><dealingGbn>중개거래</dealingGbn><excluUseAr>84.9700</excluUseAr><floor>12</floor><jibun>12</jibun><rgstDate>26.10.28</rgstDate><sggCd>11680</sggCd><umdCd>10300</umdCd><umdNm>개포동</umdNm></item>
<item><aptDong/><aptNm>테스트</aptNm><aptSeq>11680-5678</aptSeq><bonbun>0003</bonbun><bubun>0001</bubun><buildYear>1998</buildYear><cdealDay>26.10.20</cdealDay><cdealType>O</cdealType><dealAmount>98,000</dealAmount><dealDay>15</dealDay><dealMonth>9</dealMonth><dealYear>2026</dealYear><dealingGbn>직거래</dealingGbn><excluUseAr>59.99</excluUseAr><floor>-1</floor><jibun>3-1</jibun><rgstDate></rgstDate><sggCd>11680</sggCd><umdCd>10600</umdCd><umdNm>대치동</umdNm></item>
</items><numOfRows>1000</numOfRows><pageNo>1</pageNo><totalCount>2</totalCount></body></response>`

const AUTH_XML = `<OpenAPI_ServiceResponse><cmmMsgHeader><errMsg>SERVICE ERROR</errMsg>
<returnAuthMsg>SERVICE_KEY_IS_NOT_REGISTERED_ERROR</returnAuthMsg><returnReasonCode>30</returnReasonCode></cmmMsgHeader></OpenAPI_ServiceResponse>`

const LIMIT_XML = `<response><header><resultCode>22</resultCode><resultMsg>LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR</resultMsg></header></response>`

describe('parseRtmsResponse', () => {
  it('정상 응답의 item 을 읽고 엔티티·빈 태그를 처리한다', () => {
    const p = parseRtmsResponse(OK_XML)
    expect(p.ok).toBe(true)
    expect(p.totalCount).toBe(2)
    expect(p.items).toHaveLength(2)
    expect(p.items[0].aptNm).toBe('래미안 & 힐')
    expect(p.items[1].aptDong).toBe('')
  })

  it('인증 오류(키 미등록)를 auth 로 분류한다', () => {
    const p = parseRtmsResponse(AUTH_XML)
    expect(p.ok).toBe(false)
    expect(p.errorKind).toBe('auth')
    expect(p.message).toContain('SERVICE_KEY_IS_NOT_REGISTERED')
  })

  it('한도 초과를 limit 으로 분류한다', () => {
    const p = parseRtmsResponse(LIMIT_XML)
    expect(p.ok).toBe(false)
    expect(p.errorKind).toBe('limit')
  })

  it('알 수 없는 응답은 other 오류', () => {
    const p = parseRtmsResponse('<html>gateway timeout</html>')
    expect(p.ok).toBe(false)
    expect(p.errorKind).toBe('other')
  })

  it('결과 0건 정상 응답', () => {
    const p = parseRtmsResponse(
      '<response><header><resultCode>000</resultCode><resultMsg>OK</resultMsg></header><body><items/><totalCount>0</totalCount></body></response>',
    )
    expect(p.ok).toBe(true)
    expect(p.items).toEqual([])
    expect(p.totalCount).toBe(0)
  })
})

describe('classifyError', () => {
  it('코드·메시지로 분류', () => {
    expect(classifyError('22', '')).toBe('limit')
    expect(classifyError('30', '')).toBe('auth')
    expect(classifyError('', 'SERVICE ACCESS DENIED ERROR')).toBe('auth')
    expect(classifyError('99', 'UNKNOWN')).toBe('other')
  })
})

describe('parseDealAmount', () => {
  it('쉼표·공백이 섞인 문자열을 만원 정수로', () => {
    expect(parseDealAmount('   235,000')).toBe(235000)
    expect(parseDealAmount('9,500')).toBe(9500)
    expect(parseDealAmount('1,234,567')).toBe(1234567)
  })
  it('비정상 값은 null', () => {
    expect(parseDealAmount('')).toBeNull()
    expect(parseDealAmount(undefined)).toBeNull()
    expect(parseDealAmount('12.5')).toBeNull()
    expect(parseDealAmount('0')).toBeNull()
  })
})

describe('parseLooseDate', () => {
  it('여러 형식을 ISO 날짜로', () => {
    expect(parseLooseDate('26.10.20')).toBe('2026-10-20')
    expect(parseLooseDate('2026.10.20')).toBe('2026-10-20')
    expect(parseLooseDate('2026-1-5')).toBe('2026-01-05')
    expect(parseLooseDate('20261020')).toBe('2026-10-20')
  })
  it('빈 값·잘못된 날짜는 null', () => {
    expect(parseLooseDate(' ')).toBeNull()
    expect(parseLooseDate('26.02.30')).toBeNull()
    expect(parseLooseDate('abc')).toBeNull()
  })
})

describe('normalizeTrade', () => {
  const [a, b] = parseRtmsResponse(OK_XML).items

  it('유효 중개거래', () => {
    expect(normalizeTrade(a)).toEqual({
      apt_seq: '11680-1234',
      apt_name: '래미안 & 힐',
      umd_code: '10300',
      umd_name: '개포동',
      jibun: '12',
      bonbun: 12,
      bubun: 0,
      build_year: 2015,
      exclusive_area: 84.97,
      contract_date: '2026-10-01',
      price: 235000,
      floor: 12,
      is_direct: false,
      cancelled_on: null,
      registered_on: '2026-10-28',
      dong: '101',
    })
  })

  it('해제된 직거래, 지하층, 동 없음', () => {
    const r = normalizeTrade(b)!
    expect(r.cancelled_on).toBe('2026-10-20')
    expect(r.is_direct).toBe(true)
    expect(r.floor).toBe(-1)
    expect(r.dong).toBeNull()
    expect(r.registered_on).toBeNull()
    expect(r.exclusive_area).toBe(59.99)
  })

  it('해제 표시인데 해제일이 없으면 계약일로 채운다', () => {
    expect(normalizeTrade({ ...b, cdealDay: '' })!.cancelled_on).toBe('2026-09-15')
  })

  it('필수값이 없으면 null', () => {
    expect(normalizeTrade({ ...a, aptSeq: ' ' })).toBeNull()
    expect(normalizeTrade({ ...a, dealAmount: '' })).toBeNull()
    expect(normalizeTrade({ ...a, excluUseAr: '' })).toBeNull()
    expect(normalizeTrade({ ...a, dealDay: '31', dealMonth: '9' })).toBeNull()
  })

  it('면적을 0.01㎡로 반올림', () => {
    expect(normalizeTrade({ ...a, excluUseAr: '84.975' })!.exclusive_area).toBe(84.98)
  })
})

describe('recentMonths / pendingTasks', () => {
  it('이번 달부터 거꾸로, 연도 경계 포함', () => {
    expect(recentMonths('2026-01-15', 3)).toEqual(['202601', '202512', '202511'])
    expect(recentMonths('2026-11-27', 84)).toHaveLength(84)
    expect(recentMonths('2026-11-27', 84).at(-1)).toBe('201912')
  })

  it('끝난 작업은 빼고 최근 달부터', () => {
    const done = new Set([taskKey('11110', '202611')])
    const t = pendingTasks(['11140', '11110'], ['202611', '202610'], done)
    expect(t.map((x) => x.key)).toEqual(['11140:202611', '11110:202610', '11140:202610'])
  })
})

describe('seoulToday', () => {
  it('UTC 15시 이후는 서울 기준 다음 날', () => {
    expect(seoulToday(new Date('2026-11-26T15:30:00Z'))).toBe('2026-11-27')
    expect(seoulToday(new Date('2026-11-26T14:59:00Z'))).toBe('2026-11-26')
  })
})

describe('buildRtmsUrl', () => {
  it('Decoding 키는 한 번만 인코딩, Encoding 키는 이중 인코딩하지 않는다', () => {
    const raw = 'ab+c/d=='
    const u1 = new URL(buildRtmsUrl(raw, '11680', '202610', 2))
    expect(u1.searchParams.get('serviceKey')).toBe(raw)
    expect(u1.searchParams.get('LAWD_CD')).toBe('11680')
    expect(u1.searchParams.get('DEAL_YMD')).toBe('202610')
    expect(u1.searchParams.get('pageNo')).toBe('2')
    const u2 = new URL(buildRtmsUrl(encodeURIComponent(raw), '11680', '202610', 1))
    expect(u2.searchParams.get('serviceKey')).toBe(raw)
  })
})
