-- 실거래 수집 함수 테스트 (BANB-66). 실행: npm run db:test (로컬 Supabase 필요)
begin;
create extension if not exists pgtap with schema extensions;

select plan(27);

-- ---------------------------------------------------------------------------
-- 시군구 시드
-- ---------------------------------------------------------------------------
select is((select count(*)::int from public.sigungu_codes where is_collected), 83,
  '수집 대상 수도권 시군구 83개(서울 25, 인천 11, 경기 47)');
select is((select count(*)::int from public.sigungu_codes where not is_active and is_collected), 0,
  '폐지 코드는 수집 대상 아님');
select is((select count(*)::int from public.sigungu_code_changes where old_code = '41590'), 4,
  '화성시 → 4개 구 매핑');
select ok((select bool_and(is_capital_area) from public.sigungu_codes), '모두 수도권 표시');

-- ---------------------------------------------------------------------------
-- 권한: anon/authenticated 는 수집 함수 실행 불가
-- ---------------------------------------------------------------------------
select ok(not has_function_privilege('anon', 'public.ingest_trades(text, jsonb, date)', 'execute'),
  'anon 은 ingest_trades 실행 불가');
select ok(not has_function_privilege('authenticated', 'public.archive_trades(date)', 'execute'),
  'authenticated 는 archive_trades 실행 불가');
select ok(has_function_privilege('service_role', 'public.ingest_trades(text, jsonb, date)', 'execute'),
  'service_role 은 ingest_trades 실행 가능');

-- ---------------------------------------------------------------------------
-- ingest_trades
-- ---------------------------------------------------------------------------
create temp table t_rows on commit drop as
select jsonb_build_array(
  -- 단지 A 84.97㎡: 유효 3건(그중 1건 동일 키 중복), 6개월 밖 1건
  jsonb_build_object('apt_seq','11680-1','apt_name','단지A','umd_code','10300','umd_name','개포동','jibun','12',
    'bonbun',12,'bubun',0,'build_year',2015,'exclusive_area',84.97,'contract_date','2026-10-01','price',235000,
    'floor',12,'is_direct',false,'cancelled_on',null,'registered_on','2026-10-28','dong','101'),
  jsonb_build_object('apt_seq','11680-1','apt_name','단지A','exclusive_area',84.97,'contract_date','2026-10-01',
    'price',235000,'floor',12,'is_direct',false,'dong','101'),
  jsonb_build_object('apt_seq','11680-1','apt_name','단지A','exclusive_area',84.97,'contract_date','2026-08-10',
    'price',228000,'floor',3,'is_direct',true,'dong',null),
  jsonb_build_object('apt_seq','11680-1','apt_name','단지A','exclusive_area',84.97,'contract_date','2026-03-02',
    'price',210000,'floor',7,'is_direct',false,'dong','102'),
  -- 단지 A 59.99㎡: 최근 1건은 해제
  jsonb_build_object('apt_seq','11680-1','apt_name','단지A','exclusive_area',59.99,'contract_date','2026-10-20',
    'price',180000,'floor',5,'is_direct',false,'cancelled_on','2026-11-02','dong','103'),
  jsonb_build_object('apt_seq','11680-1','apt_name','단지A','exclusive_area',59.99,'contract_date','2026-09-20',
    'price',170000,'floor',9,'is_direct',false,'dong','103'),
  -- 필수값 없는 행은 버린다
  jsonb_build_object('apt_seq','11680-2','apt_name','단지B','exclusive_area',null,'contract_date','2026-10-01','price',1)
) as rows;

select is(
  public.ingest_trades('11680', (select rows from t_rows), date '2026-11-27')
    - 'rows',
  '{"upserted": 5, "new_complexes": 1, "new_area_types": 2}'::jsonb,
  '첫 적재: 단지 1, 평형 2, 거래 5 (중복 1건 합침, 필수값 없는 1건 제외)');

select is((select count(*)::int from public.complexes), 1, '단지 B(면적 없음)는 만들지 않음');
select is((select sigungu_code from public.complexes where apt_seq = '11680-1'), '11680', '단지 시군구 = 요청 코드');

select is(
  public.ingest_trades('11680', (select rows from t_rows), date '2026-11-27') ->> 'upserted',
  '0', '같은 응답 재적재: 바뀐 것 없음');

-- 해제 반영: 84.97㎡ 2026-10-01 거래가 해제됨
select is(
  public.ingest_trades('11680', jsonb_build_array(
    jsonb_build_object('apt_seq','11680-1','exclusive_area',84.97,'contract_date','2026-10-01','price',235000,
      'floor',12,'is_direct',false,'cancelled_on','2026-11-20','registered_on','2026-10-28','dong','101')),
    date '2026-11-27') ->> 'upserted',
  '1', '해제는 같은 키로 upsert');

select is(
  (select cancelled_on from public.trades_recent r join public.area_types a on a.id = r.area_type_id
   where a.exclusive_area = 84.97 and r.contract_date = '2026-10-01'),
  date '2026-11-20', '해제일 저장');

-- 요약: 해제 제외
select results_eq(
  $$select latest_price, latest_date, min_price_6m, max_price_6m from public.area_types order by exclusive_area$$,
  $$values (170000, date '2026-09-20', 170000, 170000), (228000, date '2026-08-10', 228000, 228000)$$,
  '요약값: 해제 거래 제외, 6개월(2026-05-28~) 범위');

