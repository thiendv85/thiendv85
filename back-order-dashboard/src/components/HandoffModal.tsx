'use client';
import React, { useState } from 'react';
import { useData } from './DataProvider';
import type { MergeReport } from '@/lib/persist';

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function HandoffModal() {
  const { exportSnapshot, importHandoff } = useData();
  const [tab, setTab] = useState<'export' | 'import'>('export');
  const [report, setReport] = useState<MergeReport | null>(null);
  const [csvText, setCsvText] = useState<string | null>(null);
  const [jsonText, setJsonText] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  const handleExport = () => {
    const today = new Date().toISOString().slice(0, 10);
    const out = exportSnapshot();
    downloadBlob(out.csv, `backorder_active_${today}.csv`);
    downloadBlob(out.json, `backorder_archive_${today}.json`);
  };

  const handleImport = async () => {
    if (!csvText || !jsonText) return;
    setImporting(true);
    setImportError(null);
    try {
      const r = await importHandoff(csvText, jsonText);
      setReport(r.report);
    } catch (e) {
      setImportError((e as Error).message);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <div className="flex gap-2 mb-3 border-b">
        <button
          onClick={() => setTab('export')}
          className={`px-3 py-1 ${tab === 'export' ? 'border-b-2 border-blue-600 font-semibold' : ''}`}
        >
          Export
        </button>
        <button
          onClick={() => setTab('import')}
          className={`px-3 py-1 ${tab === 'import' ? 'border-b-2 border-blue-600 font-semibold' : ''}`}
        >
          Import
        </button>
      </div>

      {tab === 'export' ? (
        <div>
          <p className="text-sm mb-3">Tải xuống 2 file (CSV + JSON) để gửi cho đồng nghiệp qua Zalo/email.</p>
          <button
            onClick={handleExport}
            className="px-4 py-2 bg-blue-600 text-white rounded font-semibold"
          >
            Export
          </button>
        </div>
      ) : (
        <div>
          <p className="text-sm mb-3">Upload 2 file đồng nghiệp gửi qua. App sẽ merge với state hiện tại.</p>
          <label className="block mb-2">
            <span className="text-sm">CSV file</span>
            <input
              type="file" accept=".csv"
              onChange={async e => {
                const f = e.target.files?.[0];
                if (f) setCsvText(await f.text());
              }}
            />
          </label>
          <label className="block mb-2">
            <span className="text-sm">JSON file</span>
            <input
              type="file" accept=".json"
              onChange={async e => {
                const f = e.target.files?.[0];
                if (f) setJsonText(await f.text());
              }}
            />
          </label>
          <button
            onClick={handleImport}
            disabled={!csvText || !jsonText || importing}
            className="px-4 py-2 bg-blue-600 text-white rounded font-semibold disabled:opacity-50"
          >
            {importing ? 'Đang merge…' : 'Xác nhận merge'}
          </button>
          {importError && (
            <div className="mt-3 p-3 bg-red-50 border border-red-200 text-red-800 rounded text-sm">
              {importError}
            </div>
          )}
          {report && (
            <div className="mt-3 p-3 bg-slate-50 border rounded text-sm">
              <div>Đã thêm: {report.added}</div>
              <div>Ghi đè: {report.overwritten}</div>
              <div>Tie-break: {report.tieBroken}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
