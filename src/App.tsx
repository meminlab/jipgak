import type { Session } from '@supabase/supabase-js'
import { Map as MapIcon, SlidersHorizontal, Star } from 'lucide-react'
import { useEffect, useState } from 'react'
import { EmptyState } from './components/ui'
import { readPublicEnv } from './lib/env'
import { getSession, onSessionChange } from './lib/repo'
import ConditionsScreen from './screens/ConditionsScreen'
import LoginScreen from './screens/LoginScreen'

type Tab = 'map' | 'list' | 'conditions'

const TABS = [
  { id: 'map', label: '지도', Icon: MapIcon },
  { id: 'list', label: '내 단지', Icon: Star },
  { id: 'conditions', label: '내 조건', Icon: SlidersHorizontal },
] as const

export default function App() {
  const env = readPublicEnv(import.meta.env)
  if (!env.supabaseUrl || !env.supabaseAnonKey) {
    return (
      <main className="screen">
        <h1>집각</h1>
        <p role="status" className="notice">
          설정 필요: {env.missing.join(', ')}
        </p>
      </main>
    )
  }
  return <AuthGate />
}

function AuthGate() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)

  useEffect(() => {
    let alive = true
    getSession()
      .then((s) => alive && setSession(s))
      .catch(() => alive && setSession(null))
    const unsubscribe = onSessionChange((s) => setSession(s))
    return () => {
      alive = false
      unsubscribe()
    }
  }, [])

  if (session === undefined) {
    return (
      <p className="loading" role="status">
        불러오는 중이에요…
      </p>
    )
  }
  if (session === null) return <LoginScreen />
  return <Shell userId={session.user.id} />
}

function Shell({ userId }: { userId: string }) {
  // 지도·내 단지 화면은 각 하위 이슈(BANB-68·70)에서 만든다. 지금은 내 조건이 첫 화면.
  const [tab, setTab] = useState<Tab>('conditions')
  return (
    <div className="shell">
      <div className="shell-body">
        {tab === 'conditions' ? (
          <ConditionsScreen userId={userId} />
        ) : (
          <section className="screen">
            <EmptyState
              icon={tab === 'map' ? <MapIcon size={20} /> : <Star size={20} />}
              title={tab === 'map' ? '지도는 준비 중이에요' : '내 단지 목록은 준비 중이에요'}
            >
              먼저 내 조건을 저장해 두면, 화면이 열리는 대로 단지마다 필요 자금을 바로 볼 수 있어요.
            </EmptyState>
          </section>
        )}
      </div>
      <nav className="tabbar" aria-label="화면">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            className={tab === id ? 'on' : undefined}
            aria-current={tab === id ? 'page' : undefined}
            onClick={() => setTab(id)}
          >
            <Icon aria-hidden size={20} strokeWidth={1.75} />
            {label}
          </button>
        ))}
      </nav>
    </div>
  )
}
