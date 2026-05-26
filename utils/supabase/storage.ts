import { supabase } from './client';

// Helper function to save JSON data to cloud_storage table (global records, no owner)
export async function saveToCloudStorage(id: string, data: any) {
  try {
    const { error } = await supabase
      .from('cloud_storage')
      .upsert({ id, data, updated_at: new Date().toISOString() });

    if (error) throw error;
    return true;
  } catch (error) {
    return false;
  }
}

// Save a user-owned draft (owner_id = current user)
export async function saveOrderDraft(id: string, data: any) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase
      .from('cloud_storage')
      .upsert({ id, data, updated_at: new Date().toISOString(), owner_id: user?.id ?? null });
    if (error) throw error;
    return true;
  } catch (error) {
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
    return null;
  }
}

// List order drafts belonging to current user only
export async function listOrderDrafts() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('cloud_storage')
      .select('id, updated_at, owner_id')
      .like('id', 'order_draft_%')
      .eq('owner_id', user?.id ?? '')
      .order('updated_at', { ascending: false });

    if (error) return [];
    return data || [];
  } catch (err) {
    return [];
  }
}
