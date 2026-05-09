'use client';
import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import type { RenderedTemplate } from '@/lib/templates';

export default function TemplateGenerator({ rendered }: { rendered: RenderedTemplate }) {
  const [copied, setCopied] = useState<'email' | 'zalo' | null>(null);

  const copy = async (which: 'email' | 'zalo', text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(which);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="space-y-3">
      <div className="bg-slate-50 border border-slate-200 rounded p-3">
        <div className="text-xs text-slate-500 uppercase font-bold mb-1">Tiêu đề</div>
        <div className="font-semibold text-sm">{rendered.subject}</div>
      </div>
      <div className="bg-slate-50 border border-slate-200 rounded p-3">
        <div className="text-xs text-slate-500 uppercase font-bold mb-1">Nội dung</div>
        <pre className="text-sm whitespace-pre-wrap font-sans">{rendered.body}</pre>
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => copy('email', `${rendered.subject}\n\n${rendered.body}`)}
          className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded text-sm font-semibold"
        >
          {copied === 'email' ? <Check size={14} /> : <Copy size={14} />}
          Copy email
        </button>
        <button
          onClick={() => copy('zalo', rendered.body)}
          className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 text-white rounded text-sm font-semibold"
        >
          {copied === 'zalo' ? <Check size={14} /> : <Copy size={14} />}
          Copy Zalo
        </button>
      </div>
    </div>
  );
}
