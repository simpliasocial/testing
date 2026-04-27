alter table cw.automated_reports
    add column if not exists report_scope text not null default 'tab',
    add column if not exists tab_ids text[] not null default '{}'::text[],
    add column if not exists critical_profile_key text,
    add column if not exists file_formats text[] not null default array['excel']::text[],
    add column if not exists date_range_mode text not null default 'closed_period',
    add column if not exists filters jsonb not null default '{}'::jsonb,
    add column if not exists created_by uuid references auth.users(id) on delete set null,
    add column if not exists created_by_email text,
    add column if not exists last_status text,
    add column if not exists last_error text;

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'automated_reports_scope_check'
          and conrelid = 'cw.automated_reports'::regclass
    ) then
        alter table cw.automated_reports
            add constraint automated_reports_scope_check
            check (report_scope in ('tab', 'critical_profile')) not valid;
    end if;
end $$;

alter table cw.automated_reports
    validate constraint automated_reports_scope_check;

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'automated_reports_date_range_mode_check'
          and conrelid = 'cw.automated_reports'::regclass
    ) then
        alter table cw.automated_reports
            add constraint automated_reports_date_range_mode_check
            check (date_range_mode in ('closed_period', 'current_filters')) not valid;
    end if;
end $$;

alter table cw.automated_reports
    validate constraint automated_reports_date_range_mode_check;

create index if not exists automated_reports_active_schedule_idx
    on cw.automated_reports (is_active, frequency, schedule_time);

create index if not exists automated_reports_scope_idx
    on cw.automated_reports (report_scope, critical_profile_key);

create table if not exists cw.automated_report_runs (
    id uuid primary key default gen_random_uuid(),
    automated_report_id uuid references cw.automated_reports(id) on delete set null,
    status text not null default 'running' check (status in ('running', 'success', 'error', 'skipped')),
    recipients text,
    file_formats text[] not null default '{}'::text[],
    report_scope text,
    tab_ids text[] not null default '{}'::text[],
    critical_profile_key text,
    scheduled_for timestamptz,
    started_at timestamptz not null default now(),
    finished_at timestamptz,
    error_message text,
    metadata jsonb not null default '{}'::jsonb
);

create index if not exists automated_report_runs_report_started_idx
    on cw.automated_report_runs (automated_report_id, started_at desc);

create index if not exists automated_report_runs_status_started_idx
    on cw.automated_report_runs (status, started_at desc);

alter table cw.automated_reports enable row level security;
alter table cw.automated_report_runs enable row level security;

drop policy if exists "authenticated manage automated reports" on cw.automated_reports;
create policy "authenticated manage automated reports"
    on cw.automated_reports
    for all
    to authenticated
    using (true)
    with check (true);

drop policy if exists "authenticated read automated report runs" on cw.automated_report_runs;
create policy "authenticated read automated report runs"
    on cw.automated_report_runs
    for select
    to authenticated
    using (true);

grant usage on schema cw to authenticated, service_role;
grant select, insert, update, delete on cw.automated_reports to authenticated, service_role;
grant select on cw.automated_report_runs to authenticated;
grant all on cw.automated_report_runs to service_role;

do $$
declare
    job record;
begin
    for job in
        select jobid
        from cron.job
        where jobname = 'send-scheduled-reports'
    loop
        perform cron.unschedule(job.jobid);
    end loop;
end $$;

select cron.schedule(
    'send-scheduled-reports',
    '*/5 * * * *',
    $$
    select
        net.http_post(
            url := (select decrypted_secret from vault.decrypted_secrets where name = 'chatwoot_sync_project_url') || '/functions/v1/send-scheduled-reports',
            headers := jsonb_build_object(
                'Content-Type', 'application/json',
                'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'chatwoot_sync_jwt')
            ),
            body := jsonb_build_object('source', 'pg_cron'),
            timeout_milliseconds := 60000
        ) as request_id;
    $$
);
