-- Tài khoản Khoa: chỉ xem hồ sơ và lỗi của khoa mình
begin;
alter table public.hsba_tai_khoan add column if not exists khoa text;
alter table public.hsba_tai_khoan drop constraint if exists hsba_tai_khoan_vai_tro_check;
alter table public.hsba_tai_khoan add constraint hsba_tai_khoan_vai_tro_check check (vai_tro in ('quan_tri','can_bo','khoa'));

create or replace function public.hsba_la_khth() returns boolean
language sql stable security definer set search_path to 'public' as $$
  select exists(select 1 from public.hsba_tai_khoan where user_id = auth.uid() and hoat_dong and vai_tro in ('quan_tri','can_bo'));
$$;
create or replace function public.hsba_khoa_toi() returns text
language sql stable security definer set search_path to 'public' as $$
  select khoa from public.hsba_tai_khoan where user_id = auth.uid() and hoat_dong and vai_tro = 'khoa';
$$;
revoke execute on function public.hsba_la_khth() from public, anon;
revoke execute on function public.hsba_khoa_toi() from public, anon;
grant execute on function public.hsba_la_khth() to authenticated;
grant execute on function public.hsba_khoa_toi() to authenticated;

-- Hồ sơ: P.KHTH xem/sửa tất cả; Khoa chỉ xem hồ sơ của khoa mình
drop policy if exists hsba_ho_so_doc on public.hsba_ho_so;
drop policy if exists hsba_ho_so_them on public.hsba_ho_so;
drop policy if exists hsba_ho_so_sua on public.hsba_ho_so;
create policy hsba_ho_so_doc on public.hsba_ho_so for select to authenticated
  using ((select public.hsba_la_khth()) or khoa = (select public.hsba_khoa_toi()));
create policy hsba_ho_so_them on public.hsba_ho_so for insert to authenticated
  with check ((select public.hsba_la_khth()));
create policy hsba_ho_so_sua on public.hsba_ho_so for update to authenticated
  using ((select public.hsba_la_khth())) with check ((select public.hsba_la_khth()));

-- Danh mục lỗi: ai có tài khoản đều xem; chỉ P.KHTH sửa
drop policy if exists hsba_loi_them on public.hsba_loi;
drop policy if exists hsba_loi_sua on public.hsba_loi;
drop policy if exists hsba_loi_xoa on public.hsba_loi;
create policy hsba_loi_them on public.hsba_loi for insert to authenticated with check ((select public.hsba_la_khth()));
create policy hsba_loi_sua on public.hsba_loi for update to authenticated using ((select public.hsba_la_khth()));
create policy hsba_loi_xoa on public.hsba_loi for delete to authenticated using ((select public.hsba_la_khth()));

-- Danh sách tài khoản: chỉ P.KHTH xem (khoa chỉ thấy chính mình)
drop policy if exists hsba_tk_doc on public.hsba_tai_khoan;
create policy hsba_tk_doc on public.hsba_tai_khoan for select to authenticated
  using ((select public.hsba_la_khth()) or user_id = auth.uid());
commit;