select ok((select bool_and(peak_price is null) from public.area_types), '전고점은 건드리지 않음(BANB-71)');

-- ---------------------------------------------------------------------------
-- archive_trades
-- ---------------------------------------------------------------------------
-- 과거 거래 추가: 2024-11(24개월 경계 밖), 2025-01(경계 안), 2019-11(84개월 밖), 2019-12(84개월 경계 안)
do $$ begin perform public.ingest_trades('11680', jsonb_build_array(
  jsonb_build_object('apt_seq','11680-1','exclusive_area',84.97,'contract_date','2024-11-15','price',200000,'floor',4,'is_direct',false,'dong','101'),
  jsonb_build_object('apt_seq','11680-1','exclusive_area',84.97,'contract_date','2024-11-30','price',201000,'floor',null,'is_direct',true,'cancelled_on','2024-12-10','dong',null),
  jsonb_build_object('apt_seq','11680-1','exclusive_area',84.97,'contract_date','2025-01-03','price',205000,'floor',8,'is_direct',false,'dong','101'),
  jsonb_build_object('apt_seq','11680-1','exclusive_area',84.97,'contract_date','2019-11-30','price',150000,'floor',2,'is_direct',false,'dong','101'),
  jsonb_build_object('apt_seq','11680-1','exclusive_area',84.97,'contract_date','2019-12-01','price',151000,'floor',2,'is_direct',false,'dong','101')
), date '2026-11-27'); end $$;

create temp table t_before on commit drop as
select area_type_id, contract_date, price, floor, is_direct, is_cancelled
from public.trades_7y where contract_date >= date '2019-12-01';

select is(
  public.archive_trades(date '2026-11-27') - 'recent_from' - 'keep_from',
  '{"moved_trades": 3, "deleted_archive_rows": 0, "trimmed_archive_rows": 0}'::jsonb,
  '24개월 지난 3건 이관(84개월 밖 1건은 버림)');

select is((select min(contract_date) from public.trades_recent), date '2025-01-03',
  'recent 에는 2024-12 이후만 남음');

select set_eq(
  $$select area_type_id, contract_date, price, floor, is_direct, is_cancelled from public.trades_7y$$,
  $$select * from t_before$$,
  '이관 전후 trades_7y 결과 동일(해제·층 없음·직거래 포함)');

select is((select count(*)::int from public.trades_7y where contract_date < date '2019-12-01'), 0,
  '84개월 지난 거래 없음');

select is(
  public.archive_trades(date '2026-11-27') ->> 'moved_trades', '0', '두 번째 호출은 할 일 없음');

-- 같은 (평형, 연도)로 추가 이관되면 배열 뒤에 붙는다
do $$ begin perform public.ingest_trades('11680', jsonb_build_array(
  jsonb_build_object('apt_seq','11680-1','exclusive_area',84.97,'contract_date','2024-06-01','price',199000,'floor',6,'is_direct',false,'dong','101')
), date '2026-11-27'); end $$;
do $$ begin perform public.archive_trades(date '2026-11-27'); end $$;
select is(
  (select cardinality(trades) from public.trades_archive a join public.area_types t on t.id = a.area_type_id
   where t.exclusive_area = 84.97 and a.year = 2024),
  3, '같은 연도 배열에 이어 붙임');

-- 한 달 뒤(2027-01): 2019년 행 삭제, 2020-01 이후만 남음 / 2025-01 거래가 이관됨
select is(
  public.archive_trades(date '2027-01-05') - 'recent_from' - 'keep_from',
  '{"moved_trades": 1, "deleted_archive_rows": 1, "trimmed_archive_rows": 0}'::jsonb,
  '2027-01 기준: 2025-01 이관, 2019년 행 삭제');

-- 경계 연도 일부만 잘림: 2027-04 기준 keep_from = 2020-05-01 → 2020-01-10 은 빠지고 2020-05-10 만 남음
insert into public.trades_archive (area_type_id, year, trades)
select id, 2020, array[
  public.pack_archived_trade(date '2020-01-10', 160000, 3::smallint, false, false),
  public.pack_archived_trade(date '2020-05-10', 161000, 3::smallint, false, false)]
from public.area_types where exclusive_area = 59.99;

select is(
  public.archive_trades(date '2027-04-01') ->> 'trimmed_archive_rows', '1', '경계 연도 원소만 잘라냄');
select is(
  (select array_agg(contract_date order by contract_date) from public.trades_7y t
   join public.area_types a on a.id = t.area_type_id
   where a.exclusive_area = 59.99 and t.contract_date < date '2021-01-01'),
  array[date '2020-05-10'], '기준일(2020-05-01) 이후 원소만 남음');

-- 이관 후에도 요약은 7년 뷰 기준으로 계산
do $$ begin perform public.refresh_area_type_summary(array(select id from public.area_types), date '2026-11-27'); end $$;
select is((select latest_date from public.area_types where exclusive_area = 84.97), date '2026-08-10',
  '요약 재계산 정상');

-- ---------------------------------------------------------------------------
-- log_ops_metric
-- ---------------------------------------------------------------------------
select ok(public.log_ops_metric('trades_daily', 10, 5, 0, '{"run":"t"}') > 0, 'log_ops_metric 이 id 반환');
select ok(
  (select db_size_bytes > 0 and fetched_count = 10 from public.ops_metrics where detail ->> 'run' = 't'),
  'ops_metrics 에 DB 용량 자동 기록');

select * from finish();
rollback;
