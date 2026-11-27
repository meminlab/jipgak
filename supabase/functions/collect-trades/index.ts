// 실거래 수집 Edge Function — BANB-66 (명세 3·4·6·7절)
//
// 호출: POST /functions/v1/collect-trades   헤더 x-cron-secret: <CRON_SECRET>
//   body { "mode": "daily" }     매일 최근 3개월(이번 달 포함)을 다시 받아 신규·해제 반영
//   body { "mode": "backfill" }  최초 7년(84개월) 적재. 끊어서 여러 번 호출하면 남은 것부터 이어 받는다.
//   선택: "codes": ["11680"], "months": ["202610"]  (특정 시군구·월만, 1개월 실측용)
//         "budgetMs": 110000  (한 번 호출에서 쓸 시간. 무료 플랜 wall clock 150초 안)
//
// 진행 상태는 ops_metrics 에 남긴다. job = trades_daily | trades_backfill,
//   detail = { run, done: [시군구:월…], failed: [{key, error}], stopped }
//   run 은 daily 면 서울 날짜(YYYY-MM-DD), backfill 이면 'init'. 같은 run 의 done 은 다시 받지 않는다.
// 오류 처리(명세 6절): 한도 초과·인증 오류면 즉시 멈추고 기록한다. 다음 cron 호출(또는 다음 날)이 남은 것부터 다시 시도한다.
//
// 필요한 secrets: DATA_GO_KR_KEY, CRON_SECRET (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 는 기본 제공)

import { createClient } from '@supabase/supabase-js'
import {
  buildRtmsUrl,
  type CollectMode,
  MONTHS_BY_MODE,
  normalizeTrade,
  PAGE_SIZE,
  parseRtmsResponse,
  pendingTasks,
  recentMonths,
  type RtmsErrorKind,
  seoulToday,
  type TradeRow,
} from '../_shared/rtms.ts'

const DEFAULT_BUDGET_MS = 110_000
const FETCH_TIMEOUT_MS = 20_000

class StopError extends Error {
  constructor(
    public kind: RtmsErrorKind,
    message: string,
  ) {
    super(message)
  }
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

/** 시군구×월 전체 페이지를 받는다. API 호출 수는 오류가 나도 세도록 counter 에 바로 더한다(일 10,000건 한도 추적). */
async function fetchMonth(
  serviceKey: string,
  code: string,
  ym: string,
  counter: { calls: number },
): Promise<{ rows: TradeRow[]; fetched: number }> {
  const rows: TradeRow[] = []
  let fetched = 0
  for (let page = 1; ; page++) {
    counter.calls++
    const res = await fetch(buildRtmsUrl(serviceKey, code, ym, page), {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    const text = await res.text()
    if (!res.ok && !text.includes('<')) {
      throw new Error(`HTTP ${res.status}`)
    }
    const parsed = parseRtmsResponse(text)
    if (!parsed.ok) {
      const msg = `${parsed.code} ${parsed.message}`.trim()
      if (parsed.errorKind === 'auth' || parsed.errorKind === 'limit') throw new StopError(parsed.errorKind, msg)
      throw new Error(msg)
    }
    fetched += parsed.items.length
    for (const item of parsed.items) {
      const row = normalizeTrade(item)
      if (row) rows.push(row)
    }
    if (parsed.items.length < PAGE_SIZE || fetched >= parsed.totalCount) break
  }
  return { rows, fetched }
}

Deno.serve(async (req) => {
  const cronSecret = Deno.env.get('CRON_SECRET')
  if (!cronSecret || req.headers.get('x-cron-secret') !== cronSecret) {
    return json(401, { error: 'unauthorized' })
  }
  const serviceKey = Deno.env.get('DATA_GO_KR_KEY')
  if (!serviceKey) return json(500, { error: 'DATA_GO_KR_KEY not set' })

  const body = (await req.json().catch(() => ({}))) as {
    mode?: CollectMode
    codes?: string[]
    months?: string[]
    budgetMs?: number
  }
  const mode: CollectMode = body.mode === 'backfill' ? 'backfill' : 'daily'
  const budgetMs = Math.min(Math.max(body.budgetMs ?? DEFAULT_BUDGET_MS, 5_000), 140_000)
  const started = Date.now()
  const today = seoulToday()
  const job = mode === 'daily' ? 'trades_daily' : 'trades_backfill'
  const run = body.months?.length ? `manual:${today}` : mode === 'daily' ? today : 'init'

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  })

  // 대상 시군구
  let codes = body.codes
  if (!codes?.length) {
    const { data, error } = await db.from('sigungu_codes').select('code').eq('is_collected', true)
    if (error) return json(500, { error: error.message })
    codes = data.map((r) => r.code as string)
  }
  const months = body.months?.length ? body.months : recentMonths(today, MONTHS_BY_MODE[mode])

  // 같은 run 에서 이미 끝난 작업
  const { data: prior, error: priorErr } = await db
    .from('ops_metrics')
    .select('detail')
    .eq('job', job)
    .eq('detail->>run', run)
  if (priorErr) return json(500, { error: priorErr.message })
  const done = new Set<string>(prior.flatMap((r) => (r.detail?.done as string[] | undefined) ?? []))
  const tasks = pendingTasks(codes, months, done)

  if (tasks.length === 0) {
    const alreadyComplete = prior.some((r) => r.detail?.complete === true)
    if (!alreadyComplete) {
      await db.rpc('log_ops_metric', { p_job: job, p_detail: { run, complete: true, done: [] } })
    }
    return json(200, { run, complete: true })
  }

  const doneNow: string[] = []
  const failed: { key: string; error: string }[] = []
  let stopped: string | null = null
  let fetched = 0
  let upserted = 0
  const counter = { calls: 0 }

  for (const t of tasks) {
    if (Date.now() - started > budgetMs) {
      stopped = 'budget'
      break
    }
    try {
      const r = await fetchMonth(serviceKey, t.code, t.ym, counter)
      fetched += r.fetched
      if (r.rows.length > 0) {
        const { data, error } = await db.rpc('ingest_trades', {
          p_sigungu_code: t.code,
          p_rows: r.rows,
          p_today: today,
        })
        if (error) throw new Error(`ingest: ${error.message}`)
        upserted += (data as { upserted?: number } | null)?.upserted ?? 0
      }
      doneNow.push(t.key)
    } catch (e) {
      if (e instanceof StopError) {
        stopped = e.kind
        failed.push({ key: t.key, error: e.message })
        break
      }
      failed.push({ key: t.key, error: e instanceof Error ? e.message : String(e) })
    }
  }

  // 최초 적재 중에는 24개월 지난 달이 trades_recent 에 쌓이므로 호출마다 압축 이관한다.
  let archive: unknown = null
  if (mode === 'backfill' && doneNow.length > 0) {
    const { data, error } = await db.rpc('archive_trades', { p_today: today })
    archive = error ? { error: error.message } : data
  }

  const remaining = tasks.length - doneNow.length
  const detail = {
    run,
    done: doneNow,
    failed,
    stopped,
    remaining,
    calls: counter.calls,
    elapsed_ms: Date.now() - started,
    ...(archive ? { archive } : {}),
  }
  await db.rpc('log_ops_metric', {
    p_job: job,
    p_fetched_count: fetched,
    p_upserted_count: upserted,
    p_error_count: failed.length,
    p_detail: detail,
  })

  return json(failed.length > 0 && doneNow.length === 0 ? 502 : 200, detail)
})
