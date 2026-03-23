import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface EmailPayload {
    event: 'submitted' | 'level_advanced' | 'approved' | 'rejected' | 'unlocked';
    request_id: string;
    recipient_ids: string[];
    request_details: {
        draft_name: string;
        brand: string | null;
        submitted_by_name: string;
        current_level: number;
        comment?: string;
        unlock_reason?: string;
    };
}

const EVENT_SUBJECTS: Record<string, string> = {
    submitted:      '[ATP] Yêu cầu phê duyệt mới',
    level_advanced: '[ATP] Yêu cầu phê duyệt chuyển level',
    approved:       '[ATP] Đơn hàng đã được phê duyệt',
    rejected:       '[ATP] Đơn hàng bị từ chối',
    unlocked:       '[ATP] Đơn hàng đã được mở khóa',
};

serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

    try {
        const supabaseAdmin = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
        );

        const body: EmailPayload = await req.json();
        const { event, recipient_ids, request_details } = body;

        // Fetch recipient emails
        const emails: string[] = [];
        for (const uid of recipient_ids) {
            const { data } = await supabaseAdmin.auth.admin.getUserById(uid);
            if (data?.user?.email) emails.push(data.user.email);
        }

        if (emails.length === 0) return new Response(JSON.stringify({ ok: true, skipped: 'no recipients' }), { headers: corsHeaders });

        const appUrl = Deno.env.get('APP_URL') ?? 'https://app.example.com';
        const subject = EVENT_SUBJECTS[event] ?? '[ATP] Thông báo phê duyệt';

        const htmlBody = `
<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px">
  <h2 style="color:#1e40af;margin-bottom:8px">${subject}</h2>
  <p><strong>Draft:</strong> ${request_details.draft_name}${request_details.brand ? ` (${request_details.brand})` : ''}</p>
  <p><strong>Người gửi:</strong> ${request_details.submitted_by_name}</p>
  <p><strong>Level hiện tại:</strong> ${request_details.current_level}</p>
  ${request_details.comment ? `<p><strong>Nhận xét:</strong> ${request_details.comment}</p>` : ''}
  ${request_details.unlock_reason ? `<p><strong>Lý do mở khóa:</strong> ${request_details.unlock_reason}</p>` : ''}
  <a href="${appUrl}" style="display:inline-block;margin-top:16px;padding:10px 20px;background:#2563eb;color:#fff;border-radius:8px;text-decoration:none;font-weight:bold">Mở ATP System</a>
</div>`;

        const resendKey = Deno.env.get('RESEND_API_KEY');
        if (!resendKey) throw new Error('RESEND_API_KEY not set');

        await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                from: 'ATP System <noreply@atp.example.com>',
                to: emails,
                subject,
                html: htmlBody,
            }),
        });

        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    } catch (err) {
        console.error('send-approval-email error:', err);
        return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: corsHeaders });
    }
});
