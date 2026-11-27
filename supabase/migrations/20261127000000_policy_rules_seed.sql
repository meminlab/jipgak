-- policy_rules 초기값 (BANB-65) — 데이터만 넣는다. 스키마 변경 없음.
--
-- 값의 근거: BANB-61 첫 보고 댓글의 규제 표(기준일 2026-11-19) + 명세 해석 확정(BANB-64 Q1~Q11).
-- 단위 규칙
--   * 비율은 퍼센트 숫자(rate_pct 40 = 40%). 엔진이 정수 bp(1/100 %)로 바꿔 정수 연산한다.
--   * 가격·한도는 만원 int, *_won 은 원.
--   * 구간: max_price = 이하(포함), below_price = 미만(제외). null = 상한 없음.
-- region_scope: regulated(규제지역) / capital(수도권) / all(나머지 전체).
--   엔진은 regulated → capital → all 순서로 가장 구체적인 행을 쓴다.
-- verified=false: BANB-61 표에서 ⚠️ 표시였던 항목(지방 스트레스 금리, 다주택 세부, 생애최초 감면 한도)과
--   출처 없이 추정한 설정값(기본 금리, 법무·등기비). 원문 확인 후 기획이 갱신한다.
--
-- 아래 $seed$ … $seed$ 안의 JSON 은 단위 테스트(src/lib/calc/seed.test.ts)가 그대로 읽어
-- QA 손계산 케이스(tc-calc-engine-v1.1)를 검증한다. 형식을 바꾸면 테스트도 함께 바꾼다.

insert into public.policy_rules
  (key, region_scope, value, effective_from, effective_to, source_url, checked_on, verified, note)
