import { useState } from 'react';
import ReconcileDiff, { type ReconcileDiffData } from './ReconcileDiff';

const NCC_LIST = ['Mobis Korea', 'Mobis India', 'Denso'];

const STEPS = [
  'Tải file',
  'Chọn NCC',
  'Xem trước & soát',
  'Đối chiếu & ghi nhận',
];

interface StagingRow {
  po: string;
  part: string;
  qty: number;
  status: string;
  ok: boolean;
}

const MOCK_STAGING: StagingRow[] = [
  { po: 'PO-2401', part: '86561-AA000', qty: 120, status: 'Khớp', ok: true },
  { po: 'PO-2401', part: '86562-AA010', qty: 80, status: 'Khớp', ok: true },
  { po: 'PO-2402', part: '95720-BB020', qty: 200, status: 'Lô mới', ok: true },
  { po: 'PO-2402', part: '95721-BB030', qty: 50, status: 'Đơn mới', ok: true },
  { po: 'PO-????', part: '00000-XX999', qty: 10, status: 'Không khớp', ok: false },
];

const MOCK_DIFF: ReconcileDiffData = {
  matched: [
    { key: 'PO-2401 / 86561-AA000', detail: 'Cập nhật mốc giao 02/06' },
    { key: 'PO-2401 / 86562-AA010', detail: 'Cập nhật mốc giao 02/06' },
    { key: 'PO-2403 / 11223-CC040', detail: 'Cập nhật SL nhận 150' },
  ],
  newLots: [{ key: 'PO-2402 / 95720-BB020', detail: 'Lô L-0602 (SL 200)' }],
  newOrders: [],
  unmatched: [
    { key: 'PO-???? / 00000-XX999', detail: 'Không tìm thấy PO trong hệ thống' },
    { key: '— / 77889-DD050', detail: 'Thiếu mã PO' },
  ],
};

export default function ImportWizard() {
  const [step, setStep] = useState(1);
  const [fileName, setFileName] = useState<string | null>(null);
  const [ncc, setNcc] = useState(NCC_LIST[0]);
  const [recorded, setRecorded] = useState(false);

  const next = () => setStep((s) => Math.min(4, s + 1));
  const back = () => setStep((s) => Math.max(1, s - 1));

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <h2 className="text-lg font-semibold text-gray-800">
        Nhập dữ liệu từ app NCC
      </h2>

      <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
        Khung demo — chưa nối parser/biểu mẫu NCC thật (giai đoạn sau)
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

      {/* Step body */}
      <div className="min-h-[200px] rounded-lg border border-gray-200 bg-white p-4">
        {step === 1 && (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              Tải file xuất từ app NCC (chưa phân tích nội dung).
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
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              Chọn NCC để áp dụng biểu mẫu tương ứng.
            </p>
            <select
              value={ncc}
              onChange={(e) => setNcc(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700"
            >
              {NCC_LIST.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-400">
              Biểu mẫu: <span className="font-medium">{ncc}</span>
            </p>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              Xem trước dữ liệu tạm (minh hoạ — dòng đỏ là không khớp khoá).
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-xs text-gray-500">
                    <th className="px-2 py-1.5">PO</th>
                    <th className="px-2 py-1.5">Mã PT</th>
                    <th className="px-2 py-1.5">SL</th>
                    <th className="px-2 py-1.5">Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {MOCK_STAGING.map((row, idx) => (
                    <tr
                      key={idx}
                      className={`border-b border-gray-100 ${
                        row.ok ? '' : 'bg-rose-50 text-rose-700'
                      }`}
                    >
                      <td className="px-2 py-1.5 font-mono">{row.po}</td>
                      <td className="px-2 py-1.5 font-mono">{row.part}</td>
                      <td className="px-2 py-1.5">{row.qty}</td>
                      <td className="px-2 py-1.5">{row.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              Đối chiếu với hệ thống và ghi nhận thay đổi.
            </p>
            <ReconcileDiff diff={MOCK_DIFF} />
            <div className="flex items-center gap-3">
              <button
                type="button"
                disabled={recorded}
                onClick={() => setRecorded(true)}
                className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                Ghi nhận
              </button>
              {recorded && (
                <span className="text-sm font-medium text-emerald-700">
                  Đã ghi nhận (demo)
                </span>
              )}
            </div>
            {recorded && (
              <p className="rounded border border-gray-200 bg-gray-50 px-3 py-2 font-mono text-xs text-gray-600">
                [log] 02/06 14:30 · {ncc} · {fileName ?? 'file.xlsx'} · 3 cập
                nhật, 1 lô mới, 0 đơn mới, 2 bỏ qua
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
          disabled={step === 1}
          className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Quay lại
        </button>
        <button
          type="button"
          onClick={next}
          disabled={step === 4}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          Tiếp
        </button>
      </div>
    </div>
  );
}
