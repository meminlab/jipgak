# jipgak
집각 — 실거래가 지도 + 내 종잣돈·대출로 살 수 있는 아파트 단지 관리

- 명세: [`docs/spec-mvp.md`](docs/spec-mvp.md) (명세 기준 문서)
- 디자인 기준: [`docs/design.md`](docs/design.md) (토큰은 `src/index.css`)
- 스택: React + Vite PWA / Supabase (Postgres·Auth·Edge Functions) / Cloudflare Pages

## 실행

```bash
npm install
cp .env.example .env.local   # 값 채우기 (브라우저 노출 가능 키만)
npm run dev
```

| 명령 | 내용 |
|---|---|
| `npm run dev` | 개발 서버 |
| `npm run build` | 타입 검사 + 운영 빌드(`dist/`, PWA 서비스워커 포함) |
| `npm test` | 단위 테스트(Vitest) |
| `npm run lint` | lint(oxlint) |
| `npm run db:test` | DB 스키마·RLS 테스트(pgTAP, 로컬 Supabase 필요) |

## 환경변수 (명세 10절)

| 이름 | 위치 | 노출 |
|---|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Cloudflare Pages / `.env.local` | 브라우저 |
| `VITE_KAKAO_JS_KEY` | Cloudflare Pages / `.env.local` | 브라우저(도메인 제한) |
| `DATA_GO_KR_KEY`, `KAKAO_REST_KEY` | Supabase Edge Function secrets | 서버 전용 |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase 내부 | 서버 전용 |
| `SUPABASE_DB_URL` | GitHub repo Secrets | 서버 전용 |

서버 전용 키에는 `VITE_` 접두사를 붙이지 않습니다(붙이면 번들에 들어갑니다). 값은 커밋·댓글에 쓰지 않습니다.

## 로컬 DB

Docker가 필요합니다. 포트는 다른 로컬 프로젝트와 겹치지 않게 554xx를 씁니다(API 55421, DB 55422).

```bash
npx supabase start -x realtime,storage-api,imgproxy,edge-runtime,logflare,vector,studio,postgres-meta,supavisor,mailpit
npx supabase db reset      # 마이그레이션 다시 적용
npm run db:test            # 스키마·RLS 테스트
npx supabase gen types typescript --local > src/lib/database.types.ts   # 스키마 바뀌면 타입 갱신
npx supabase stop
```

## 구조

```
src/lib/repo.ts             저장소 접근 모음 (화면은 여기만 사용: 로그인·내 조건·policy_rules)
src/lib/supabase.ts         Supabase 클라이언트 생성(anon 키)
src/lib/calc/               계산 엔진(순수 함수): policy.ts 설정값 해석, engine.ts 대출·부대비용·필요 자금, notices.ts 안내 문구
src/lib/profileForm.ts      내 조건 폼 ↔ user_profile 변환·검증(순수 함수)
src/lib/env.ts              브라우저 노출 환경변수 읽기
src/lib/money.ts            금액 표시(억·만원)
src/screens/                화면(로그인, 내 조건)
src/components/ui.tsx       공통 UI 조각(금액 입력·세그먼트·토글·안내)
supabase/migrations/        스키마(명세 4절) + policy_rules 초기값
supabase/tests/database/    pgTAP 스키마·RLS·시드 테스트
```

## 계산 엔진 (명세 5절)

- 규제·세율 숫자는 코드에 두지 않고 `policy_rules`에서 읽습니다. 초기값은 `supabase/migrations/20261127000000_policy_rules_seed.sql`입니다.
- 단위 테스트(`src/lib/calc/engine.test.ts`)는 QA 손계산 확정본 v1.1(BANB-64)의 케이스를 ID 그대로 재현합니다. 설정값은 시드 마이그레이션의 JSON을 그대로 읽으므로, 시드를 바꾸면 테스트가 바로 확인합니다.
- 금액은 만원 정수로 받고 원 단위로 계산합니다. 비율은 bp 정수로 바꿔 계산해 부동소수 오차를 막습니다(DSR 역산만 부동소수, 만원 미만 절사).
- 규제값을 바꿀 때: 기존 행에 `effective_to`를 넣고 새 시행일로 새 행을 추가하는 마이그레이션을 만듭니다. 엔진은 오늘 유효한 행만 씁니다.

## DB 설계 메모 (명세 4절)

- 금액은 `integer` 만원, 날짜는 `date`, 면적은 `numeric(6,2)` ㎡.
- 단지명·주소는 `complexes`에만 있습니다. 실거래 행은 `area_type_id`만 참조합니다.
- `trades_recent`(최근 24개월)는 중복 방지 유니크 인덱스 1개만 둡니다: `(area_type_id, contract_date, price, floor, dong) NULLS NOT DISTINCT`. 해제는 같은 키로 upsert해 `cancelled_on`을 채웁니다.
- `trades_archive`(25개월~7년)는 `(area_type_id, year)`별 `bigint[]`로 저장합니다. 거래 1건 = bigint 1개(가격·일자·층·플래그 비트 묶음). 인코딩은 `pack_archived_trade()`, 디코딩은 뷰가 합니다.
- 화면은 `trades_7y` 뷰로 7년 실거래를 한 번에 읽습니다(`area_type_id`로 걸러 조회).
- RLS: 실거래·단지·설정은 누구나 읽기(쓰기는 service_role만), `user_*`는 본인 행만, `ops_metrics`는 로그인 사용자 읽기.
- 로컬 합성 데이터 실측(명세 기획안 건수: 최근 53만 건 + 아카이브 119만 건/30만 행 + 단지 2.5만 + 평형 10만): 데이터 약 117MB. 실제 분포로는 실거래 수집 이슈에서 1개월 적재 후 다시 잽니다.
