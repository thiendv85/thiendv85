-- Đợt 1 vá bảo mật (2026-10-12) — xem Obsidian "Danh gia App APG va CSDL 2026-10-12".
-- Không đổi dữ liệu nghiệp vụ; app không dùng link công khai (chỉ storage.download khi đã đăng nhập).

-- 1) Kho file snapshot: bỏ truy cập công khai; chỉ người được upload (admin/planner/approver) mới xoá file.
UPDATE storage.buckets SET public = false WHERE id = 'inventory_snapshots';
DROP POLICY IF EXISTS public_read_snapshots ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated delete storage" ON storage.objects;
DROP POLICY IF EXISTS auth_delete_snapshots ON storage.objects;
DROP POLICY IF EXISTS auth_upload_snapshots ON storage.objects;  -- trùng "Allow authenticated uploads"
CREATE POLICY snapshots_delete_uploader_roles ON storage.objects
    FOR DELETE TO authenticated
    USING (bucket_id = 'inventory_snapshots'
           AND (SELECT public.current_user_role()) IN ('admin', 'planner', 'approver'));

-- 2) Vai trò khi tạo tài khoản: chỉ lấy từ app_metadata (chỉ service role ghi được), mặc định viewer.
--    Trước đây lấy từ user_metadata → người tự đăng ký có thể khai role = admin.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text := NEW.raw_app_meta_data->>'role';
BEGIN
  IF v_role IS NULL OR v_role NOT IN ('admin', 'planner', 'approver', 'viewer') THEN
    v_role := 'viewer';
  END IF;
  INSERT INTO public.profiles (id, full_name, role)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name', v_role)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Bản cũ không gắn trigger nào nhưng vẫn gọi được qua API → vô hiệu cùng lý do.
DROP FUNCTION IF EXISTS public.handle_new_user_sync_email();

-- 3) Policy cho phép mọi vai trò (kể cả anon) chèn hồ sơ với điều kiện true. Trigger trên là SECURITY DEFINER
--    nên không cần policy này; admin vẫn chèn được qua profiles_insert_admin.
DROP POLICY IF EXISTS profiles_insert_trigger ON public.profiles;

-- 4) Bảng inventory_snapshots (trùng tên kho file) không được code dùng, tắt RLS, anon đọc/sửa được.
--    1 dòng đã sao lưu: apg-data/out/backup/inventory_snapshots_table_2026-10-12.json
DROP TABLE IF EXISTS public.inventory_snapshots;

-- 5) Hàm SECURITY DEFINER không cho anon gọi qua /rest/v1/rpc (policy chỉ áp cho authenticated).
REVOKE EXECUTE ON FUNCTION public.current_user_role() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.list_profile_directory() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_profile_directory() TO authenticated;
