-- 집각 초기 스키마 (명세 docs/spec-mvp.md 4절) — BANB-62
--
-- 단위 규칙
--   * 금액: integer, 만원 단위 (예: 7억 3,500만 = 73500)
--   * 날짜: date
--   * 면적: numeric(6,2) ㎡ (0.01㎡ 단위)
-- 용량 규칙 (무료 한도 500MB의 60% 이하 목표)
--   * 단지명·주소는 complexes 에만 저장(정규화). 실거래 행에는 area_type_id 만 둔다.
--   * trades_recent 는 중복 방지 유니크 인덱스 1개만 둔다(PK·보조 인덱스 없음).
--   * trades_archive 는 (area_type_id, 연도)별 bigint 배열로 압축 저장한다(거래 1건 = 8바이트).
-- 권한 규칙
--   * 실거래·단지·설정 데이터: 누구나 읽기, 쓰기는 service_role(수집 함수)만.
--   * user_* : 로그인한 본인 행만 읽기·쓰기.
--   * ops_metrics: 로그인 사용자 읽기(내 조건 화면의 DB 사용량 표시), 쓰기는 service_role 만.

-- ---------------------------------------------------------------------------
-- 공통: updated_at 자동 갱신
-- ---------------------------------------------------------------------------
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 시군구 코드 + 행정구역 개편 매핑 (명세 6절: 화성시 동탄구 등)
-- ---------------------------------------------------------------------------
create table public.sigungu_codes (
  code            text primary key check (code ~ '^[0-9]{5}$'),  -- LAWD_CD (법정동코드 앞 5자리)
  sido_name       text not null,
  sigungu_name    text not null,
  is_capital_area boolean not null default false,  -- 수도권(서울·인천·경기)
  is_collected    boolean not null default false,  -- 실거래 수집 대상
  is_active       boolean not null default true    -- 폐지된 코드는 false
);
comment on table public.sigungu_codes is '시군구 코드(LAWD_CD). 수집 대상·수도권 여부 판정 기준.';

create table public.sigungu_code_changes (
  old_code     text not null references public.sigungu_codes (code),
  new_code     text not null references public.sigungu_codes (code),
  effective_on date not null,
  primary key (old_code, new_code),
  check (old_code <> new_code)
);
comment on table public.sigungu_code_changes is
  '행정구역 개편 매핑(구 코드 → 신 코드). 분할(1:N)·통합(N:1) 모두 행 여러 개로 표현.';

-- ---------------------------------------------------------------------------
-- 단지
-- ---------------------------------------------------------------------------
create table public.complexes (
  id             integer generated always as identity primary key,
  apt_seq        text unique,                 -- 실거래 API aptSeq
  kapt_code      text unique,                 -- K-apt kaptCode
  name           text not null,
  sigungu_code   text not null references public.sigungu_codes (code),
  umd_code       text check (umd_code ~ '^[0-9]{5}$'),  -- 법정동코드 뒤 5자리 (전체 = sigungu_code || umd_code)
  umd_name       text,
  jibun          text,                        -- 표시용 지번 원문
  bonbun         smallint,                    -- 매칭용 본번
  bubun          smallint,                    -- 매칭용 부번
  lat            double precision,
  lng            double precision,
  approved_on    date,                        -- 사용승인일 (K-apt)
  build_year     smallint,                    -- 건축년도 (실거래 buildYear, K-apt 미매칭 시 연식 계산용)
  households     integer,                     -- 세대수
  buildings      smallint,                    -- 동수
  hallway_type   text,                        -- 복도유형 (계단식/복도식/혼합식 등 K-apt 원문)
  parking_spaces integer,                     -- 총 주차대수
  builder        text,                        -- 시공사
  match_status   text not null default 'pending'
                 check (match_status in ('pending', 'matched_jibun', 'matched_name', 'unmatched')),
  kapt_synced_at timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check ((lat is null) = (lng is null))
);
comment on table public.complexes is '단지. 이름·주소는 여기만 저장(실거래 행은 area_type_id 로 참조).';
comment on column public.complexes.match_status is
  'aptSeq↔kaptCode 매칭 결과: pending(미시도) / matched_jibun(법정동+본번·부번) / matched_name(정규화 단지명) / unmatched';

