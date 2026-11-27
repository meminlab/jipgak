-- 실거래 수집 cron 등록 (BANB-66). 운영 DB 에 한 번만 실행한다. 마이그레이션이 아닌 이유: 프로젝트별 URL·비밀값을
-- Vault 에 먼저 넣어야 하고, 로컬 개발 DB 에서는 돌 필요가 없기 때문이다. 절차는 docs/ops-collect.md.
--
-- 선행: Vault 비밀 2개 (값은 커밋·댓글 금지)
--   select vault.create_secret('https://<project-ref>.supabase.co/functions/v1/collect-trades', 'collect_trades_url');
--   select vault.create_secret('<CRON_SECRET 과 같은 값>', 'collect_trades_cron_secret');
--
-- 시간은 UTC. 한국시간 = UTC + 9.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 일일 갱신: 매일 04:00~05:50 KST 10분마다. 한 번에 다 못 끝내면 다음 호출이 이어 받고, 끝났으면 바로 반환한다.
select cron.schedule('collect-trades-daily', '*/10 19-20 * * *',
  $$select net.http_post(
     url := (select decrypted_secret from vault.decrypted_secrets where name = 'collect_trades_url'),
     headers := jsonb_build_object('content-type', 'application/json',
       'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'collect_trades_cron_secret')),
     body := '{"mode":"daily"}'::jsonb,
     timeout_milliseconds := 150000)$$);

-- 최초 7년 적재: 5분마다. 끝나면(ops_metrics 에 complete) 아래 unschedule 로 해제한다.
--   select cron.unschedule('collect-trades-backfill');
select cron.schedule('collect-trades-backfill', '*/5 * * * *',
  $$select net.http_post(
     url := (select decrypted_secret from vault.decrypted_secrets where name = 'collect_trades_url'),
     headers := jsonb_build_object('content-type', 'application/json',
       'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'collect_trades_cron_secret')),
     body := '{"mode":"backfill"}'::jsonb,
     timeout_milliseconds := 150000)$$);

-- 월 1회 이관·삭제: 매월 2일 03:00 KST (UTC 1일 18:00)
select cron.schedule('archive-trades-monthly', '0 18 1 * *',
  $$select public.log_ops_metric('trades_archive', null, null, 0, public.archive_trades((now() at time zone 'Asia/Seoul')::date))$$);
