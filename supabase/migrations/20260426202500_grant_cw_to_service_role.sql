-- Edge Functions use the Supabase service role key. RLS bypass still requires
-- table privileges on non-public schemas, so grant cw access to service_role
-- without reopening anon access.

grant usage on schema cw to service_role;
grant select, insert, update, delete on all tables in schema cw to service_role;
grant usage, select on all sequences in schema cw to service_role;
