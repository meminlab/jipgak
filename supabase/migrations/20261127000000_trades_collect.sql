-- 실거래 수집 (명세 docs/spec-mvp.md 3·4·6·7절) — BANB-66
--
-- 이 마이그레이션이 만드는 것
--   1. 수도권 시군구 코드 + 행정구역 개편 매핑 (수집 대상 목록)
--   2. ingest_trades()      : 수집 함수가 API 1회 응답분(시군구×월)을 넘기면 단지·평형·실거래를 한 번에 upsert
--   3. refresh_area_type_summary() : 평형 요약값(최근가, 6개월 최저·최고) 갱신. 전고점은 BANB-71 이 채운다.
--   4. archive_trades()     : 24개월 지난 거래를 trades_archive 배열로 이관 + 7년(84개월) 넘은 거래 삭제
--   5. log_ops_metric()     : ops_metrics 기록 + DB 용량(pg_database_size) 자동 측정
-- 모든 함수는 service_role(수집 Edge Function, pg_cron) 전용. anon/authenticated 는 실행 불가.

-- ---------------------------------------------------------------------------
-- 1. 수도권 시군구 코드 (LAWD_CD)
--   * 2026-02-01 화성시 4개 구 신설(41590 → 41591·41593·41595·41597)
--   * 2026-07-01 인천 행정체제 개편(중구·동구·서구 → 제물포구·영종구·서해구·검단구)
--   * 2024-01-01 부천시 3개 구 부활(41190 → 41192·41194·41196)
--   신설 코드는 행정안전부 공지·2차 자료 기준이다. 첫 실데이터 수집 때 API 응답의 sggCd 와 대조해 확정한다.
--   구 코드는 is_active=false, is_collected=false 로 둔다. 과거 월 거래가 구 코드로만 조회되는 것이
--   확인되면 그때 is_collected 를 켠다(같은 거래가 신·구 코드 양쪽에서 나와 단지가 중복되는 것을 막기 위해).
-- ---------------------------------------------------------------------------
insert into public.sigungu_codes (code, sido_name, sigungu_name, is_capital_area, is_collected, is_active)
values
  -- 서울특별시 (25)
  ('11110', '서울특별시', '종로구', true, true, true),
  ('11140', '서울특별시', '중구', true, true, true),
  ('11170', '서울특별시', '용산구', true, true, true),
  ('11200', '서울특별시', '성동구', true, true, true),
  ('11215', '서울특별시', '광진구', true, true, true),
  ('11230', '서울특별시', '동대문구', true, true, true),
  ('11260', '서울특별시', '중랑구', true, true, true),
  ('11290', '서울특별시', '성북구', true, true, true),
  ('11305', '서울특별시', '강북구', true, true, true),
  ('11320', '서울특별시', '도봉구', true, true, true),
  ('11350', '서울특별시', '노원구', true, true, true),
  ('11380', '서울특별시', '은평구', true, true, true),
  ('11410', '서울특별시', '서대문구', true, true, true),
  ('11440', '서울특별시', '마포구', true, true, true),
  ('11470', '서울특별시', '양천구', true, true, true),
  ('11500', '서울특별시', '강서구', true, true, true),
  ('11530', '서울특별시', '구로구', true, true, true),
  ('11545', '서울특별시', '금천구', true, true, true),
  ('11560', '서울특별시', '영등포구', true, true, true),
  ('11590', '서울특별시', '동작구', true, true, true),
  ('11620', '서울특별시', '관악구', true, true, true),
  ('11650', '서울특별시', '서초구', true, true, true),
  ('11680', '서울특별시', '강남구', true, true, true),
  ('11710', '서울특별시', '송파구', true, true, true),
  ('11740', '서울특별시', '강동구', true, true, true),
  -- 인천광역시 (현행 2026-07-01~ 9구 2군)
  ('28125', '인천광역시', '제물포구', true, true, true),
  ('28155', '인천광역시', '영종구', true, true, true),
  ('28177', '인천광역시', '미추홀구', true, true, true),
  ('28185', '인천광역시', '연수구', true, true, true),
  ('28200', '인천광역시', '남동구', true, true, true),
  ('28237', '인천광역시', '부평구', true, true, true),
  ('28245', '인천광역시', '계양구', true, true, true),
  ('28275', '인천광역시', '서해구', true, true, true),
  ('28290', '인천광역시', '검단구', true, true, true),
  ('28710', '인천광역시', '강화군', true, true, true),
  ('28720', '인천광역시', '옹진군', true, true, true),
  -- 인천 폐지 코드
  ('28110', '인천광역시', '중구(2026-06-30 폐지)', true, false, false),
  ('28140', '인천광역시', '동구(2026-06-30 폐지)', true, false, false),
  ('28260', '인천광역시', '서구(2026-06-30 폐지)', true, false, false),
  -- 경기도
  ('41111', '경기도', '수원시 장안구', true, true, true),
  ('41113', '경기도', '수원시 권선구', true, true, true),
  ('41115', '경기도', '수원시 팔달구', true, true, true),
  ('41117', '경기도', '수원시 영통구', true, true, true),
  ('41131', '경기도', '성남시 수정구', true, true, true),
  ('41133', '경기도', '성남시 중원구', true, true, true),
  ('41135', '경기도', '성남시 분당구', true, true, true),
  ('41150', '경기도', '의정부시', true, true, true),
  ('41171', '경기도', '안양시 만안구', true, true, true),
  ('41173', '경기도', '안양시 동안구', true, true, true),
  ('41192', '경기도', '부천시 원미구', true, true, true),
  ('41194', '경기도', '부천시 소사구', true, true, true),
  ('41196', '경기도', '부천시 오정구', true, true, true),
  ('41210', '경기도', '광명시', true, true, true),
  ('41220', '경기도', '평택시', true, true, true),
  ('41250', '경기도', '동두천시', true, true, true),
  ('41271', '경기도', '안산시 상록구', true, true, true),
  ('41273', '경기도', '안산시 단원구', true, true, true),
  ('41281', '경기도', '고양시 덕양구', true, true, true),
  ('41285', '경기도', '고양시 일산동구', true, true, true),
  ('41287', '경기도', '고양시 일산서구', true, true, true),
  ('41290', '경기도', '과천시', true, true, true),
  ('41310', '경기도', '구리시', true, true, true),
  ('41360', '경기도', '남양주시', true, true, true),
  ('41370', '경기도', '오산시', true, true, true),
  ('41390', '경기도', '시흥시', true, true, true),
  ('41410', '경기도', '군포시', true, true, true),
  ('41430', '경기도', '의왕시', true, true, true),
  ('41450', '경기도', '하남시', true, true, true),
  ('41461', '경기도', '용인시 처인구', true, true, true),
  ('41463', '경기도', '용인시 기흥구', true, true, true),
  ('41465', '경기도', '용인시 수지구', true, true, true),
  ('41480', '경기도', '파주시', true, true, true),
  ('41500', '경기도', '이천시', true, true, true),
  ('41550', '경기도', '안성시', true, true, true),
  ('41570', '경기도', '김포시', true, true, true),
  ('41591', '경기도', '화성시 만세구', true, true, true),
  ('41593', '경기도', '화성시 효행구', true, true, true),
  ('41595', '경기도', '화성시 병점구', true, true, true),
  ('41597', '경기도', '화성시 동탄구', true, true, true),
  ('41610', '경기도', '광주시', true, true, true),
  ('41630', '경기도', '양주시', true, true, true),
  ('41650', '경기도', '포천시', true, true, true),
  ('41670', '경기도', '여주시', true, true, true),
  ('41800', '경기도', '연천군', true, true, true),
  ('41820', '경기도', '가평군', true, true, true),
  ('41830', '경기도', '양평군', true, true, true),
  -- 경기 폐지 코드
  ('41190', '경기도', '부천시(2023-12-31 폐지)', true, false, false),
  ('41590', '경기도', '화성시(2026-01-31 폐지)', true, false, false);

