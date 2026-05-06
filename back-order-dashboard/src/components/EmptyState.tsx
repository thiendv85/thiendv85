'use client';
import { Upload } from 'lucide-react';
import UploadButton from './UploadButton';

export default function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-8 bg-white rounded-xl border border-dashed border-slate-200">
      <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mb-4 text-slate-400">
        <Upload size={24} />
      </div>
      <h3 className="text-sm font-bold text-slate-900 mb-1 uppercase tracking-tight">Chưa có dữ liệu</h3>
      <p className="text-xs text-slate-500 mb-6 max-w-[240px]">
        Vui lòng tải lên file CSV Backorder để bắt đầu phân tích và điều hành dữ liệu.
      </p>
      <UploadButton />
    </div>
  );
}
