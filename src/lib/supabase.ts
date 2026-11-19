/**
 * 저장소 접근은 이 모듈로 모은다. 화면은 supabase-js 를 직접 import 하지 않고 여기서 가져간다.
 * 클라이언트에는 anon 키만 쓴다(명세 10절). 데이터 보호는 DB RLS 가 맡는다.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './database.types'
import { readPublicEnv } from './env'

export type { Database }

let client: SupabaseClient<Database> | null = null

/** 환경변수가 없으면 null (뼈대 단계에서는 화면이 "설정 필요" 상태를 보여준다). */
export function getSupabase(): SupabaseClient<Database> | null {
  if (client) return client
  const env = readPublicEnv(import.meta.env)
  if (!env.supabaseUrl || !env.supabaseAnonKey) return null
  client = createClient<Database>(env.supabaseUrl, env.supabaseAnonKey)
  return client
}
