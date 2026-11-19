-- 스키마·RLS 테스트 (BANB-62). 실행: npm run db:test (로컬 Supabase 필요)
begin;
create extension if not exists pgtap with schema extensions;

select plan(33);

-- ---------------------------------------------------------------------------
-- 준비: 사용자 2명 + 공개 데이터 (postgres 권한)
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@test.local'),
  ('22222222-2222-2222-2222-222222222222', 'b@test.local');

insert into public.sigungu_codes (code, sido_name, sigungu_name, is_capital_area, is_collected)
values ('11680', '서울특별시', '강남구', true, true);

insert into public.complexes (apt_seq, name, sigungu_code, umd_code, umd_name, bonbun, bubun)
values ('11680-0001', '테스트단지', '11680', '10300', '개포동', 12, 0);

insert into public.area_types (complex_id, exclusive_area)
select id, 84.97 from public.complexes where apt_seq = '11680-0001';

create temp table t_ids on commit drop as
select a.id as area_type_id from public.area_types a join public.complexes c on c.id = a.complex_id
where c.apt_seq = '11680-0001';
grant select on t_ids to anon, authenticated;

insert into public.trades_recent (area_type_id, contract_date, price, floor, is_direct, dong)
select area_type_id, date '2026-10-01', 235000, 12, false, '101' from t_ids
union all
select area_type_id, date '2026-09-15', 230000, 3, true, null from t_ids;
update public.trades_recent set cancelled_on = date '2026-10-20' where contract_date = date '2026-09-15';

insert into public.trades_archive (area_type_id, year, trades)
select area_type_id, 2022, array[
  public.pack_archived_trade(date '2022-03-02', 260000, 5::smallint, false, false),
  public.pack_archived_trade(date '2022-07-09', 255000, 15::smallint, true, true)]
from t_ids
union all
select area_type_id, 2020, array[
  public.pack_archived_trade(date '2020-12-31', 1999999, null, false, false),
  public.pack_archived_trade(date '2020-01-01', 41000, (-1)::smallint, false, true)]
from t_ids;

-- ---------------------------------------------------------------------------
-- 스키마 형태
-- ---------------------------------------------------------------------------
select tables_are('public', array[
  'sigungu_codes', 'sigungu_code_changes', 'complexes', 'area_types', 'trades_recent',
  'trades_archive', 'policy_rules', 'user_profile', 'user_complexes', 'user_area_notes', 'ops_metrics'
], '명세 4절 테이블 + 시군구 매핑이 모두 있다');

select is(
  (select count(*)::int from pg_indexes where schemaname = 'public' and tablename = 'trades_recent'),
  1, 'trades_recent 인덱스는 중복 방지 유니크 1개뿐');

select col_type_is('public', 'trades_recent', 'price', 'integer', '가격은 int(만원)');
select col_type_is('public', 'trades_recent', 'contract_date', 'date', '계약일은 date');

select throws_ok(
  $$insert into public.trades_recent (area_type_id, contract_date, price, floor, is_direct, dong)
    select area_type_id, date '2026-09-15', 230000, 3, false, null from t_ids$$,
  '23505', null, '같은 (평형·계약일·가격·층·동[null 포함]) 거래는 중복 삽입 불가');

select throws_ok($$select public.pack_archived_trade(date '2022-01-01', 1000, 127::smallint, false, false)$$,
  '22003', null, '아카이브 인코딩: 층 범위 밖이면 거부');
select throws_ok($$select public.pack_archived_trade(date '2022-01-01', 0, 1::smallint, false, false)$$,
  '22023', null, '아카이브 인코딩: 가격 0 이하 거부');

-- ---------------------------------------------------------------------------
-- 7년 통합 뷰
-- ---------------------------------------------------------------------------
select is(
  (select count(*)::int from public.trades_7y where area_type_id = (select area_type_id from t_ids)),
  6, 'trades_7y = 최근 2건 + 아카이브 4건');

select results_eq(
  $$select contract_date, price, floor::int, is_direct, is_cancelled, is_archived
      from public.trades_7y where area_type_id = (select area_type_id from t_ids)
     order by contract_date$$,
  $$values (date '2020-01-01', 41000, -1, false, true, true),
           (date '2020-12-31', 1999999, null, false, false, true),
           (date '2022-03-02', 260000, 5, false, false, true),
           (date '2022-07-09', 255000, 15, true, true, true),
           (date '2026-09-15', 230000, 3, true, true, false),
           (date '2026-10-01', 235000, 12, false, false, false)$$,
  'trades_7y 가 아카이브를 풀어 계약일(윤년 12/31 포함)·가격·층(음수·없음)·플래그를 복원');

