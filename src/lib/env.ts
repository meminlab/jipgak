/**
 * 브라우저에 노출해도 되는 환경변수만 읽는다(명세 10절).
 * 서버 전용 키(DATA_GO_KR_KEY, KAKAO_REST_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_DB_URL)는
 * 여기서 읽지 않는다 — VITE_ 접두사가 없어 번들에 들어가지도 않는다.
 */
export const PUBLIC_ENV_KEYS = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'VITE_KAKAO_JS_KEY'] as const
export type PublicEnvKey = (typeof PUBLIC_ENV_KEYS)[number]

export interface PublicEnv {
  supabaseUrl: string | null
  supabaseAnonKey: string | null
  kakaoJsKey: string | null
  missing: PublicEnvKey[]
}

export function readPublicEnv(source: Partial<Record<string, string | undefined>>): PublicEnv {
  const pick = (key: PublicEnvKey) => {
    const value = source[key]?.trim()
    return value ? value : null
  }
  const values = {
    supabaseUrl: pick('VITE_SUPABASE_URL'),
    supabaseAnonKey: pick('VITE_SUPABASE_ANON_KEY'),
    kakaoJsKey: pick('VITE_KAKAO_JS_KEY'),
  }
  const missing = PUBLIC_ENV_KEYS.filter((key) => pick(key) === null)
  return { ...values, missing }
}
