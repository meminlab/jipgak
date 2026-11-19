import { describe, expect, it } from 'vitest'
import { readPublicEnv } from './env'

describe('readPublicEnv', () => {
  it('reads the three public keys', () => {
    const env = readPublicEnv({
      VITE_SUPABASE_URL: 'http://localhost:54321',
      VITE_SUPABASE_ANON_KEY: 'anon',
      VITE_KAKAO_JS_KEY: 'js',
    })
    expect(env).toEqual({
      supabaseUrl: 'http://localhost:54321',
      supabaseAnonKey: 'anon',
      kakaoJsKey: 'js',
      missing: [],
    })
  })

  it('treats empty or blank values as missing', () => {
    const env = readPublicEnv({ VITE_SUPABASE_URL: '  ', VITE_SUPABASE_ANON_KEY: '' })
    expect(env.supabaseUrl).toBeNull()
    expect(env.missing).toEqual(['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'VITE_KAKAO_JS_KEY'])
  })

  it('ignores server-only keys', () => {
    const env = readPublicEnv({ DATA_GO_KR_KEY: 'secret', SUPABASE_SERVICE_ROLE_KEY: 'secret' })
    expect(Object.values(env)).not.toContain('secret')
  })
})
