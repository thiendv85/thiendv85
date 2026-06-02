import { type ExecStage } from '../../types/execution';
import { STAGE_LABEL, STAGE_COLOR } from './stageMeta';

export default function StageBadge({ stage }: { stage: ExecStage }) {
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STAGE_COLOR[stage]}`}>
      {STAGE_LABEL[stage]}
    </span>
  );
}
