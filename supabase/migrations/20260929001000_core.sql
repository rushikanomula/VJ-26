create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 display_name text not null default '', farm_name text not null default '', location text not null default '',
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.scan_history (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 crop text not null, diagnosis jsonb not null, image_path text not null, annotated_path text not null,
 created_at timestamptz not null default now()
);
create index scan_history_user_created on public.scan_history(user_id,created_at desc);
create table public.saved_sessions (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 title text not null, details jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
create index saved_sessions_user_created on public.saved_sessions(user_id,created_at desc);
create table public.email_dispatches (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 scan_id uuid not null references public.scan_history(id) on delete cascade,
 recipient text not null, provider_message_id text not null,
 created_at timestamptz not null default now()
);
create index email_dispatches_user_created on public.email_dispatches(user_id,created_at desc);
alter table public.profiles enable row level security;
alter table public.scan_history enable row level security;
alter table public.saved_sessions enable row level security;
alter table public.email_dispatches enable row level security;
create policy profiles_select on public.profiles for select to authenticated using ((select auth.uid())=id);
create policy profiles_insert on public.profiles for insert to authenticated with check ((select auth.uid())=id);
create policy profiles_update on public.profiles for update to authenticated using ((select auth.uid())=id) with check ((select auth.uid())=id);
create policy scans_select on public.scan_history for select to authenticated using ((select auth.uid())=user_id);
create policy scans_insert on public.scan_history for insert to authenticated with check ((select auth.uid())=user_id and image_path like (user_id::text || '/%') and annotated_path like (user_id::text || '/%'));
create policy scans_delete on public.scan_history for delete to authenticated using ((select auth.uid())=user_id);
create policy sessions_all on public.saved_sessions for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy dispatches_select on public.email_dispatches for select to authenticated using ((select auth.uid())=user_id);
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('crop-scans','crop-scans',false,5000000,array['image/jpeg']) on conflict(id) do nothing;
create policy crop_images_read on storage.objects for select to authenticated using (bucket_id='crop-scans' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy crop_images_insert on storage.objects for insert to authenticated with check (bucket_id='crop-scans' and (storage.foldername(name))[1]=(select auth.uid())::text and lower(storage.extension(name))='jpg');
create policy crop_images_delete on storage.objects for delete to authenticated using (bucket_id='crop-scans' and (storage.foldername(name))[1]=(select auth.uid())::text);
