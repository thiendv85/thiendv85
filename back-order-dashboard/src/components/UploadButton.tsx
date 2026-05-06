'use client';
import React, { useRef } from 'react';
import Papa from 'papaparse';
import { Upload } from 'lucide-react';
import { RawBOData, transformData } from '@/lib/transform';
import { useData } from './DataProvider';

export default function UploadButton() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { setData, setIsLoading, setLastUpdated } = useData();

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    Papa.parse<RawBOData>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const transformed = transformData(results.data);
        setData(transformed);
        setLastUpdated(new Date().toLocaleString('vi-VN'));
        setIsLoading(false);
      },
      error: (error) => {
        console.error('CSV Parsing Error:', error);
        setIsLoading(false);
        alert('Lỗi khi đọc file CSV. Vui lòng kiểm tra định dạng.');
      }
    });
  };

  return (
    <div>
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        accept=".csv"
        className="hidden"
      />
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
