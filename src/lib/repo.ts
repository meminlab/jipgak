/**
 * 저장소 접근 모음. 화면은 supabase-js 대신 이 모듈의 함수만 쓴다.
 * (클라이언트 생성은 supabase.ts, 데이터 보호는 DB RLS)
 */
import type { Session } from '@supabase/supabase-js'
import type { PolicyRuleRow } from './calc/policy'
import type { ProfileRow, ProfileValues } from './profileForm'
import { getSupabase } from './supabase'

export class RepoError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RepoError'
  }
}

function db() {
  const client = getSupabase()
  if (!client) throw new RepoError('Supabase 설정이 없어요')
  return client
}

// ---------------------------------------------------------------------------
// 로그인 (Supabase Auth, 이메일·비밀번호)
// ---------------------------------------------------------------------------

export async function getSession(): Promise<Session | null> {
  const { data, error } = await db().auth.getSession()
  if (error) throw new RepoError(error.message)
  return data.session
}

export function onSessionChange(cb: (session: Session | null) => void): () => void {
  const { data } = db().auth.onAuthStateChange((_event, session) => cb(session))
  return () => data.subscription.unsubscribe()
}

export async function signIn(email: string, password: string): Promise<void> {
  const { error } = await db().auth.signInWithPassword({ email, password })
  if (error) throw new RepoError(authMessage(error.message))
}

/** 가입. 이메일 확인이 켜져 있으면 세션 없이 돌아온다(needsConfirm=true). */
export async function signUp(email: string, password: string): Promise<{ needsConfirm: boolean }> {
  const { data, error } = await db().auth.signUp({ email, password })
  if (error) throw new RepoError(authMessage(error.message))
  return { needsConfirm: data.session === null }
}

export async function signOut(): Promise<void> {
  const { error } = await db().auth.signOut()
  if (error) throw new RepoError(error.message)
}

function authMessage(message: string): string {
  if (/invalid login credentials/i.test(message)) return '이메일 또는 비밀번호가 맞지 않아요'
  if (/email not confirmed/i.test(message)) return '메일함에서 가입 확인 링크를 먼저 눌러 주세요'
  if (/already registered/i.test(message)) return '이미 가입된 이메일이에요. 로그인해 주세요'
  if (/password/i.test(message)) return '비밀번호는 6자 이상으로 입력해 주세요'
  return '로그인하지 못했어요. 잠시 후 다시 시도해 주세요'
}

// ---------------------------------------------------------------------------
// 내 조건 (user_profile, RLS 본인만)
// ---------------------------------------------------------------------------

const PROFILE_COLUMNS =
  'seed_money, annual_income, existing_annual_debt, house_count, is_first_time_buyer, interest_rate, loan_term_years, repayment_type, include_moving_cost, moving_cost, lender_type, updated_at'

export async function fetchProfile(): Promise<ProfileRow | null> {
  const { data, error } = await db().from('user_profile').select(PROFILE_COLUMNS).maybeSingle()
  if (error) throw new RepoError(error.message)
  return data
}

export async function saveProfile(userId: string, values: ProfileValues): Promise<ProfileRow> {
  const { data, error } = await db()
    .from('user_profile')
    .upsert({ user_id: userId, ...values }, { onConflict: 'user_id' })
    .select(PROFILE_COLUMNS)
    .single()
  if (error) throw new RepoError(error.message)
  return data
}

// ---------------------------------------------------------------------------
// 규제·세율 설정값 (policy_rules, 공개 읽기)
// ---------------------------------------------------------------------------

export async function fetchPolicyRules(): Promise<PolicyRuleRow[]> {
  const { data, error } = await db()
    .from('policy_rules')
    .select('key, region_scope, value, effective_from, effective_to, checked_on, verified')
  if (error) throw new RepoError(error.message)
  return data
}
