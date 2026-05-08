-- 013: Public profile directory RPC
--
-- RLS hiện tại của `profiles` chỉ cho user đọc profile của chính mình hoặc admin.
-- Khi user thường (planner/approver/viewer) load trang Phê duyệt, họ không thể
-- thấy `full_name` của người đề xuất / approver khác, dẫn đến UI rơi về hiển thị UUID.
--
-- Giải pháp: tạo SECURITY DEFINER function trả về directory tối thiểu
-- (id, full_name, email, role) cho mọi authenticated user. Không expose
-- `approval_levels`, `is_active`, `department`, các flag nhạy cảm khác.

CREATE OR REPLACE FUNCTION public.list_profile_directory()
RETURNS TABLE (
  id uuid,
  full_name text,
  email text,
  role text
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    p.id,
    p.full_name,
    p.email,
    p.role::text
  FROM public.profiles p
  WHERE COALESCE(p.is_active, true) = true
$$;

REVOKE ALL ON FUNCTION public.list_profile_directory() FROM public;
GRANT EXECUTE ON FUNCTION public.list_profile_directory() TO authenticated;
