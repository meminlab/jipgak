-- policy_rules 초기값(BANB-65) 확인. 값 자체는 단위 테스트(src/lib/calc/engine.test.ts)가 QA 손계산으로 검증한다.
begin;
select plan(6);

select is(
  (select count(distinct key)::int from public.policy_rules),
  16,
  '설정 key 16종'
);

select is(
  (select count(*)::int from public.policy_rules where source_url is null and verified),
  1,
  '출처 URL 없이 verified=true 인 행은 반영비율(기획 결정 Q9) 1개뿐'
);

select ok(
  (select bool_and(checked_on = date '2026-11-19') from public.policy_rules),
  '모든 행에 확인일 2026-11-19'
);

select ok(
  (select value -> 'codes' ? '11680' from public.policy_rules where key = 'region.regulated_sigungu'),
  '규제지역 목록에 강남구(11680) 포함'
);

select is(
  (select array_agg(key || '/' || region_scope order by key, region_scope) from public.policy_rules where not verified),
  array[
    'dsr.stress_rate/all', 'fee.legal_registration/all', 'loan.default_interest_rate/all',
    'ltv.multi_house/all', 'ltv.multi_house/capital', 'region.regulated_sigungu/all',
    'tax.acquisition.multi_owner/all', 'tax.acquisition.multi_owner/regulated', 'tax.first_time_relief/all'
  ],
  'verified=false: ⚠️ 항목 + 추정 설정값 + 동탄구 코드 미확인 목록'
);

set local role anon;
select is((select count(*)::int from public.policy_rules), 21, 'anon 도 설정값 21행을 읽을 수 있음');
reset role;

select * from finish();
rollback;