-- ---------------------------------------------------------------------------
-- anon: 공개 데이터 읽기만, 사용자 데이터·운영 지표 접근 불가
-- ---------------------------------------------------------------------------
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select is((select count(*)::int from public.complexes), 1, 'anon: 단지 읽기 가능');
select is((select count(*)::int from public.trades_7y), 6, 'anon: 7년 실거래 뷰 읽기 가능');
select lives_ok($$select * from public.policy_rules$$, 'anon: 설정값 읽기 가능');
select throws_ok($$insert into public.complexes (name, sigungu_code) values ('x', '11680')$$,
  '42501', null, 'anon: 단지 쓰기 불가');
select throws_ok($$select * from public.user_profile$$, '42501', null, 'anon: user_profile 접근 불가');
select throws_ok($$select * from public.user_complexes$$, '42501', null, 'anon: user_complexes 접근 불가');
select throws_ok($$select * from public.ops_metrics$$, '42501', null, 'anon: ops_metrics 접근 불가');

-- ---------------------------------------------------------------------------
-- 사용자 A: 본인 행 쓰기
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select lives_ok($$insert into public.user_profile (seed_money, annual_income) values (30000, 8000)$$,
  'A: 내 조건 저장(user_id 기본값 = auth.uid())');
select lives_ok($$insert into public.user_complexes (area_type_id) select area_type_id from t_ids$$,
  'A: 스크랩 저장');
select lives_ok($$insert into public.user_area_notes (area_type_id, rooms, bathrooms, memo)
                  select area_type_id, 3, 2, 'A 메모' from t_ids$$,
  'A: 직접 입력 저장');
select throws_ok(
  $$insert into public.user_profile (user_id, seed_money) values ('22222222-2222-2222-2222-222222222222', 1)$$,
  '42501', null, 'A: 다른 사용자 user_id 로 쓰기 불가');
select throws_ok($$update public.complexes set name = 'x'$$, '42501', null, 'authenticated: 단지 수정 불가');
select lives_ok($$select * from public.ops_metrics$$, 'authenticated: 운영 지표 읽기 가능');

-- ---------------------------------------------------------------------------
-- 사용자 B: A의 행을 읽지도 쓰지도 못함
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims',
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);

select is((select count(*)::int from public.user_profile), 0, 'B: A의 user_profile 안 보임');
select is((select count(*)::int from public.user_complexes), 0, 'B: A의 user_complexes 안 보임');
select is((select count(*)::int from public.user_area_notes), 0, 'B: A의 user_area_notes 안 보임');

update public.user_profile set seed_money = 1;
update public.user_area_notes set memo = 'B가 덮어씀';
delete from public.user_complexes;
select lives_ok($$insert into public.user_area_notes (area_type_id, memo) select area_type_id, 'B 메모' from t_ids$$,
  'B: 자기 직접 입력 저장 가능');
select throws_ok(
  $$update public.user_area_notes set user_id = '11111111-1111-1111-1111-111111111111'
     where user_id = '22222222-2222-2222-2222-222222222222'$$,
  '42501', null, 'B: 자기 행의 user_id 를 A로 바꿔 A에게 쓰기 불가');

select lives_ok($$insert into public.user_complexes (area_type_id) select area_type_id from t_ids$$,
  'B: 같은 평형을 자기 스크랩으로 저장 가능');

-- ---------------------------------------------------------------------------
-- 검증: B의 update/delete 가 A 행에 영향 없음 (postgres 로 확인)
-- ---------------------------------------------------------------------------
reset role;

select is((select seed_money from public.user_profile
            where user_id = '11111111-1111-1111-1111-111111111111'), 30000, 'B update 후에도 A 종잣돈 그대로');
select is((select memo from public.user_area_notes
            where user_id = '11111111-1111-1111-1111-111111111111'), 'A 메모', 'B update 후에도 A 메모 그대로');
select is((select count(*)::int from public.user_complexes
            where user_id = '11111111-1111-1111-1111-111111111111'), 1, 'B delete 후에도 A 스크랩 그대로');
select is((select count(*)::int from public.user_complexes), 2, 'A·B 스크랩이 각각 1건');

-- 사용자 삭제 시 개인 데이터도 삭제
delete from auth.users where id = '11111111-1111-1111-1111-111111111111';
select is((select count(*)::int from public.user_profile
            where user_id = '11111111-1111-1111-1111-111111111111'), 0, '계정 삭제 시 user_profile 함께 삭제');

select * from finish();
rollback;
