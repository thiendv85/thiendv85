'use client';
import React, { useMemo } from 'react';
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { useData } from './DataProvider';

const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;

export default function ExportBanner() {
  const { archive, lastExportAt } = useData();

  const { unsavedCount, isStale } = useMemo(() => {
    const lastTs = lastExportAt ? new Date(lastExportAt).getTime() : 0;
    const unsaved = archive.filter(r => new Date(r.created_at).getTime() > lastTs);
    const stale = lastTs > 0 && Date.now() - lastTs > FOUR_HOURS_MS;
    return { unsavedCount: unsaved.length, isStale: stale };
  }, [archive, lastExportAt]);

  if (unsavedCount === 0 && !isStale) return null;

  return (
    <div
      data-testid="export-banner"
      className="sticky top-0 z-20 bg-amber-100 border-b border-amber-300 text-amber-900 px-4 py-2 flex items-center gap-2"
    >
      <AlertTriangle size={16} />
      <span className="text-sm">
        {unsavedCount > 0
          ? `Bạn có ${unsavedCount} reminder chưa export.`
          : `Đã hơn 4 giờ chưa export — cân nhắc backup.`}
      </span>
      <Link
        href="/handoff"
        className="ml-auto bg-amber-600 text-white px-3 py-1 rounded text-sm font-semibold"
      >
        Export ngay
      </Link>
    </div>
  );
}