select key, region_scope, value, effective_from, effective_to, source_url, checked_on, verified, note
from jsonb_to_recordset($seed$
[
  {
    "key": "region.regulated_sigungu", "region_scope": "all",
    "value": {
      "codes": [
        "11110","11140","11170","11200","11215","11230","11260","11290","11305","11320","11350","11380","11410",
        "11440","11470","11500","11530","11545","11560","11590","11620","11650","11680","11710","11740",
        "41290","41210","41131","41133","41135","41111","41115","41117","41173","41430","41450","41463","41465","41310"
      ],
      "pending": [
        { "name": "경기 화성시 동탄구", "reason": "2026 일반구 신설로 시군구 코드 미확인. 실거래 수집(BANB-66)에서 코드 확인 후 codes 에 추가" }
      ]
    },
    "effective_from": "2026-07-01", "effective_to": null,
    "source_url": "https://www.molit.go.kr/USR/NEWS/m_71/dtl.jsp?id=95092167",
    "checked_on": "2026-11-19", "verified": false,
    "note": "투기과열+조정대상지역(조정지역 = 이 목록). 서울 25개 구 + 경기 15곳(2025.10.16 지정, 2026.7.1 추가, 국토부 공고 제2026-882호 2차 출처). 화성 동탄구 코드가 빠져 있어 verified=false"
  },
  {
    "key": "ltv.base", "region_scope": "regulated",
    "value": { "rate_pct": 40 },
    "effective_from": "2025-10-16", "effective_to": null,
    "source_url": "https://kbthink.com/realestate/basics/8-13-housing-loans.html",
    "checked_on": "2026-11-19", "verified": true,
    "note": "무주택 규제지역 LTV. 1주택은 처분조건부로 같은 값(Q2)"
  },
  {
    "key": "ltv.base", "region_scope": "all",
    "value": { "rate_pct": 70 },
    "effective_from": "2025-10-16", "effective_to": null,
    "source_url": "https://kbthink.com/realestate/basics/8-13-housing-loans.html",
    "checked_on": "2026-11-19", "verified": true,
    "note": "무주택 비규제지역 LTV"
  },
  {
    "key": "ltv.first_time", "region_scope": "capital",
    "value": { "rate_pct": 70 },
    "effective_from": "2025-06-28", "effective_to": null,
    "source_url": "https://kbthink.com/realestate/basics/8-13-housing-loans.html",
    "checked_on": "2026-11-19", "verified": true,
    "note": "생애최초 규제·수도권 LTV. 6개월 안 전입 의무. 무주택일 때만 적용(Q10)"
  },
  {
    "key": "ltv.first_time", "region_scope": "all",
    "value": { "rate_pct": 80 },
    "effective_from": "2025-06-28", "effective_to": null,
    "source_url": "https://kbthink.com/realestate/basics/8-13-housing-loans.html",
    "checked_on": "2026-11-19", "verified": true,
    "note": "생애최초 비수도권 비규제 LTV (MVP 화면에서는 도달 불가)"
  },
  {
    "key": "ltv.multi_house", "region_scope": "capital",
    "value": { "banned": true },
    "effective_from": "2025-06-28", "effective_to": null,
    "source_url": "https://kbthink.com/realestate/basics/8-13-housing-loans.html",
    "checked_on": "2026-11-19", "verified": false,
    "note": "⚠️ 수도권·규제지역 2주택 이상 주담대 불가(6·27 대책). 세부 재확인 필요"
  },
  {
    "key": "ltv.multi_house", "region_scope": "all",
    "value": { "banned": false },
    "effective_from": "2025-06-28", "effective_to": null,
    "source_url": null,
    "checked_on": "2026-11-19", "verified": false,
    "note": "⚠️ 비수도권 다주택 LTV 세부 미확인 → 일반 LTV(ltv.base) 적용. MVP 화면에서는 도달 불가"
  },
  {
    "key": "loan.price_cap", "region_scope": "capital",
    "value": { "brackets": [
      { "max_price": 150000, "cap": 60000 },
      { "max_price": 250000, "cap": 40000 },
      { "max_price": null,   "cap": 20000 }
    ] },
    "effective_from": "2025-10-16", "effective_to": null,
    "source_url": "https://kbthink.com/realestate/basics/8-13-housing-loans.html",
    "checked_on": "2026-11-19", "verified": true,
    "note": "주담대 가격 구간 한도(만원). 시가 15억 이하 6억 / 25억 이하 4억 / 초과 2억. 수도권 전체 적용(Q3)"
  },
  {
    "key": "dsr.limit", "region_scope": "all",
    "value": { "bank_pct": 40, "non_bank_pct": 50 },
    "effective_from": "2026-11-19", "effective_to": null,
    "source_url": "https://www.fsc.go.kr/no010101/86606",
    "checked_on": "2026-11-19", "verified": true,
    "note": "차주 단위 DSR 한도. 은행 40% / 2금융권 50%. 시행일 미기록 → 기준일로 둠"
  },
  {
    "key": "dsr.stress_rate", "region_scope": "capital",
    "value": { "rate_pct": 3.0 },
    "effective_from": "2025-10-16", "effective_to": null,
    "source_url": "https://www.heraldk.com/article/2026062923213382321",
    "checked_on": "2026-11-19", "verified": true,
    "note": "수도권·규제지역 주담대 스트레스 금리 하한 3.0%"
  },
  {
    "key": "dsr.stress_rate", "region_scope": "all",
    "value": { "rate_pct": 0.75 },
    "effective_from": "2025-07-01", "effective_to": null,
    "source_url": "https://www.kukinews.com/article/view/kuk202606300123",
    "checked_on": "2026-11-19", "verified": false,
    "note": "⚠️ 지방 주담대 스트레스 금리. 2단계 유예 2026.12.31까지 연장. 0.75%p vs 1.5% 출처마다 다름. 2027년 값이 정해지면 기획이 이 행에 effective_to 를 넣고 새 행 추가"
  },
  {
    "key": "dsr.stress_ratio", "region_scope": "all",
    "value": { "ratio_pct": 100 },
    "effective_from": "2025-10-16", "effective_to": null,
    "source_url": null,
    "checked_on": "2026-11-19", "verified": true,
    "note": "스트레스 금리 반영비율 100% 고정(Q9). 고정·혼합형은 한도가 더 클 수 있음(화면 안내)"
  },
  {
    "key": "loan.default_interest_rate", "region_scope": "all",
    "value": { "rate_pct": 4.0 },
    "effective_from": "2026-11-19", "effective_to": null,
    "source_url": null,
    "checked_on": "2026-11-19", "verified": false,
    "note": "내 조건 금리 입력 기본값(추정, QA 케이스 기준값). 시장 금리 확인 후 기획이 갱신"
  },
  {
    "key": "tax.acquisition.general", "region_scope": "all",
    "value": { "brackets": [
      { "max_price": 60000, "rate_pct": 1 },
      { "max_price": 90000, "linear_from_pct": 1, "linear_to_pct": 3 },
      { "max_price": null,  "rate_pct": 3 }
    ] },
    "effective_from": "2020-01-01", "effective_to": null,
    "source_url": "https://www.law.go.kr/법령/지방세법",
    "checked_on": "2026-11-19", "verified": true,
    "note": "지방세법 §11①1호. 6~9억은 직선 보간 = (가액×2/3억−3)%, 비율 소수 다섯째 자리 반올림(Q1, 7억 → 1.67%). 무주택·1주택(일시적 2주택, Q4) 적용"
  },
  {
    "key": "tax.acquisition.multi_owner", "region_scope": "regulated",
    "value": { "rate_pct": 12 },
    "effective_from": "2020-08-12", "effective_to": null,
    "source_url": "https://www.law.go.kr/법령/지방세법",
    "checked_on": "2026-11-19", "verified": false,
    "note": "⚠️ 2주택 이상 보유자가 조정지역 취득(→3주택 이상) 12%. 지방세법 §13의2. 다주택 세부 재확인 필요"
  },
  {
    "key": "tax.acquisition.multi_owner", "region_scope": "all",
    "value": { "rate_pct": 8 },
    "effective_from": "2020-08-12", "effective_to": null,
    "source_url": "https://www.law.go.kr/법령/지방세법",
    "checked_on": "2026-11-19", "verified": false,
    "note": "⚠️ 2주택 이상 보유자가 비조정지역 취득 8%(Q5, 3주택 이상 보유 시 12%는 입력으로 구분 불가 → 안내)"
  },
  {
    "key": "tax.local_education", "region_scope": "all",
    "value": { "general_ratio_pct": 10, "heavy_rate_pct": 0.4 },
    "effective_from": "2020-08-12", "effective_to": null,
    "source_url": "https://www.law.go.kr/법령/지방세법",
    "checked_on": "2026-11-19", "verified": true,
    "note": "지방교육세. 일반세율 취득은 취득세율의 10%(0.1~0.3%), 중과(8·12%)는 0.4%"
  },
  {
    "key": "tax.rural_special", "region_scope": "all",
    "value": { "exempt_max_area_m2": 85, "general_rate_pct": 0.2, "heavy_rate_pct": { "8": 0.6, "12": 1.0 } },
    "effective_from": "2020-08-12", "effective_to": null,
    "source_url": "https://www.law.go.kr/법령/농어촌특별세법",
    "checked_on": "2026-11-19", "verified": true,
    "note": "농어촌특별세. 전용 85㎡ 이하 비과세, 초과 0.2%(중과 8% → 0.6%, 12% → 1.0%)"
  },
  {
    "key": "tax.first_time_relief", "region_scope": "all",
    "value": { "max_price": 120000, "max_amount_won": 2000000 },
    "effective_from": "2026-11-19", "effective_to": null,
    "source_url": "https://news.mtn.co.kr/news-detail/2026082616143273465",
    "checked_on": "2026-11-19", "verified": false,
    "note": "⚠️ 생애최초 취득세 감면: 12억 이하, 200만원 한도, 취득세 본세만(Q6). 40세 미만 300만원 확대안(2026.8 입법예고) 시행 여부 미확인. 시행일 미기록 → 기준일로 둠"
  },
  {
    "key": "fee.brokerage", "region_scope": "all",
    "value": { "brackets": [
      { "below_price": 5000,   "rate_pct": 0.6, "cap_won": 250000 },
      { "below_price": 20000,  "rate_pct": 0.5, "cap_won": 800000 },
      { "below_price": 90000,  "rate_pct": 0.4 },
      { "below_price": 120000, "rate_pct": 0.5 },
      { "below_price": 150000, "rate_pct": 0.6 },
      { "below_price": null,   "rate_pct": 0.7 }
    ] },
    "effective_from": "2021-10-19", "effective_to": null,
    "source_url": "https://www.law.go.kr/법령/공인중개사법시행규칙",
    "checked_on": "2026-11-19", "verified": true,
    "note": "주택 매매 중개보수 상한 요율(부가세 제외). 2억 미만 구간 추가(Q7)"
  },
  {
    "key": "fee.legal_registration", "region_scope": "all",
    "value": { "rate_pct": 0.2 },
    "effective_from": "2026-11-19", "effective_to": null,
    "source_url": null,
    "checked_on": "2026-11-19", "verified": false,
    "note": "법무·등기비 추정 설정값(가격의 0.2%, 명세 5절 [추정])"
  }
]
$seed$::jsonb) as x(
  key text, region_scope text, value jsonb, effective_from date, effective_to date,
  source_url text, checked_on date, verified boolean, note text
);
