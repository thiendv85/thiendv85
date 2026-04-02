import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://jczdnlydozcftvnqnixt.supabase.co';
const supabaseKey = 'sb_publishable_Iahv6LF7asBI3E_u_HAZhQ_Qrb99Qjm';

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data, error } = await supabase.from('profiles').select('id, full_name').limit(5);
  if (error) {
    console.error("Error:", error);
  } else {
    console.log("Profiles sample:", data);
  }
}

run();