create index complexes_sigungu_umd_idx on public.complexes (sigungu_code, umd_code);
create index complexes_lat_lng_idx on public.complexes (lat, lng) where lat is not null;

create trigger complexes_set_updated_at
  before update on public.complexes
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 평형 타입 (단지 × 전용면적). 지도·목록은 이 요약값만 읽는다.
-- ---------------------------------------------------------------------------
create table public.area_types (
  id                     integer generated always as identity primary key,
  complex_id             integer not null references public.complexes (id) on delete cascade,
  exclusive_area         numeric(6,2) not null check (exclusive_area > 0),  -- 전용 ㎡
  supply_area            numeric(6,2) check (supply_area > 0),              -- 공급 ㎡ (건축물대장)
  supply_area_source     text check (supply_area_source in ('ledger', 'not_found')),
  supply_area_checked_at timestamptz,
  peak_price             integer,   -- 전고점(2006~, 해제 제외) 만원
  peak_date              date,
  latest_price           integer,   -- 최근 거래가(해제 제외) 만원
  latest_date            date,
  min_price_6m           integer,   -- 최근 6개월 최저 만원
  max_price_6m           integer,   -- 최근 6개월 최고 만원
  summary_updated_at     timestamptz,
  unique (complex_id, exclusive_area),
  check ((supply_area is null) or supply_area_source = 'ledger'),
  check ((peak_price is null) = (peak_date is null)),
  check ((latest_price is null) = (latest_date is null)),
  check ((min_price_6m is null) = (max_price_6m is null)),
  check (min_price_6m <= max_price_6m)
);
comment on column public.area_types.supply_area_source is
  '공급면적 조회 결과: null(아직 조회 안 함) / ledger(건축물대장 값) / not_found(조회했으나 없음 → 직접 입력 유도). 직접 입력값은 user_area_notes.';

-- ---------------------------------------------------------------------------
-- 실거래: 최근 24개월 (행 단위)
-- ---------------------------------------------------------------------------
create table public.trades_recent (
  area_type_id  integer  not null references public.area_types (id) on delete cascade,
  contract_date date     not null,             -- 계약일
  price         integer  not null check (price > 0),  -- 만원
  cancelled_on  date,                          -- 해제사유발생일 (null = 유효 거래)
  registered_on date,                          -- 등기일자
  floor         smallint,                      -- 층 (지하는 음수)
  is_direct     boolean  not null default false,  -- 직거래 여부
  dong          text                           -- 동 (aptDong, 없으면 null)
);
comment on table public.trades_recent is
  '최근 24개월 실거래. API 에 거래 고유 ID 가 없어 (평형, 계약일, 가격, 층, 동) 유니크 키로 중복을 막는다. 해제는 같은 키로 upsert 해 cancelled_on 을 채운다.';

-- 유일한 인덱스: 중복 방지 + 평형별 기간 조회를 함께 처리
create unique index trades_recent_dedup_key
  on public.trades_recent (area_type_id, contract_date, price, floor, dong)
  nulls not distinct;

-- ---------------------------------------------------------------------------
-- 실거래: 25개월 ~ 7년 (평형 × 연도별 배열 압축)
--   거래 1건 = bigint 1개. 비트 배치(하위 → 상위):
--     0-1   플래그  (1 = 직거래, 2 = 해제)
--     2-9   층 + 128 (255 = 층 정보 없음) → 층 범위 -128 ~ 126
--     10-18 그 해 1월 1일부터 지난 일수 (0~365)
--     19-   가격 (만원)
--   계약일·가격·층·플래그를 배열 4개로 나누면 배열 헤더(각 24B)가 행마다 붙어 실측 약 1.7배 커진다.
--   인코딩은 pack_archived_trade(), 디코딩은 trades_7y 뷰가 맡는다.
-- ---------------------------------------------------------------------------
create function public.pack_archived_trade(
  p_contract_date date,
  p_price         integer,
  p_floor         smallint,
  p_is_direct     boolean,
  p_is_cancelled  boolean
)
returns bigint
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_contract_date is null or p_price is null or p_price <= 0 then
    raise exception 'pack_archived_trade: contract_date and positive price are required'
      using errcode = '22023';
  end if;
  if p_floor is not null and (p_floor < -128 or p_floor > 126) then
    raise exception 'pack_archived_trade: floor % out of range (-128..126)', p_floor
      using errcode = '22003';
  end if;
  return (p_price::bigint << 19)
       | ((p_contract_date - make_date(extract(year from p_contract_date)::int, 1, 1))::bigint << 10)
       | (coalesce(p_floor + 128, 255)::bigint << 2)
       | (case when p_is_direct then 1 else 0 end)
       | (case when p_is_cancelled then 2 else 0 end);
