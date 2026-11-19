import { readPublicEnv } from './lib/env'

// 뼈대 화면. 지도·단지 상세·내 단지 목록·내 조건 화면은 각 하위 이슈에서 디자인 시안(BANB-63) 기준으로 만든다.
export default function App() {
  const env = readPublicEnv(import.meta.env)
  return (
    <main className="app">
      <h1>집각</h1>
      <p>실거래가 지도 + 내 종잣돈·대출로 살 수 있는 아파트 단지 관리</p>
      {env.missing.length > 0 && (
        <p role="status" className="notice">
          설정 필요: {env.missing.join(', ')}
        </p>
      )}
    </main>
  )
}
