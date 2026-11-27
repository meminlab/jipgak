/**
 * 테스트 전용: policy_rules 시드 마이그레이션의 JSON 을 그대로 읽어 Policy 를 만든다.
 * 단위 테스트가 실제로 DB 에 들어갈 값으로 QA 손계산을 검증하게 하려는 것이다.
 */
import seedSql from '../../../../supabase/migrations/20261127000000_policy_rules_seed.sql?raw'
import { buildPolicy, type Policy, type PolicyRuleRow } from '../policy'

export function seedRows(): PolicyRuleRow[] {
  const m = /jsonb_to_recordset\(\$seed\$([\s\S]*?)\$seed\$::jsonb/.exec(seedSql)
  if (!m) throw new Error('시드 마이그레이션에서 $seed$ JSON 을 찾지 못했습니다')
  return JSON.parse(m[1]) as PolicyRuleRow[]
}

/** QA 케이스 기준일(2026-11-19) 기준 Policy */
export function seedPolicy(onDate = '2026-11-19'): Policy {
  return buildPolicy(seedRows(), onDate)
}
