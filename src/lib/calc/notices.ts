/** 계산 결과 안내 문구(명세 5절, BANB-64 v1.1). 엔진은 코드만 돌려주고 문구는 여기서 고른다. */
import type { NoticeCode } from './engine'

export const NOTICE_TEXT: Record<NoticeCode, string> = {
  multiHouseBanned: '주담대 불가 지역이에요. 2주택 이상이면 수도권·규제지역에서 주택담보대출을 받을 수 없어요.',
  disposalCondition: '기존 주택을 6개월 안에 처분하는 조건입니다.',
  dsrUnavailable: '연소득이 없어 DSR은 계산 불가예요. LTV 기준만 썼어요.',
  stressRateType: '고정·혼합형 금리는 한도가 더 클 수 있습니다.',
  temporaryTwoHouseTax: '기존 주택을 기한 안에 처분하지 않으면 8% 중과로 추징됩니다.',
  threePlusHouseTax: '3주택 이상 보유 시 12%',
}

/** 모든 계산 결과 옆에 붙이는 고지 문구(명세 2절). */
export function disclaimerText(regulationDate: string | null): string {
  return `참고용 계산이며 실제 대출 한도는 금융기관 심사에 따릅니다. 규제 기준일: ${regulationDate ?? '확인 필요'}`
}