insert into public.sigungu_code_changes (old_code, new_code, effective_on)
values
  ('41190', '41192', date '2024-01-01'),
  ('41190', '41194', date '2024-01-01'),
  ('41190', '41196', date '2024-01-01'),
  ('41590', '41591', date '2026-02-01'),
  ('41590', '41593', date '2026-02-01'),
  ('41590', '41595', date '2026-02-01'),
  ('41590', '41597', date '2026-02-01'),
  ('28110', '28125', date '2026-07-01'),
  ('28110', '28155', date '2026-07-01'),
  ('28140', '28125', date '2026-07-01'),
  ('28260', '28275', date '2026-07-01'),
  ('28260', '28290', date '2026-07-01');

-- ---------------------------------------------------------------------------
-- 3. 평형 요약값 갱신 (해제 거래 제외)
--   latest_*  : 가장 최근 유효 거래 (7년 범위)
--   *_6m      : 오늘 기준 6개월 안 유효 거래의 최저·최고
--   peak_*    : 2006~ 전고점은 BANB-71 백필이 채운다(여기서는 건드리지 않음).
-- ---------------------------------------------------------------------------
create function public.refresh_area_type_summary(
  p_area_type_ids integer[],
  p_today         date default current_date
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  with ids as (
    select distinct unnest(p_area_type_ids) as id
  ),
  latest as (
    select distinct on (t.area_type_id) t.area_type_id, t.price, t.contract_date
    from public.trades_7y t
    join ids on ids.id = t.area_type_id
    where not t.is_cancelled
    order by t.area_type_id, t.contract_date desc, t.price desc
  ),
  six as (
    select r.area_type_id, min(r.price) as min_p, max(r.price) as max_p
    from public.trades_recent r
    join ids on ids.id = r.area_type_id
    where r.cancelled_on is null
      and r.contract_date > (p_today - interval '6 months')::date
      and r.contract_date <= p_today
    group by r.area_type_id
  )
  update public.area_types a
  set latest_price       = l.price,
      latest_date        = l.contract_date,
      min_price_6m       = s.min_p,
      max_price_6m       = s.max_p,
      summary_updated_at = now()
  from ids
  left join latest l on l.area_type_id = ids.id
  left join six s on s.area_type_id = ids.id
  where a.id = ids.id;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
comment on function public.refresh_area_type_summary is
  '평형 요약(최근가·6개월 최저/최고) 재계산. 해제 거래 제외. 전고점은 BANB-71 담당.';

-- ---------------------------------------------------------------------------
-- 2. 실거래 적재 (API 응답 1회분 = 시군구 × 계약월)
--   p_rows: 수집 함수가 정규화한 배열. 원소 키:
--     apt_seq, apt_name, umd_code, umd_name, jibun, bonbun, bubun, build_year,
--     exclusive_area, contract_date, price, floor, is_direct, cancelled_on, registered_on, dong
--   * 단지는 apt_seq 기준. 새 단지면 만들고, 있으면 비어 있는 값만 채운다(K-apt 동기화 값 보호).
--   * 평형은 (단지, 전용면적 0.01㎡) 기준.
--   * 실거래는 유니크 키(평형, 계약일, 가격, 층, 동)로 upsert. 해제·등기일·직거래 여부는 최신 응답으로 덮어쓴다.
--   * 같은 응답 안에서 키가 같은 거래가 여러 건이면 1건으로 합친다(유효 거래 우선). API 에 거래 고유 ID 가 없어 생기는 한계.
-- ---------------------------------------------------------------------------
create function public.ingest_trades(
  p_sigungu_code text,
  p_rows         jsonb,
  p_today        date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_upserted integer;
  v_area_ids integer[];
  v_new_complexes integer;
  v_new_area_types integer;
begin
  if jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception 'ingest_trades: p_rows must be a json array' using errcode = '22023';
  end if;

  drop table if exists pg_temp._in;
  create temp table _in on commit drop as
  select
    nullif(trim(r ->> 'apt_seq'), '')                as apt_seq,
    nullif(trim(r ->> 'apt_name'), '')               as apt_name,
    nullif(trim(r ->> 'umd_code'), '')               as umd_code,
    nullif(trim(r ->> 'umd_name'), '')               as umd_name,
    nullif(trim(r ->> 'jibun'), '')                  as jibun,
    (r ->> 'bonbun')::smallint                       as bonbun,
    (r ->> 'bubun')::smallint                        as bubun,
    (r ->> 'build_year')::smallint                   as build_year,
    round((r ->> 'exclusive_area')::numeric, 2)      as exclusive_area,
    (r ->> 'contract_date')::date                    as contract_date,
    (r ->> 'price')::integer                         as price,
    (r ->> 'floor')::smallint                        as floor,
    coalesce((r ->> 'is_direct')::boolean, false)    as is_direct,
    (r ->> 'cancelled_on')::date                     as cancelled_on,
    (r ->> 'registered_on')::date                    as registered_on,
    nullif(trim(r ->> 'dong'), '')                   as dong
  from jsonb_array_elements(p_rows) as r;

  delete from _in where apt_seq is null or exclusive_area is null or exclusive_area <= 0
                     or contract_date is null or price is null or price <= 0;

  -- 단지
  with ins as (
    insert into public.complexes (apt_seq, name, sigungu_code, umd_code, umd_name, jibun, bonbun, bubun, build_year)
    select distinct on (apt_seq)
      apt_seq, coalesce(apt_name, apt_seq), p_sigungu_code, umd_code, umd_name, jibun, bonbun, bubun, build_year
    from _in
    order by apt_seq, contract_date desc
    on conflict (apt_seq) do update
      set umd_code   = coalesce(public.complexes.umd_code, excluded.umd_code),
          umd_name   = coalesce(public.complexes.umd_name, excluded.umd_name),
          jibun      = coalesce(public.complexes.jibun, excluded.jibun),
          bonbun     = coalesce(public.complexes.bonbun, excluded.bonbun),
          bubun      = coalesce(public.complexes.bubun, excluded.bubun),
          build_year = coalesce(public.complexes.build_year, excluded.build_year)
      where public.complexes.umd_code is null or public.complexes.umd_name is null
         or public.complexes.jibun is null or public.complexes.bonbun is null
         or public.complexes.bubun is null or public.complexes.build_year is null
    returning (xmax = 0) as inserted
  )
  select count(*) filter (where inserted) into v_new_complexes from ins;

  -- 평형
  with ins as (
    insert into public.area_types (complex_id, exclusive_area)
    select distinct c.id, i.exclusive_area
    from _in i
    join public.complexes c on c.apt_seq = i.apt_seq
    on conflict (complex_id, exclusive_area) do nothing
    returning id
  )
  select count(*) into v_new_area_types from ins;

  -- 실거래
  with src as (
    select distinct on (a.id, i.contract_date, i.price, i.floor, i.dong)
      a.id as area_type_id, i.contract_date, i.price, i.cancelled_on, i.registered_on,
      i.floor, i.is_direct, i.dong
    from _in i
    join public.complexes c on c.apt_seq = i.apt_seq
    join public.area_types a on a.complex_id = c.id and a.exclusive_area = i.exclusive_area
    order by a.id, i.contract_date, i.price, i.floor, i.dong, (i.cancelled_on is not null), i.registered_on desc nulls last
  ),
  up as (
    insert into public.trades_recent as t
      (area_type_id, contract_date, price, cancelled_on, registered_on, floor, is_direct, dong)
    select area_type_id, contract_date, price, cancelled_on, registered_on, floor, is_direct, dong
    from src
    on conflict (area_type_id, contract_date, price, floor, dong) do update
      set cancelled_on  = excluded.cancelled_on,
          registered_on = excluded.registered_on,
          is_direct     = excluded.is_direct
      where (t.cancelled_on, t.registered_on, t.is_direct)
            is distinct from (excluded.cancelled_on, excluded.registered_on, excluded.is_direct)
    returning t.area_type_id
  )
  select count(*), array_agg(distinct area_type_id) into v_upserted, v_area_ids from up;

  if v_area_ids is not null then
    perform public.refresh_area_type_summary(v_area_ids, p_today);
  end if;

  return jsonb_build_object(
    'rows', (select count(*) from _in),
    'upserted', v_upserted,
    'new_complexes', v_new_complexes,
    'new_area_types', v_new_area_types
  );
end;
$$;
comment on function public.ingest_trades is
  '수집 함수 전용. 시군구×월 API 응답을 단지·평형·실거래로 upsert 하고 바뀐 평형의 요약을 갱신한다.';

-- ---------------------------------------------------------------------------
-- 4. 이관·삭제 (매월 1회 + 최초 적재 중 수시)
--   recent 보관: 이번 달 포함 최근 24개월 (계약일 >= 이번 달 1일 - 23개월)
--   7년 보관:    이번 달 포함 최근 84개월 (계약일 >= 이번 달 1일 - 83개월)
--   이관된 거래는 확정 거래로 보고 더 갱신하지 않는다(일일 갱신은 최근 3개월만 다시 받음).
--   같은 (평형, 연도) 행이 이미 있으면 배열 뒤에 이어 붙인다. 이관 전 trades_recent 유니크 키로 중복이 걸러진다.
-- ---------------------------------------------------------------------------
create function public.archive_trades(p_today date default current_date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recent_from  date := (date_trunc('month', p_today) - interval '23 months')::date;
  v_keep_from    date := (date_trunc('month', p_today) - interval '83 months')::date;
  v_keep_year    smallint := extract(year from v_keep_from)::smallint;
  v_moved        bigint;
  v_purged_rows  integer;
  v_trimmed_rows integer;
begin
  -- 1) 24개월 지난 거래 → 배열 (84개월 지난 것은 이관하지 않고 버림)
  drop table if exists pg_temp._moved;
  create temp table _moved on commit drop as
  with del as (
    delete from public.trades_recent r
    where r.contract_date < v_recent_from
    returning r.area_type_id, r.contract_date, r.price, r.floor, r.is_direct, r.cancelled_on
  )
  select * from del;

  insert into public.trades_archive as a (area_type_id, year, trades)
  select m.area_type_id,
         extract(year from m.contract_date)::smallint,
         array_agg(public.pack_archived_trade(m.contract_date, m.price, m.floor, m.is_direct,
                                              m.cancelled_on is not null)
                   order by m.contract_date, m.price)
  from _moved m
  where m.contract_date >= v_keep_from
  group by m.area_type_id, extract(year from m.contract_date)
  on conflict (area_type_id, year) do update
    set trades = a.trades || excluded.trades;

  select count(*) into v_moved from _moved where contract_date >= v_keep_from;

  -- 2) 7년 지난 연도 행 삭제 + 경계 연도에서 모든 원소가 기준일 이전인 행 삭제
  delete from public.trades_archive a
  where a.year < v_keep_year
     or (a.year = v_keep_year
         and not exists (
           select 1 from unnest(a.trades) as t (v)
           where make_date(a.year, 1, 1) + ((t.v >> 10) & 511)::int >= v_keep_from));
  get diagnostics v_purged_rows = row_count;

  -- 3) 경계 연도: 기준일 이전 원소만 제거 (남는 원소가 있는 행만 남아 있음)
  update public.trades_archive a
  set trades = (
    select array_agg(t.v order by t.ord)
    from unnest(a.trades) with ordinality as t (v, ord)
    where make_date(a.year, 1, 1) + ((t.v >> 10) & 511)::int >= v_keep_from
  )
  where a.year = v_keep_year
    and exists (
      select 1 from unnest(a.trades) as t (v)
      where make_date(a.year, 1, 1) + ((t.v >> 10) & 511)::int < v_keep_from);
  get diagnostics v_trimmed_rows = row_count;

  return jsonb_build_object(
    'recent_from', v_recent_from,
    'keep_from', v_keep_from,
    'moved_trades', v_moved,
    'deleted_archive_rows', v_purged_rows,
    'trimmed_archive_rows', v_trimmed_rows
  );
