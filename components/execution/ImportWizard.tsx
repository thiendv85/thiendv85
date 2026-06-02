import { useState } from 'react';
import ReconcileDiff, { type ReconcileDiffData } from './ReconcileDiff';
import {
  reconcileImport,
  applyReconcile,
  type ApplyResult,
} from '../../utils/supabase/execution';
import { IMPORT_TEMPLATES } from '../../utils/execution/importAdapter';
import { SAMPLE_IMPORT_ROWS } from '../../utils/execution/mockData';
import type {
  ReconcileResult,
  CanonicalImportRow,
} from '../../utils/execution/reconcile';

const STEPS = [
  'Tải file',
  'Chọn NCC',
  'Xem trước & soát',
  'Đối chiếu & ghi nhận',
];

/** Map 1 bucket CanonicalImportRow[] → ReconcileRow[] cho ReconcileDiff. */
function toRows(rows: CanonicalImportRow[]) {
  return rows.map((row) => ({
    key: row.orderKey ?? row.part_code,
    detail: row.detail,
  }));
}

function toDiffData(result: ReconcileResult): ReconcileDiffData {
  return {
    matched: toRows(result.matched),
    newLots: toRows(result.newLots),
    newOrders: toRows(result.newOrders),
    unmatched: toRows(result.unmatched),
  };
}

export default function ImportWizard() {
  const [step, setStep] = useState(1);
  const [fileName, setFileName] = useState<string | null>(null);
  const [rawRows, setRawRows] = useState<unknown[][] | null>(null);
  const [templateId, setTemplateId] = useState(IMPORT_TEMPLATES[0]?.id ?? '');
  const [result, setResult] = useState<ReconcileResult | null>(null);
  const [applyRes, setApplyRes] = useState<ApplyResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const templateName =
    IMPORT_TEMPLATES.find((t) => t.id === templateId)?.name ?? '—';

  const back = () => {
    setError(null);
    setStep((s) => Math.max(1, s - 1));
  };

  // Bước 3→4: chạy reconcile khi vào bước đối chiếu.
  const next = async () => {
    setError(null);
    if (step === 3) {
      if (!rawRows) return;
      setLoading(true);
      try {
        const r = await reconcileImport(templateId, rawRows);
        setResult(r);
        setApplyRes(null);
        setStep(4);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Lỗi đối chiếu dữ liệu.');
      } finally {
        setLoading(false);
      }
      return;
    }
    setStep((s) => Math.min(4, s + 1));
  };

  const record = async () => {
    if (!result) return;
    setError(null);
    setLoading(true);
    try {
      const res = await applyReconcile(result);
      setApplyRes(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lỗi ghi nhận.');
    } finally {
      setLoading(false);
    }
  };

  const canNext =
    !loading &&
    ((step === 1 && !!rawRows) ||
      (step === 2 && !!templateId) ||
      step === 3);

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <h2 className="text-lg font-semibold text-gray-800">
        Nhập dữ liệu từ app NCC
      </h2>

      <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
        Khung demo — chưa nối parser/biểu mẫu NCC thật (giai đoạn sau). Dùng nút
        “Dùng dữ liệu mẫu” để chạy thử luồng đối chiếu.
      </div>

      {/* Stepper header */}
      <ol className="flex items-center gap-2">
        {STEPS.map((label, idx) => {
          const n = idx + 1;
          const active = n === step;
          const done = n < step;
          return (
            <li key={label} className="flex flex-1 items-center gap-2">
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                  active
                    ? 'bg-indigo-600 text-white'
                    : done
                      ? 'bg-indigo-100 text-indigo-600'
                      : 'bg-gray-100 text-gray-400'
                }`}
              >
                {n}
              </span>
              <span
                className={`truncate text-xs ${
                  active ? 'font-medium text-gray-800' : 'text-gray-400'
                }`}
              >
                {label}
              </span>
            </li>
          );
        })}
      </ol>

      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      )}

      {/* Step body */}
      <div className="min-h-[200px] rounded-lg border border-gray-200 bg-white p-4">
        {step === 1 && (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              Tải file xuất từ app NCC (chưa phân tích nội dung) hoặc dùng dữ
              liệu mẫu để chạy thử.
            </p>
            <input
              type="file"
              onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
              className="block w-full text-sm text-gray-600 file:mr-3 file:rounded file:border-0 file:bg-indigo-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-indigo-600"
            />
            {fileName && (
              <p className="text-sm text-gray-700">
                Đã chọn: <span className="font-medium">{fileName}</span>
              </p>
            )}
            <button
              type="button"
              onClick={() => setRawRows(SAMPLE_IMPORT_ROWS)}
              className="rounded-md border border-indigo-300 bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-700"
            >
              Dùng dữ liệu mẫu
            </button>
            {rawRows && (
              <p className="text-sm text-emerald-700">
                Đã nạp <span className="font-medium">{rawRows.length}</span> dòng
                mẫu.
              </p>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              Chọn NCC để áp dụng biểu mẫu tương ứng.
            </p>
            <select
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700"
            >
              {IMPORT_TEMPLATES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-400">
              Biểu mẫu: <span className="font-medium">{templateName}</span>
            </p>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              Xem trước trước khi đối chiếu với hệ thống.
            </p>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded border border-gray-200 bg-gray-50 px-3 py-2">
                <dt className="text-xs text-gray-500">Số dòng</dt>
                <dd className="font-medium text-gray-800">
                  {rawRows?.length ?? 0}
                </dd>
              </div>
              <div className="rounded border border-gray-200 bg-gray-50 px-3 py-2">
                <dt className="text-xs text-gray-500">NCC / biểu mẫu</dt>
                <dd className="font-medium text-gray-800">{templateName}</dd>
              </div>
            </dl>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              Đối chiếu với hệ thống và ghi nhận thay đổi.
            </p>
            {loading && !result ? (
              <p className="text-sm text-gray-500">Đang đối chiếu…</p>
            ) : result ? (
              <ReconcileDiff diff={toDiffData(result)} />
            ) : null}
            <div className="flex items-center gap-3">
              <button
                type="button"
                disabled={loading || !result || !!applyRes}
                onClick={record}
                className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                Ghi nhận
              </button>
            </div>
            {applyRes && (
              <p className="rounded border border-gray-200 bg-gray-50 px-3 py-2 font-mono text-xs text-gray-600">
                Đã ghi: matched {applyRes.matched} · lô mới {applyRes.newLots} ·
                đơn mới {applyRes.newOrders} · không khớp {applyRes.unmatched}{' '}
                (demo, chưa ghi DB)
              </p>
            )}
          </div>
        )}
      </div>

      {/* Nav */}
      <div className="flex justify-between">
        <button
          type="button"
          onClick={back}
          disabled={step === 1 || loading}
          className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Quay lại
        </button>
        <button
          type="button"
          onClick={next}
          disabled={step === 4 || !canNext}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          Tiếp
        </button>
      </div>
    </div>
  );
}
