import type { Annotation, ReminderChannel, TemplateLevel } from './types';

export interface TemplateCtx {
  doc_no: string;
  item_code: string;
  item_name: string;
  supplier: string;
  doc_date: string;
  aging_days: number;
  estimated_date1?: string;
  days_overdue?: number;
  reminder_count: number;
}

export interface RenderedTemplate {
  subject: string;
  body: string;
}

const TODAY_DDMMYYYY = () => new Date().toLocaleDateString('vi-VN');

function fallback(v: string | number | undefined, alt = '(chưa có)'): string {
  if (v === undefined || v === null || v === '') return alt;
  return String(v);
}

export function renderTemplate(
  level: TemplateLevel,
  channel: ReminderChannel,
  c: TemplateCtx
): RenderedTemplate {
  const eta = fallback(c.estimated_date1);
  const today = TODAY_DDMMYYYY();
  const overdue = fallback(c.days_overdue, '0');

  if (channel === 'email') {
    if (level === 'first-nudge') {
      return {
        subject: `[Nhắc nhở] Đơn nợ ${c.doc_no} — ${c.item_name}`,
        body:
`Kính gửi quý đối tác ${c.supplier},

Công ty chúng tôi có đặt hàng phụ tùng ${c.item_name} (mã ${c.item_code}) thuộc đơn ${c.doc_no} ngày ${c.doc_date}, đến nay đã ${c.aging_days} ngày nhưng vẫn chưa nhận được hàng.

Quý đối tác vui lòng cho biết tiến độ giao hàng và ETA dự kiến trong thời gian sớm nhất.

Xin cảm ơn.`,
      };
    }
    if (level === 'overdue') {
      return {
        subject: `[Quá hạn ETA] Đơn nợ ${c.doc_no} — ${c.item_name}`,
        body:
`Kính gửi quý đối tác ${c.supplier},

Đơn ${c.doc_no} - ${c.item_name} (${c.item_code}) đã có ETA ${eta} nhưng đến nay ${today} vẫn chưa giao, trễ ${overdue} ngày.

Quý đối tác vui lòng xác nhận lịch giao mới và lý do chậm trễ.

Mong nhận hồi đáp sớm.`,
      };
    }
    return {
      subject: `[Khẩn cấp - Lần thứ ${c.reminder_count + 1}] Đơn nợ ${c.doc_no} — ${c.item_name}`,
      body:
`Kính gửi quý đối tác ${c.supplier},

Đây là lần nhắc thứ ${c.reminder_count + 1} cho đơn ${c.doc_no} - ${c.item_name} (${c.item_code}), đặt từ ${c.doc_date} (đã ${c.aging_days} ngày).

Do không nhận được phản hồi rõ ràng từ quý đối tác trong các lần liên hệ trước, chúng tôi cần xác nhận trong vòng 48 giờ tiếp theo:
- Có thực hiện đơn này không?
- Nếu có, ETA chốt là khi nào?

Nếu không nhận được trả lời, chúng tôi sẽ phải xem xét chuyển đơn sang nhà cung cấp khác.

Mong sớm có hồi âm.`,
    };
  }

  if (level === 'first-nudge') {
    return {
      subject: `Nhắc đơn ${c.doc_no}`,
      body: `Anh/chị ${c.supplier} ơi, cho em hỏi đơn ${c.doc_no} - ${c.item_name} (${c.item_code}) đặt ngày ${c.doc_date}, đã ${c.aging_days} ngày, hiện tiến độ thế nào ạ? Khi nào có hàng anh/chị báo em với.`,
    };
  }
  if (level === 'overdue') {
    return {
      subject: `Quá hạn ETA ${c.doc_no}`,
      body: `Anh/chị ${c.supplier} ơi, đơn ${c.doc_no} (${c.item_name}) ETA ${eta} đã trễ ${overdue} ngày. Anh/chị xác nhận giúp em lịch giao mới với ạ. Cảm ơn.`,
    };
  }
  return {
    subject: `Khẩn ${c.doc_no} - lần ${c.reminder_count + 1}`,
    body: `Anh/chị ${c.supplier} ơi, đơn ${c.doc_no} - ${c.item_name} đã nhắc ${c.reminder_count} lần mà em chưa nhận được phản hồi rõ. Anh/chị cố gắng trong 48h xác nhận giúp em: có làm không, ETA bao giờ. Nếu không em phải báo sếp xem xét NCC khác. Cảm ơn anh/chị.`,
  };
}

export function suggestTemplateLevel(ann: Annotation | undefined, isOverdue: boolean): TemplateLevel {
  const count = ann?.reminder_count ?? 0;
  const status = ann?.ncc_response_status ?? 'pending';
  if (count >= 3 || status === 'silent') return 'escalation';
  if (count >= 1 && isOverdue) return 'overdue';
  return 'first-nudge';
}
