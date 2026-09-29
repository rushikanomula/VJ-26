create table if not exists public.vision_rate_limits (
 user_id uuid not null references auth.users(id) on delete cascade,
 window_start timestamptz not null,
 request_count integer not null check(request_count between 1 and 20),
 primary key(user_id,window_start)
);
alter table public.vision_rate_limits enable row level security;
revoke all on public.vision_rate_limits from anon,authenticated;
create or replace function public.allow_vision_request(p_user_id uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare accepted boolean;
begin
 insert into public.vision_rate_limits(user_id,window_start,request_count)
 values(p_user_id,date_trunc('hour',now()),1)
 on conflict(user_id,window_start) do update
 set request_count=public.vision_rate_limits.request_count+1
 where public.vision_rate_limits.request_count<20
 returning true into accepted;
 return coalesce(accepted,false);
end;$$;
revoke all on function public.allow_vision_request(uuid) from public,anon,authenticated;
grant execute on function public.allow_vision_request(uuid) to service_role;
