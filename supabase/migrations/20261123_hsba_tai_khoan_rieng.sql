-- Tách tài khoản app Kiểm tra HSBA khỏi app Công việc KHTH (dùng chung máy chủ khth-bv304)
begin;
create table public.hsba_tai_khoan (
  user_id uuid primary key references auth.users(id) on delete cascade,
  ho_ten text not null,
  email text,
  vai_tro text not null default 'can_bo' check (vai_tro in ('quan_tri','can_bo')),
  hoat_dong boolean not null default true,
  tao_luc timestamptz not null default now(),
  tao_boi uuid
);
alter table public.hsba_tai_khoan enable row level security;

create or replace function public.hsba_co_quyen() returns boolean
language sql stable security definer set search_path to 'public' as $$
  select exists(select 1 from public.hsba_tai_khoan where user_id = auth.uid() and hoat_dong);
$$;
create or replace function public.hsba_quan_tri() returns boolean
language sql stable security definer set search_path to 'public' as $$
  select exists(select 1 from public.hsba_tai_khoan where user_id = auth.uid() and hoat_dong and vai_tro = 'quan_tri');
$$;
revoke execute on function public.hsba_quan_tri() from public, anon;
grant execute on function public.hsba_quan_tri() to authenticated;

create or replace function public.hsba_tim_user(p_email text) returns uuid
language sql stable security definer set search_path to 'public','auth' as $$
  select id from auth.users where lower(email) = lower(p_email) limit 1;
$$;
revoke execute on function public.hsba_tim_user(text) from public, anon, authenticated;
grant execute on function public.hsba_tim_user(text) to service_role;

create policy hsba_tk_doc on public.hsba_tai_khoan for select to authenticated using (public.hsba_co_quyen());
create policy hsba_tk_sua on public.hsba_tai_khoan for update to authenticated using (public.hsba_quan_tri()) with check (public.hsba_quan_tri());
create policy hsba_tk_xoa on public.hsba_tai_khoan for delete to authenticated using (public.hsba_quan_tri() and user_id <> auth.uid());

-- Quản trị đầu tiên
insert into public.hsba_tai_khoan (user_id, ho_ten, email, vai_tro)
select u.id, coalesce(p.full_name, 'Phan Luu'), u.email, 'quan_tri'
from auth.users u left join public.profiles p on p.id = u.id
where lower(u.email) = 'phanluu.yhct@gmail.com';

-- Xoá hồ sơ: chỉ quản trị app HSBA
do $$ declare r record; begin
  for r in select policyname from pg_policies where schemaname='public' and tablename='hsba_ho_so' and cmd='DELETE' loop
    execute format('drop policy %I on public.hsba_ho_so', r.policyname);
  end loop;
end $$;
create policy hsba_hs_xoa on public.hsba_ho_so for delete to authenticated using (public.hsba_quan_tri());

drop table public.hsba_can_bo;

-- Tài khoản tạo từ app HSBA không tự sinh hồ sơ bên app Công việc
create or replace function public.handle_new_user()
 returns trigger language plpgsql security definer set search_path to 'public'
as $function$
declare
  req_role text := coalesce(new.raw_user_meta_data->>'role','nhan_vien');
  safe_role text;
  req_team  bigint := nullif(new.raw_user_meta_data->>'team_id','')::bigint;
  t_elem text;
begin
  if new.raw_user_meta_data->>'app' = 'hsba' then return new; end if;
  if req_role in ('truong_phong','pho_truong_phong','nhan_vien') then safe_role := req_role; else safe_role := 'nhan_vien'; end if;
  insert into public.profiles (id, email, full_name, role, position, phone, birthday)
  values (new.id, new.email,
          coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)),
          safe_role,
          coalesce(new.raw_user_meta_data->>'position',''),
          coalesce(new.raw_user_meta_data->>'phone',''),
          nullif(new.raw_user_meta_data->>'birthday','')::date)
  on conflict (id) do nothing;
  if (new.raw_user_meta_data ? 'team_ids')
     and jsonb_typeof(new.raw_user_meta_data->'team_ids') = 'array' then
    for t_elem in select jsonb_array_elements_text(new.raw_user_meta_data->'team_ids') loop
      if t_elem ~ '^[0-9]+$' and exists (select 1 from public.teams where id = t_elem::bigint) then
        insert into public.member_teams (profile_id, team_id, is_lead)
        values (new.id, t_elem::bigint, false) on conflict do nothing;
      end if;
    end loop;
  elsif req_team is not null and exists (select 1 from public.teams where id = req_team) then
    insert into public.member_teams (profile_id, team_id, is_lead)
    values (new.id, req_team, false) on conflict do nothing;
  end if;
  return new;
end;$function$;
commit;
