/** 로그인(명세 1절 시나리오 1: Supabase Auth, 본인 1계정). 이메일·비밀번호. */
import { useState, type FormEvent } from 'react'
import { Banner } from '../components/ui'
import { RepoError, signIn, signUp } from '../lib/repo'

type Mode = 'signin' | 'signup'
type Status = { state: 'idle' } | { state: 'busy' } | { state: 'error'; message: string } | { state: 'confirm' }

export default function LoginScreen() {
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState<Status>({ state: 'idle' })

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!email.trim() || password.length < 6) {
      setStatus({ state: 'error', message: '이메일과 6자 이상 비밀번호를 입력해 주세요' })
      return
    }
    setStatus({ state: 'busy' })
    try {
      if (mode === 'signin') {
        await signIn(email.trim(), password)
        // 성공하면 App 의 세션 구독이 화면을 바꾼다
      } else {
        const { needsConfirm } = await signUp(email.trim(), password)
        setStatus(needsConfirm ? { state: 'confirm' } : { state: 'idle' })
      }
    } catch (err) {
      setStatus({ state: 'error', message: err instanceof RepoError ? err.message : '로그인하지 못했어요' })
    }
  }

  return (
    <main className="screen login" aria-labelledby="login-title">
      <div className="brand">
        <h1 id="login-title">집각</h1>
        <p>내 종잣돈으로 살 각인 단지를 모아 봐요</p>
      </div>
      <form className="card stack" onSubmit={onSubmit} noValidate>
        <div className="field">
          <label htmlFor="email">이메일</label>
          <div className="input">
            <input
              id="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
        </div>
        <div className="field">
          <label htmlFor="password">비밀번호</label>
          <div className="input">
            <input
              id="password"
              type="password"
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
        </div>
        {status.state === 'error' && <Banner kind="danger" title={status.message} />}
        {status.state === 'confirm' && (
          <Banner kind="ok" title="가입 확인 메일을 보냈어요">
            메일의 링크를 누른 뒤 로그인해 주세요.
          </Banner>
        )}
        <button type="submit" className="btn primary" disabled={status.state === 'busy'}>
          {status.state === 'busy' ? '확인하는 중…' : mode === 'signin' ? '로그인' : '가입하기'}
        </button>
        <button
          type="button"
          className="btn text"
          onClick={() => {
            setMode(mode === 'signin' ? 'signup' : 'signin')
            setStatus({ state: 'idle' })
          }}
        >
          {mode === 'signin' ? '처음이에요 · 가입하기' : '이미 계정이 있어요 · 로그인'}
        </button>
      </form>
    </main>
  )
}