end;
$$;
comment on function public.archive_trades is
  '24개월 지난 실거래를 trades_archive 로 이관, 84개월 지난 실거래 삭제. 매월 1일 pg_cron + 최초 적재 중 수시 호출.';

-- ---------------------------------------------------------------------------
-- 5. 운영 지표 기록 (DB 용량 자동 포함)
-- ---------------------------------------------------------------------------
create function public.log_ops_metric(
  p_job            text,
  p_fetched_count  integer default null,
  p_upserted_count integer default null,
  p_error_count    integer default 0,
  p_detail         jsonb default null
)
returns bigint
language sql
security definer
set search_path = ''
as $$
  insert into public.ops_metrics (job, db_size_bytes, fetched_count, upserted_count, error_count, detail)
  values (p_job, pg_database_size(current_database()), p_fetched_count, p_upserted_count,
          coalesce(p_error_count, 0), p_detail)
  returning id;
$$;
comment on function public.log_ops_metric is '수집 결과 + 현재 DB 용량을 ops_metrics 에 기록.';

-- ---------------------------------------------------------------------------
-- 권한: service_role 전용
-- ---------------------------------------------------------------------------
revoke all on function public.refresh_area_type_summary(integer[], date) from public, anon, authenticated;
revoke all on function public.ingest_trades(text, jsonb, date) from public, anon, authenticated;
revoke all on function public.archive_trades(date) from public, anon, authenticated;
revoke all on function public.log_ops_metric(text, integer, integer, integer, jsonb) from public, anon, authenticated;
grant execute on function public.refresh_area_type_summary(integer[], date) to service_role;
grant execute on function public.ingest_trades(text, jsonb, date) to service_role;
grant execute on function public.archive_trades(date) to service_role;
grant execute on function public.log_ops_metric(text, integer, integer, integer, jsonb) to service_role;