end;
$$;
comment on function public.pack_archived_trade is
  'trades_archive.trades 원소 인코딩. 연도는 행의 year 컬럼에 있으므로 계약일과 같은 연도의 행에 넣어야 한다.';

create table public.trades_archive (
  area_type_id integer  not null references public.area_types (id) on delete cascade,
  year         smallint not null check (year between 2000 and 2100),
  trades       bigint[] not null check (cardinality(trades) > 0 and array_ndims(trades) = 1),
  primary key (area_type_id, year)
);
comment on table public.trades_archive is
  '25개월~7년 실거래. trades 원소 1개 = 거래 1건(pack_archived_trade 형식). 확정 거래라 갱신 없음, 매월 이관·7년 초과분 삭제.';

-- ---------------------------------------------------------------------------
-- 7년 실거래 통합 조회 (화면은 이 뷰만 사용)
-- ---------------------------------------------------------------------------
create view public.trades_7y
with (security_invoker = true)
as
select
  r.area_type_id,
  r.contract_date,
  r.price,
  r.floor,
  r.is_direct,
  (r.cancelled_on is not null) as is_cancelled,
  r.cancelled_on,
  r.registered_on,
  r.dong,
  false as is_archived
from public.trades_recent r
union all
select
  a.area_type_id,
  make_date(a.year, 1, 1) + ((t.v >> 10) & 511)::int as contract_date,
  (t.v >> 19)::integer as price,
  (nullif((t.v >> 2) & 255, 255) - 128)::smallint as floor,
  (t.v & 1) <> 0 as is_direct,
  (t.v & 2) <> 0 as is_cancelled,
  null::date as cancelled_on,
  null::date as registered_on,
  null::text as dong,
  true as is_archived
from public.trades_archive a
cross join lateral unnest(a.trades) as t (v);
comment on view public.trades_7y is
  '최근 24개월(trades_recent) + 아카이브(trades_archive)를 합친 7년 실거래. area_type_id 로 걸러 조회한다.';

-- ---------------------------------------------------------------------------
-- 규제·세율 설정값 (계산 엔진은 여기서만 숫자를 읽는다)
-- ---------------------------------------------------------------------------
create table public.policy_rules (
  id             integer generated always as identity primary key,
  key            text    not null,                 -- 예: ltv.regulated.no_house
  value          jsonb   not null,                 -- 숫자·구간표·코드 목록 등
  region_scope   text    not null default 'all',   -- 적용 지역 범위 (all / capital / regulated ...)
  effective_from date    not null,                 -- 시행일
  effective_to   date,                             -- 종료일 (null = 현행)
  source_url     text,
  checked_on     date,                             -- 출처 확인일
  verified       boolean not null default false,   -- 출처로 값이 확인됐는지
  note           text,
  unique (key, region_scope, effective_from),
  check (effective_to is null or effective_to >= effective_from)
);
comment on table public.policy_rules is '규제·세율 설정값. 기준일·출처와 함께 기획이 갱신.';

-- ---------------------------------------------------------------------------
-- 운영 지표 (DB 용량, 수집 결과)
-- ---------------------------------------------------------------------------
create table public.ops_metrics (
  id            bigint generated always as identity primary key,
  recorded_at   timestamptz not null default now(),
  job           text    not null,                -- 예: trades_daily, trades_archive, kapt_sync
  db_size_bytes bigint,                          -- pg_database_size
  fetched_count integer,
  upserted_count integer,
  error_count   integer not null default 0,
  detail        jsonb
);
create index ops_metrics_recorded_at_idx on public.ops_metrics (recorded_at desc);

