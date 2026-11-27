/** 공통 UI 조각(docs/design.md 컴포넌트 기준). 상태 없는 표시용만 둔다. */
import { CircleAlert, CircleCheck, Info } from 'lucide-react'
import { useId, type ReactNode } from 'react'
import { formatManwon } from '../lib/money'
import { parseManwon } from '../lib/profileForm'

export function Disclaimer({ children }: { children: ReactNode }) {
  return (
    <p className="disclaimer">
      <Info aria-hidden size={14} strokeWidth={1.75} />
      <span>{children}</span>
    </p>
  )
}

export function Banner({ kind, title, children }: { kind: 'danger' | 'ok'; title: string; children?: ReactNode }) {
  const Icon = kind === 'danger' ? CircleAlert : CircleCheck
  return (
    <div className={`banner ${kind}`} role={kind === 'danger' ? 'alert' : 'status'}>
      <Icon aria-hidden size={20} strokeWidth={1.75} />
      <div>
        <b>{title}</b>
        {children}
      </div>
    </div>
  )
}

interface MoneyFieldProps {
  label: string
  value: string
  onChange: (text: string) => void
  error?: string
  /** 금액 아래 설명(없으면 억·만 환산만) */
  hint?: string
  placeholder?: string
  inlineLabel?: string
}

/** 금액 입력(만원). 숫자 키패드, 천 단위 쉼표, 아래에 억·만 환산 표시. */
export function MoneyField({ label, value, onChange, error, hint, placeholder, inlineLabel }: MoneyFieldProps) {
  const id = useId()
  const v = parseManwon(value)
  const conversion = v === null ? null : `= ${formatManwon(v)}`
  return (
    <div className="field">
      {!inlineLabel && <label htmlFor={id}>{label}</label>}
      <div className={`input${error ? ' invalid' : ''}`}>
        {inlineLabel && (
          <label htmlFor={id} className="inline-label">
            {inlineLabel}
          </label>
        )}
        <input
          id={id}
          inputMode="numeric"
          autoComplete="off"
          enterKeyHint="next"
          placeholder={placeholder ?? '0'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={`${id}-help`}
          aria-label={inlineLabel ? label : undefined}
        />
        <span className="u">만원</span>
      </div>
      <p id={`${id}-help`} className={error ? 'help error' : 'help'}>
        {error ?? [conversion, hint].filter(Boolean).join(' · ')}
      </p>
    </div>
  )
}

interface SegmentedProps<T extends string | number> {
  label: string
  options: readonly { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
}

export function Segmented<T extends string | number>({ label, options, value, onChange }: SegmentedProps<T>) {
  return (
    <fieldset className="field">
      <legend>{label}</legend>
      <div className="seg" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={o.value === value}
            className={o.value === value ? 'on' : undefined}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </fieldset>
  )
}

interface ToggleProps {
  label: string
  caption?: string
  checked: boolean
  disabled?: boolean
  onChange: (checked: boolean) => void
}

export function Toggle({ label, caption, checked, disabled, onChange }: ToggleProps) {
  const id = useId()
  return (
    <div className={`toggle-row${disabled ? ' disabled' : ''}`}>
      <div>
        <label htmlFor={id} className="toggle-label">
          {label}
        </label>
        {caption && <p className="caption">{caption}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        className={`toggle${checked ? ' on' : ''}`}
        onClick={() => onChange(!checked)}
      />
    </div>
  )
}

export function EmptyState({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <div className="ic" aria-hidden>
        {icon}
      </div>
      <b>{title}</b>
      {children && <p>{children}</p>}
    </div>
  )
}
