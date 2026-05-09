'use client';
import React, { useRef } from 'react';
import { Upload } from 'lucide-react';
import { parseAnnotatedCsv } from '@/lib/persist';
import { useData } from './DataProvider';

export default function UploadButton() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { setRows, setIsLoading, setLastUpdated } = useData();

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsLoading(true);
    try {
      const text = await file.text();
      const { rows, warnings } = parseAnnotatedCsv(text);
      setRows(rows);
      setLastUpdated(new Date().toLocaleString('vi-VN'));
      if (warnings.length > 0) {
        console.warn(`CSV warnings: ${warnings.length}`, warnings);
        alert(`File đã đọc xong nhưng có ${warnings.length} cảnh báo (xem console).`);
      }
    } catch (e) {
      console.error('CSV upload error', e);
      alert('Lỗi khi đọc file CSV. Vui lòng kiểm tra định dạng.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div>
      <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".csv" className="hidden" />
      <button
        onClick={() => fileInputRef.current?.click()}
        className="flex items-center gap-2 px-3 py-1.5 bg-slate-900 text-white rounded-md text-xs font-bold uppercase tracking-wider hover:bg-slate-800 transition-colors"
      >
        <Upload size={14} />
        Tải CSV
      </button>
    </div>
  );
}
