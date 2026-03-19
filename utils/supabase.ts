import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://jczdnlydozcftvnqnixt.supabase.co';
const supabaseKey = 'sb_publishable_Iahv6LF7asBI3E_u_HAZhQ_Qrb99Qjm'; // Provided by user

export const supabase = createClient(supabaseUrl, supabaseKey);

// Hàm kiểm tra mã phê duyệt (Admin PIN)
export const verifyAdminPin = (inputPin: string) => {
  // Ưu tiên biến môi trường VITE_ADMIN_PIN (nếu thiết lập trên Vercel), mặc định là '2026' nếu không có
  const adminPin = (import.meta as any).env.VITE_ADMIN_PIN || '2026';
  return inputPin === adminPin;
};

// Helper function to save JSON data to cloud_storage table
export async function saveToCloudStorage(id: string, data: any) {
  try {
    const { error } = await supabase
      .from('cloud_storage')
      .upsert({ id, data, updated_at: new Date().toISOString() });
    
    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Lỗi khi lưu lên Cloud:', error);
    return false;
  }
}

// Helper function to load JSON data from cloud_storage table
export async function loadFromCloudStorage(id: string) {
  try {
    const { data, error } = await supabase
      .from('cloud_storage')
      .select('data')
      .eq('id', id)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        // Not found - this is okay for first time
        return null;
      }
      throw error;
    }
    
    return data?.data || null;
  } catch (error) {
    console.error('Lỗi khi tải từ Cloud:', error);
    return null;
  }
}

// Function to get list of order drafts (metadata only)
export async function listOrderDrafts() {
  try {
    const { data, error } = await supabase
      .from('cloud_storage')
      .select('id, updated_at')
      .like('id', 'order_draft_%')
      .order('updated_at', { ascending: false });
      
    if (error) return [];
    return data || [];
  } catch (err) {
    return [];
  }
}
