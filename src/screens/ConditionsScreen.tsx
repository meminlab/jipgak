/** 내 조건 화면(명세 2절, 시안 4-conditions). user_profile 에 저장한다. */
import { LogOut } from 'lucide-react'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Banner, Disclaimer, MoneyField, Segmented, Toggle } from '../components/ui'
import type { HouseCount, LenderType } from '../lib/calc/engine'
import { disclaimerText } from '../lib/calc/notices'
import { buildPolicy, defaultInterestRatePct } from '../lib/calc/policy'
import {
  formatMoneyInput,
  formatRateInput,
  formFromRow,
  setHouseCount,
  validateForm,
  type ProfileErrors,
  type ProfileForm,
  type ProfileRow,
} from '../lib/profileForm'
import { fetchPolicyRules, fetchProfile, saveProfile, signOut } from '../lib/repo'

const HOUSE_OPTIONS = [
  { value: 0, label: '무주택' },
  { value: 1, label: '1주택' },
  { value: 2, label: '2주택 이상' },
] as const
const LENDER_OPTIONS = [
  { value: 'bank', label: '은행' },
  { value: 'non_bank', label: '2금융권' },
] as const

type Load =
  | { state: 'loading' }
  | { state: 'error'; message: string }
  | { state: 'ready'; row: ProfileRow | null; regulationDate: string | null; defaultRate: number | null }

type Save = { state: 'idle' } | { state: 'saving' } | { state: 'saved' } | { state: 'error'; message: string }

