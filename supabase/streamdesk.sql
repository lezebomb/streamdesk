-- StreamDesk only. Apply to a dedicated Free project; no changes to other apps.
create table if not exists public.streamdesk_library (
 user_id uuid not null references auth.users(id) on delete cascade,
 kind text not null check (kind in ('favorite','history')),
 item_key text not null check (length(item_key) between 1 and 512),
 film jsonb not null check (jsonb_typeof(film)='object' and octet_length(film::text)<=16384 and film->'episodes'='[]'::jsonb and not (film ? 'groups')),
 episode_key text check (length(episode_key)<=512),
 position double precision not null default 0 check (position>=0 and position<100000000),
 updated_at bigint not null check (updated_at>0),
 deleted boolean not null default false,
 primary key (user_id,kind,item_key)
);
alter table public.streamdesk_library enable row level security;
revoke all on public.streamdesk_library from anon;
grant select,insert,update on public.streamdesk_library to authenticated;
create policy streamdesk_read_own on public.streamdesk_library for select to authenticated using ((select auth.uid())=user_id);
create policy streamdesk_insert_own on public.streamdesk_library for insert to authenticated with check ((select auth.uid())=user_id);
create policy streamdesk_update_own on public.streamdesk_library for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
-- Invoker keeps RLS in force. Never trust an owner ID supplied by the browser.
create or replace function public.streamdesk_sync_library(items jsonb) returns void
language plpgsql security invoker set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if jsonb_typeof(items)<>'array' or jsonb_array_length(items)>100 or octet_length(items::text)>1048576 then raise exception 'Sync batch too large'; end if;
 insert into public.streamdesk_library as saved(user_id,kind,item_key,film,episode_key,position,updated_at,deleted)
 select auth.uid(),item->>'kind',item->>'item_key',item->'film',item->>'episode_key',coalesce((item->>'position')::double precision,0),
 least((item->>'updated_at')::bigint,floor(extract(epoch from now())*1000)::bigint),(item->>'deleted')::boolean
 from jsonb_array_elements(items) item
 on conflict(user_id,kind,item_key) do update set film=excluded.film,episode_key=excluded.episode_key,position=excluded.position,updated_at=excluded.updated_at,deleted=excluded.deleted
 where excluded.updated_at>saved.updated_at or (excluded.updated_at=saved.updated_at and excluded.deleted and not saved.deleted);
end $$;
revoke all on function public.streamdesk_sync_library(jsonb) from public,anon;
grant execute on function public.streamdesk_sync_library(jsonb) to authenticated;