-- ---------------------------------------------------------------------------
-- 사용자 데이터 (RLS: 본인만)
-- ---------------------------------------------------------------------------
create table public.user_profile (
  user_id               uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  seed_money            integer,                    -- 종잣돈 만원
  annual_income         integer check (annual_income >= 0),  -- 연소득(세전) 만원, null = 미입력
  existing_annual_debt  integer not null default 0 check (existing_annual_debt >= 0),  -- 기존 대출 연간 원리금 만원
  house_count           smallint not null default 0 check (house_count between 0 and 2),  -- 0 무주택 / 1 1주택 / 2 2주택 이상
  is_first_time_buyer   boolean not null default false,
  interest_rate         numeric(5,3) check (interest_rate >= 0),  -- 연 %, null = 설정값 사용
  loan_term_years       smallint not null default 30 check (loan_term_years between 1 and 50),
  repayment_type        text not null default 'annuity' check (repayment_type in ('annuity')),  -- 원리금균등
  include_moving_cost   boolean not null default false,
  moving_cost           integer not null default 0 check (moving_cost >= 0),  -- 이사비 만원
  lender_type           text not null default 'bank' check (lender_type in ('bank', 'non_bank')),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
comment on table public.user_profile is '내 조건(명세 2절). 금액은 만원.';

create table public.user_complexes (
  user_id      uuid    not null default auth.uid() references auth.users (id) on delete cascade,
  area_type_id integer not null references public.area_types (id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (user_id, area_type_id)
);
comment on table public.user_complexes is '스크랩(내 단지 목록). 단지의 평형 단위로 저장.';

create table public.user_area_notes (
  user_id      uuid    not null default auth.uid() references auth.users (id) on delete cascade,
  area_type_id integer not null references public.area_types (id) on delete cascade,
  rooms        smallint check (rooms between 0 and 20),
  bathrooms    smallint check (bathrooms between 0 and 20),
  supply_area  numeric(6,2) check (supply_area > 0),  -- 직접 입력 공급면적 ㎡
  memo         text check (char_length(memo) <= 1000),
  updated_at   timestamptz not null default now(),
  primary key (user_id, area_type_id)
);
comment on table public.user_area_notes is '평형별 직접 입력(방·화장실·공급면적·메모). 본인만.';

create trigger user_profile_set_updated_at
  before update on public.user_profile
  for each row execute function public.set_updated_at();
create trigger user_area_notes_set_updated_at
  before update on public.user_area_notes
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 권한 + RLS
-- ---------------------------------------------------------------------------
-- 공개 읽기 테이블: anon/authenticated 는 SELECT 만, 쓰기는 service_role(RLS 우회)만
do $$
declare
  t text;
begin
  foreach t in array array[
    'sigungu_codes', 'sigungu_code_changes', 'complexes', 'area_types',
    'trades_recent', 'trades_archive', 'policy_rules'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to anon, authenticated', t);
    execute format('create policy "public read" on public.%I for select to anon, authenticated using (true)', t);
  end loop;
end;
$$;

revoke all on public.trades_7y from anon, authenticated;
grant select on public.trades_7y to anon, authenticated;

-- 운영 지표: 로그인 사용자 읽기만
alter table public.ops_metrics enable row level security;
revoke all on public.ops_metrics from anon, authenticated;
grant select on public.ops_metrics to authenticated;
create policy "authenticated read" on public.ops_metrics for select to authenticated using (true);

-- 사용자 데이터: 본인 행만
do $$
declare
  t text;
begin
  foreach t in array array['user_profile', 'user_complexes', 'user_area_notes'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format($p$create policy "own rows select" on public.%I for select to authenticated
                     using (user_id = (select auth.uid()))$p$, t);
    execute format($p$create policy "own rows insert" on public.%I for insert to authenticated
                     with check (user_id = (select auth.uid()))$p$, t);
    execute format($p$create policy "own rows update" on public.%I for update to authenticated
                     using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))$p$, t);
    execute format($p$create policy "own rows delete" on public.%I for delete to authenticated
                     using (user_id = (select auth.uid()))$p$, t);
  end loop;
end;
$$;

