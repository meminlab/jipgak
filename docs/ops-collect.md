## 실거래 수집 운영 (BANB-66)

명세 3·4·6·7절의 실거래 수집을 어떻게 돌리는지 정리한다. 값(키·비밀)은 이 문서·커밋·댓글에 쓰지 않는다.

### 구성
| 무엇 | 어디 | 하는 일 |
|---|---|---|
| `collect-trades` Edge Function | `supabase/functions/collect-trades` | 공공데이터 API 호출 → `ingest_trades()` 적재 → `ops_metrics` 기록 |
| 응답 해석(순수 함수) | `supabase/functions/_shared/rtms.ts` | XML 파싱, `dealAmount` 쉼표 제거, 해제(`cdealType=O`)·등기일 변환, 작업 목록 계산. 단위 테스트 있음 |
| DB 함수 | `supabase/migrations/20261127000000_trades_collect.sql` | `ingest_trades` / `refresh_area_type_summary` / `archive_trades` / `log_ops_metric` (service_role 전용) + 수도권 시군구 시드 |
| cron | `supabase/scripts/schedule_collect.sql` | 일일 갱신·최초 적재·월 이관 스케줄 (운영 DB 에 1회 실행) |

### 모드
- `daily`: 이번 달 포함 최근 3개월을 다시 받는다. 신규 거래는 추가되고 해제는 같은 키로 덮어써 `cancelled_on`이 채워진다.
- `backfill`: 84개월(7년)을 최근 달부터 받는다. 호출마다 끝난 `시군구:월`을 `ops_metrics.detail.done`에 남기고, 다음 호출은 남은 것부터 받는다. 호출이 끝날 때마다 `archive_trades()`로 24개월 지난 달을 배열로 압축한다.
- 특정 시군구·월만: `{"mode":"backfill","codes":["11680"],"months":["202610"]}` (run = `manual:날짜`)
- 한도 초과·인증 오류면 그 호출은 즉시 멈추고 기록한다. 다음 cron 호출이 이어서 시도한다(명세 6절).

### 처음 배포 (QA 통과 후, 머지 직전)
1. 마이그레이션 적용: `supabase db push` (운영 DB)
2. 함수 비밀: `supabase secrets set CRON_SECRET=<임의 긴 값>` (`DATA_GO_KR_KEY`는 이미 등록됨)
3. 함수 배포: `supabase functions deploy collect-trades` (config.toml 의 `verify_jwt = false` 반영)
4. Vault 비밀 2개 등록 후 `supabase/scripts/schedule_collect.sql` 실행
5. 확인: `select job, recorded_at, error_count, detail->>'stopped', detail->>'remaining' from ops_metrics order by id desc limit 10;`
6. 최초 적재가 끝나면(`trades_backfill` 에 `complete: true`) `select cron.unschedule('collect-trades-backfill');`

### 첫 실데이터에서 확인할 것
- 시군구 코드 개편(2026-02 화성 4개 구, 2026-07 인천 제물포·영종·서해·검단): 신설 코드로 과거 달이 조회되는지, 구 코드(41590·28110·28140·28260)로만 나오는지 1개월씩 대조한다. 구 코드로만 나오면 해당 구 코드의 `is_collected`를 켠다. 같은 거래가 양쪽에 다 나오면 켜지 않는다(단지 중복 방지).
- `cdealDay`·`rgstDate` 날짜 형식, 해제 거래 표시값.

### 용량
- `ops_metrics.db_size_bytes`에 호출마다 DB 용량이 남는다. 화면 표시·350MB 경고는 BANB-71.
- 실거래 1건당 크기(로컬 합성 데이터 실측, 인덱스 포함): `trades_recent` 약 93B, `trades_archive` 약 26B.
