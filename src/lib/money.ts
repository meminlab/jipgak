/**
 * 금액 표시(명세 5절): 억·만원 단위. 입력 단위는 DB와 같은 "만원" 정수.
 *   formatManwon(73500) === '7억 3,500만'
 *   formatManwon(-1200) === '-1,200만'
 */
export function formatManwon(manwon: number): string {
  if (!Number.isFinite(manwon)) throw new RangeError(`invalid amount: ${manwon}`)
  const rounded = Math.round(manwon)
  if (rounded === 0) return '0원'
  const abs = Math.abs(rounded)
  const eok = Math.floor(abs / 10000)
  const man = abs % 10000
  const parts: string[] = []
  if (eok > 0) parts.push(`${eok.toLocaleString('ko-KR')}억`)
  if (man > 0) parts.push(`${man.toLocaleString('ko-KR')}만`)
  return (rounded < 0 ? '-' : '') + parts.join(' ')
}
