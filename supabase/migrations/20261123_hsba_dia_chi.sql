-- Thêm cột Địa chỉ cho hồ sơ (đọc từ danh sách HIS)
alter table public.hsba_ho_so add column if not exists dia_chi text;
