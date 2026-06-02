export interface ReconcileRow {
  key: string;
  detail: string;
}

export interface ReconcileDiffData {
  matched: ReconcileRow[]; // khớp — cập nhật mốc
  newLots: ReconcileRow[]; // lô mới
  newOrders: ReconcileRow[]; // đơn mới
  unmatched: ReconcileRow[]; // không khớp khoá
}

interface BucketConfig {
  title: string;
  rows: ReconcileRow[];
  badge: string;
  header: string;
  row: string;
}

export default function ReconcileDiff({ diff }: { diff: ReconcileDiffData }) {
  const buckets: BucketConfig[] = [
    {
      title: 'Khớp — cập nhật mốc',
      rows: diff.matched,
      badge: 'bg-blue-100 text-blue-700',
      header: 'text-blue-700',
      row: 'border-blue-100 bg-blue-50/50',
    },
    {
      title: 'Lô mới',
      rows: diff.newLots,
      badge: 'bg-emerald-100 text-emerald-700',
      header: 'text-emerald-700',
      row: 'border-emerald-100 bg-emerald-50/50',
    },
    {
      title: 'Đơn mới',
      rows: diff.newOrders,
      badge: 'bg-indigo-100 text-indigo-700',
      header: 'text-indigo-700',
      row: 'border-indigo-100 bg-indigo-50/50',
    },
    {
      title: 'Không khớp khoá',
      rows: diff.unmatched,
      badge: 'bg-rose-100 text-rose-700',
      header: 'text-rose-700',
      row: 'border-rose-100 bg-rose-50/50',
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {buckets.map((bucket) => (
        <div
          key={bucket.title}
          className="rounded-lg border border-gray-200 bg-white p-3"
        >
          <div className="mb-2 flex items-center justify-between">
            <h4 className={`text-sm font-semibold ${bucket.header}`}>
              {bucket.title}
            </h4>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${bucket.badge}`}
            >
              {bucket.rows.length}
            </span>
          </div>
          {bucket.rows.length === 0 ? (
            <p className="text-xs italic text-gray-400">Không có dòng nào</p>
          ) : (
            <ul className="space-y-1">
              {bucket.rows.map((row, idx) => (
                <li
                  key={`${row.key}-${idx}`}
                  className={`rounded border px-2 py-1 text-xs ${bucket.row}`}
                >
                  <span className="font-mono font-medium text-gray-800">
                    {row.key}
                  </span>
                  <span className="text-gray-500"> · {row.detail}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}