function today(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function rateText(rate: number | null): string {
  if (rate === null) return ''
  return Number.isInteger(rate) ? rate.toFixed(1) : String(rate)
}

function savedLabel(updatedAt: string | undefined): string {
  if (!updatedAt) return '아직 저장 전'
  const d = new Date(updatedAt)
  return `저장됨 ${d.getMonth() + 1}.${String(d.getDate()).padStart(2, '0')}`
}

async function loadConditions(): Promise<Load> {
  try {
    const [row, rules] = await Promise.all([fetchProfile(), fetchPolicyRules()])
    const policy = buildPolicy(rules, today())
    return { state: 'ready', row, regulationDate: policy.regulationDate, defaultRate: defaultInterestRatePct(policy) }
  } catch {
    return { state: 'error', message: '내 조건을 불러오지 못했어요. 연결을 확인하고 다시 시도해 주세요.' }
  }
}

export default function ConditionsScreen({ userId }: { userId: string }) {
  const [load, setLoad] = useState<Load>({ state: 'loading' })
  const [form, setForm] = useState<ProfileForm>(() => formFromRow(null))
  const [errors, setErrors] = useState<ProfileErrors>({})
  const [save, setSave] = useState<Save>({ state: 'idle' })

  const apply = useCallback((l: Load) => {
    if (l.state === 'ready') setForm(formFromRow(l.row))
    setLoad(l)
  }, [])

  useEffect(() => {
    let alive = true
    loadConditions().then((l) => alive && apply(l))
    return () => {
      alive = false
    }
  }, [apply])

  const reload = () => {
    setLoad({ state: 'loading' })
    void loadConditions().then(apply)
  }

  const update = (patch: Partial<ProfileForm>) => {
    setForm((f) => ({ ...f, ...patch }))
    const keys = Object.keys(patch) as (keyof ProfileForm)[]
    setErrors((e) => {
      const next = { ...e }
      for (const k of keys) delete next[k]
      return next
    })
    if (save.state !== 'saving') setSave({ state: 'idle' })
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const result = validateForm(form)
    if (!result.ok) {
      setErrors(result.errors)
      setSave({ state: 'idle' })
      return
    }
    setSave({ state: 'saving' })
    try {
      const row = await saveProfile(userId, result.values)
      setForm(formFromRow(row))
      setLoad((l) => (l.state === 'ready' ? { ...l, row } : l))
      setSave({ state: 'saved' })
    } catch {
      setSave({ state: 'error', message: '연결을 확인하고 다시 저장해 주세요. 입력한 값은 그대로 있어요.' })
    }
  }

  return (
    <section className="screen" aria-labelledby="conditions-title">
      <header className="appbar">
        <h1 id="conditions-title">내 조건</h1>
        {load.state === 'ready' && <span className="caption">{savedLabel(load.row?.updated_at)}</span>}
        <button type="button" className="iconbtn" onClick={() => void signOut()} aria-label="로그아웃">
          <LogOut aria-hidden size={20} strokeWidth={1.75} />
        </button>
      </header>

      {load.state === 'loading' && (
        <p className="loading" role="status" aria-live="polite">
          내 조건을 불러오는 중이에요…
        </p>
      )}

      {load.state === 'error' && (
        <div className="stack">
          <Banner kind="danger" title="불러오지 못했어요">
            {load.message}
          </Banner>
          <button type="button" className="btn secondary" onClick={reload}>
            다시 시도
          </button>
        </div>
      )}

      {load.state === 'ready' && (
        <form className="stack" onSubmit={onSubmit} noValidate>
          {load.row === null && (
            <p className="intro">종잣돈과 소득을 넣으면 단지마다 대출 가능액과 필요 자금을 계산해 드려요.</p>
          )}

          <div className="card stack">
            <MoneyField
              label="종잣돈"
              value={form.seedMoney}
              onChange={(t) => update({ seedMoney: formatMoneyInput(t) })}
              error={errors.seedMoney}
              placeholder="예: 50,000"
            />
            <MoneyField
              label="연소득 (세전, 부부 합산이면 합산)"
              value={form.annualIncome}
              onChange={(t) => update({ annualIncome: formatMoneyInput(t) })}
              error={errors.annualIncome}
              hint={form.annualIncome === '' ? '비우면 DSR은 계산 불가로 표시돼요' : undefined}
              placeholder="비워도 돼요"
            />
            <MoneyField
              label="기존 대출 연간 원리금"
              value={form.existingAnnualDebt}
              onChange={(t) => update({ existingAnnualDebt: formatMoneyInput(t) })}
              error={errors.existingAnnualDebt}
            />
          </div>

          <div className="card stack">
            <Segmented<HouseCount>
              label="주택 수"
              options={HOUSE_OPTIONS}
              value={form.houseCount}
              onChange={(v) => {
                setForm((f) => setHouseCount(f, v))
                if (save.state !== 'saving') setSave({ state: 'idle' })
              }}
            />
            <Toggle
              label="생애최초 구입"
              caption="무주택일 때만 선택 가능"
              checked={form.isFirstTimeBuyer}
              disabled={form.houseCount !== 0}
              onChange={(v) => update({ isFirstTimeBuyer: v })}
            />
            <Segmented<LenderType>
              label="금융권"
              options={LENDER_OPTIONS}
              value={form.lenderType}
              onChange={(v) => update({ lenderType: v })}
            />
          </div>

          <div className="card stack">
            <div className="grid2">
              <div className="field">
                <label htmlFor="rate">금리</label>
                <div className={`input${errors.interestRate ? ' invalid' : ''}`}>
                  <input
                    id="rate"
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder={rateText(load.defaultRate)}
                    value={form.interestRate}
                    onChange={(e) => update({ interestRate: formatRateInput(e.target.value) })}
                    aria-invalid={errors.interestRate ? true : undefined}
                    aria-describedby="rate-help"
                  />
                  <span className="u">%</span>
                </div>
              </div>
              <div className="field">
                <label htmlFor="term">만기</label>
                <div className={`input${errors.loanTermYears ? ' invalid' : ''}`}>
                  <input
                    id="term"
                    inputMode="numeric"
                    autoComplete="off"
                    value={form.loanTermYears}
                    onChange={(e) => update({ loanTermYears: e.target.value.replace(/\D/g, '').slice(0, 2) })}
                    aria-invalid={errors.loanTermYears ? true : undefined}
                    aria-describedby="rate-help"
                  />
                  <span className="u">년</span>
                </div>
              </div>
            </div>
            <p id="rate-help" className={errors.interestRate || errors.loanTermYears ? 'help error' : 'help'}>
              {errors.interestRate ??
                errors.loanTermYears ??
                (form.interestRate === '' && load.defaultRate !== null
                  ? `비우면 기본값 ${rateText(load.defaultRate)}% (설정값)`
                  : '스트레스 금리는 계산할 때 자동으로 더해요')}
            </p>

            <div className="field">
              <span className="field-label">상환 방식</span>
              <p className="static-value">원리금균등</p>
            </div>

            <Toggle
              label="이사비 포함"
              checked={form.includeMovingCost}
              onChange={(v) => update({ includeMovingCost: v })}
            />
            {form.includeMovingCost && (
              <MoneyField
                label="이사비"
                inlineLabel="이사비"
                value={form.movingCost}
                onChange={(t) => update({ movingCost: formatMoneyInput(t) })}
                error={errors.movingCost}
              />
            )}
          </div>

          {save.state === 'saved' && <Banner kind="ok" title="저장했어요" />}
          {save.state === 'error' && (
            <Banner kind="danger" title="저장하지 못했어요">
              {save.message}
            </Banner>
          )}
          {Object.keys(errors).length > 0 && (
            <p className="help error" role="alert">
              빨간 칸을 확인해 주세요.
            </p>
          )}

          <button type="submit" className="btn primary" disabled={save.state === 'saving'}>
            {save.state === 'saving' ? '저장하는 중…' : '저장하기'}
          </button>

          <Disclaimer>{disclaimerText(load.regulationDate)}</Disclaimer>
        </form>
      )}
    </section>
  )
}
