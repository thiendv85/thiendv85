// ─────────────────────────────────────────────────────────────────────────────
// Phase 8: Escalation Cron Job (Supabase Edge Function)
// Schedule: Run daily via cron to check overdue approval requests
// ─────────────────────────────────────────────────────────────────────────────

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async (req) => {
    try {
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

        // Find overdue requests: deadline < now, status is pending/in_progress, not yet escalated
        const { data: overdueRequests, error } = await supabase
            .from('approval_requests')
            .select('id, draft_name, brand, current_level, workflow_id, submitted_by, deadline')
            .in('status', ['pending', 'in_progress'])
            .lt('deadline', new Date().toISOString())
            .is('escalated_at', null)
            .order('deadline', { ascending: true });

        if (error) {
            console.error('Error fetching overdue requests:', error);
            return new Response(JSON.stringify({ error: error.message }), { status: 500 });
        }

        if (!overdueRequests || overdueRequests.length === 0) {
            return new Response(JSON.stringify({ message: 'No overdue requests found', count: 0 }), {
                headers: { 'Content-Type': 'application/json' },
            });
        }

        const escalated: string[] = [];

        for (const req of overdueRequests) {
            // Get workflow to find next-level approvers
            const { data: workflow } = await supabase
                .from('approval_workflows')
                .select('levels')
                .eq('id', req.workflow_id)
                .single();

            if (!workflow) continue;

            // Find approvers at next level (or same level if no next)
            const nextLevel = workflow.levels.find(
                (l: { level: number }) => l.level === req.current_level + 1
            );
            const escalateToIds = nextLevel
                ? nextLevel.approver_ids
                : workflow.levels.find((l: { level: number }) => l.level === req.current_level)?.approver_ids || [];

            // Mark as escalated
            const { error: updateError } = await supabase
                .from('approval_requests')
                .update({
                    escalated_at: new Date().toISOString(),
                    escalated_to: escalateToIds.join(','),
                })
                .eq('id', req.id);

            if (!updateError) {
                escalated.push(req.id);

                // Send escalation email notification
                try {
                    await supabase.functions.invoke('send-approval-email', {
                        body: {
                            event: 'escalated',
                            request_id: req.id,
                            recipient_ids: escalateToIds,
                            request_details: {
                                draft_name: req.draft_name,
                                brand: req.brand,
                                submitted_by_name: 'System',
                                current_level: req.current_level,
                                comment: `Đơn hàng đã quá hạn phê duyệt (deadline: ${new Date(req.deadline).toLocaleDateString('vi-VN')})`,
                            },
                        },
                    });
                } catch (emailErr) {
                    console.error(`Failed to send escalation email for ${req.id}:`, emailErr);
                }
            }
        }

        return new Response(
            JSON.stringify({
                message: `Escalated ${escalated.length} overdue requests`,
                escalated_ids: escalated,
                total_overdue: overdueRequests.length,
            }),
            { headers: { 'Content-Type': 'application/json' } }
        );
    } catch (err) {
        console.error('Escalation check failed:', err);
        return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
    }
});
