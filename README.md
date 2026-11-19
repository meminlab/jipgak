# jipgak
집각 — 실거래가 지도 + 내 종잣돈·대출로 살 수 있는 아파트 단지 관리

- 명세: [`docs/spec-mvp.md`](docs/spec-mvp.md) (명세 기준 문서)
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
src/lib/supabase.ts         저장소 접근 단일 모듈 (화면은 여기만 사용)
src/lib/env.ts              브라우저 노출 환경변수 읽기
src/lib/money.ts            금액 표시(억·만원)
supabase/migrations/        스키마 (명세 4절)
supabase/tests/database/    pgTAP 스키마·RLS 테스트
```

## DB 설계 메모 (명세 4절)

- 금액은 `integer` 만원, 날짜는 `date`, 면적은 `numeric(6,2)` ㎡.
- 단지명·주소는 `complexes`에만 있습니다. 실거래 행은 `area_type_id`만 참조합니다.
- `trades_recent`(최근 24개월)는 중복 방지 유니크 인덱스 1개만 둡니다: `(area_type_id, contract_date, price, floor, dong) NULLS NOT DISTINCT`. 해제는 같은 키로 upsert해 `cancelled_on`을 채웁니다.
- `trades_archive`(25개월~7년)는 `(area_type_id, year)`별 `bigint[]`로 저장합니다. 거래 1건 = bigint 1개(가격·일자·층·플래그 비트 묶음). 인코딩은 `pack_archived_trade()`, 디코딩은 뷰가 합니다.
- 화면은 `trades_7y` 뷰로 7년 실거래를 한 번에 읽습니다(`area_type_id`로 걸러 조회).
- RLS: 실거래·단지·설정은 누구나 읽기(쓰기는 service_role만), `user_*`는 본인 행만, `ops_metrics`는 로그인 사용자 읽기.
- 로컬 합성 데이터 실측(명세 기획안 건수: 최근 53만 건 + 아카이브 119만 건/30만 행 + 단지 2.5만 + 평형 10만): 데이터 약 117MB. 실제 분포로는 실거래 수집 이슈에서 1개월 적재 후 다시 잽니다.
