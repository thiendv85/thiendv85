import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

    try {
        // Verify caller is admin via JWT
        const authHeader = req.headers.get('Authorization');
        if (!authHeader) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });

        const supabaseAdmin = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
        );

        // Verify caller JWT and check role
        const token = authHeader.replace('Bearer ', '');
        const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
        if (authError || !user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });

        const { data: profile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single();
        if (profile?.role !== 'admin') return new Response(JSON.stringify({ error: 'Forbidden — admin only' }), { status: 403, headers: corsHeaders });

        const { email, password, full_name, role } = await req.json();
        if (!email || !password) return new Response(JSON.stringify({ error: 'email and password required' }), { status: 400, headers: corsHeaders });

        const { data, error } = await supabaseAdmin.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: { full_name: full_name ?? '', role: role ?? 'viewer' },
        });

        if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: corsHeaders });

        return new Response(JSON.stringify({ ok: true, id: data.user.id }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    } catch (err) {
        console.error('admin-create-user error:', err);
        return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: corsHeaders });
    }
});
