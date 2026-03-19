
import React from 'react';
import { useLanguage } from '../utils/i18n';
import { Typography } from './Typography';

export const StatusBadge = ({ status }: { status: string }) => {
  const { t } = useLanguage();
  const map: any = {
    'Active': { label: t('status_active'), classes: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    'Sleeping': { label: t('status_sleeping'), classes: 'bg-amber-50 text-amber-700 border-amber-200' },
    'Dead Stock': { label: t('status_dead'), classes: 'bg-slate-100 text-slate-500 border-slate-200' },
  };
  const current = map[status] || { label: status, classes: 'bg-slate-50 text-slate-600 border-slate-200' };

  return (
    <Typography variant="label" className={`px-2.5 py-1 rounded-lg border shadow-sm ${current.classes}`}>
      {current.label}
    </Typography>
  );
};
