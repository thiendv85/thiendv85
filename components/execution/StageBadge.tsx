import { type ExecStage } from '../../types/execution';

export const STAGE_LABEL: Record<ExecStage, string> = {
  S0_PENDING_SPLIT: 'Chờ tách',
  S1_SPLIT: 'Đã tách',
  S2_ORDERED: 'Đã đặt NCC',
  S3_SUPPLIER_CONFIRMED: 'NCC xác nhận',
  S4_INVOICED: 'Có invoice',
  S5_ETD: 'Đã ETD',
  S6_ETA: 'Đến VN (ETA)',
  S7_CUSTOMS: 'Thông quan',
  S8_RECEIVED: 'Về kho',
  S9_DONE: 'Hoàn tất',
};

const STAGE_COLOR: Record<ExecStage, string> = {
  S0_PENDING_SPLIT: 'bg-slate-100 text-slate-600',
  S1_SPLIT: 'bg-slate-100 text-slate-600',
  S2_ORDERED: 'bg-amber-100 text-amber-700',
  S3_SUPPLIER_CONFIRMED: 'bg-amber-100 text-amber-700',
  S4_INVOICED: 'bg-blue-100 text-blue-700',
  S5_ETD: 'bg-blue-100 text-blue-700',
  S6_ETA: 'bg-indigo-100 text-indigo-700',
  S7_CUSTOMS: 'bg-indigo-100 text-indigo-700',
  S8_RECEIVED: 'bg-emerald-100 text-emerald-700',
  S9_DONE: 'bg-green-600 text-white',
};

export default function StageBadge({ stage }: { stage: ExecStage }) {
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STAGE_COLOR[stage]}`}>
      {STAGE_LABEL[stage]}
    </span>
  );
}
