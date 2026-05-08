import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? '*')
    .split(',')
    .map((s) => s.trim());

function corsHeaders(origin: string | null) {
    const allowed =
        ALLOWED_ORIGINS.includes('*') || (origin && ALLOWED_ORIGINS.includes(origin))
            ? origin ?? '*'
            : ALLOWED_ORIGINS[0];
    return {
        'Access-Control-Allow-Origin': allowed,
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Vary': 'Origin',
    };
}

// Minimal HTML escape so user-controlled strings (comment, unlock_reason, draft_name) cannot
// inject markup or scripts into the email body.
function escapeHtml(input: string | null | undefined): string {
    if (!input) return '';
    return String(input)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

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
    const origin = req.headers.get('origin');
    const cors = corsHeaders(origin);

    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: { ...cors, 'Content-Type': 'application/json' },
        });
    }

    // Require an authenticated caller. Without this any unauthenticated POST could trigger
    // arbitrary email sends to user IDs.
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader.toLowerCase().startsWith('bearer ')) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { ...cors, 'Content-Type': 'application/json' },
        });
    }

    try {
        const supabaseAdmin = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
        );

        // Verify the caller's JWT corresponds to a real user.
        const callerClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_ANON_KEY') ?? '',
            { global: { headers: { Authorization: authHeader } } },
        );
        const { data: callerData } = await callerClient.auth.getUser();
        if (!callerData?.user) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), {
                status: 401,
                headers: { ...cors, 'Content-Type': 'application/json' },
            });
        }

        const body: EmailPayload = await req.json();
        const { event, recipient_ids, request_details } = body;

        if (!Array.isArray(recipient_ids) || recipient_ids.length === 0) {
            return new Response(JSON.stringify({ ok: true, skipped: 'no recipients' }), {
                headers: { ...cors, 'Content-Type': 'application/json' },
            });
        }

        // Batch email lookup — migration 008 syncs email into profiles. Single query instead
        // of N round-trips to auth.admin.
        const { data: profiles, error: profilesErr } = await supabaseAdmin
            .from('profiles')
            .select('email')
            .in('id', recipient_ids);

        if (profilesErr) throw profilesErr;
        const emails = (profiles ?? [])
            .map((p) => (p as { email: string | null }).email)
            .filter((e): e is string => Boolean(e));

        if (emails.length === 0) {
            return new Response(JSON.stringify({ ok: true, skipped: 'no email addresses' }), {
                headers: { ...cors, 'Content-Type': 'application/json' },
            });
        }

        const appUrl = Deno.env.get('APP_URL') ?? 'https://app.example.com';
        const subject = EVENT_SUBJECTS[event] ?? '[ATP] Thông báo phê duyệt';

        const draftName = escapeHtml(request_details.draft_name);
        const brand = escapeHtml(request_details.brand);
        const submittedBy = escapeHtml(request_details.submitted_by_name);
        const comment = escapeHtml(request_details.comment);
        const unlockReason = escapeHtml(request_details.unlock_reason);

        const htmlBody = `
<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px">
  <h2 style="color:#1e40af;margin-bottom:8px">${escapeHtml(subject)}</h2>
  <p><strong>Draft:</strong> ${draftName}${brand ? ` (${brand})` : ''}</p>
  <p><strong>Người gửi:</strong> ${submittedBy}</p>
  <p><strong>Level hiện tại:</strong> ${Number(request_details.current_level) | 0}</p>
  ${comment ? `<p><strong>Nhận xét:</strong> ${comment}</p>` : ''}
  ${unlockReason ? `<p><strong>Lý do mở khóa:</strong> ${unlockReason}</p>` : ''}
  <a href="${appUrl}" style="display:inline-block;margin-top:16px;padding:10px 20px;background:#2563eb;color:#fff;border-radius:8px;text-decoration:none;font-weight:bold">Mở ATP System</a>
</div>`;

        const resendKey = Deno.env.get('RESEND_API_KEY');
        if (!resendKey) throw new Error('RESEND_API_KEY not set');

        await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                from: 'ATP System <noreply@atp.example.com>',
                to: emails,
                subject,
                html: htmlBody,
            }),
        });

        return new Response(JSON.stringify({ ok: true }), {
            headers: { ...cors, 'Content-Type': 'application/json' },
        });
    } catch (err) {
        console.error('send-approval-email error:', err);
        return new Response(JSON.stringify({ error: String(err) }), {
            status: 500,
            headers: { ...cors, 'Content-Type': 'application/json' },
        });
    }
});
