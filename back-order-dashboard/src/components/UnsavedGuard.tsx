'use client';
import { useEffect } from 'react';
import { useData } from './DataProvider';

export default function UnsavedGuard() {
  const { archive, lastExportAt } = useData();
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      const lastExportTs = lastExportAt ? new Date(lastExportAt).getTime() : 0;
      const hasUnsaved = archive.some(r => new Date(r.created_at).getTime() > lastExportTs);
      if (hasUnsaved) {
        e.preventDefault();
        e.returnValue = 'Bạn có reminder chưa export. Vẫn đóng?';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [archive, lastExportAt]);
  return null;
}
