import { useCallback, useEffect, useState } from 'react';
import { listSupplierOrders, updateSupplierOrder } from '../utils/supabase/execution';
import type { SupplierOrder } from '../types/execution';

export function useExecutionTracking() {
  const [orders, setOrders] = useState<SupplierOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setOrders(await listSupplierOrders());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lỗi tải dữ liệu');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const saveStage = useCallback(
    async (id: string, patch: Partial<SupplierOrder>) => {
      try {
        await updateSupplierOrder(id, patch);
        await reload();
      } catch (e) {
        // Không nuốt thầm: hiện lỗi để user biết ghi THẤT BẠI (vd RLS từ chối non-planner).
        setError(e instanceof Error ? e.message : 'Lỗi lưu trạng thái');
        throw e;
      }
    },
    [reload],
  );

  return { orders, loading, error, reload, saveStage };
}
