'use client';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { transformData, type RawBOData, type TransformedBOData } from '@/lib/transform';
import { compositeKey, type Annotation, type CompositeKey, type ReminderEntry, type ReminderChannel, type TemplateLevel, type ReminderStatus } from '@/lib/types';
import { createReminder, applyToAnnotation } from '@/lib/reminder';
import { serializeAnnotatedCsv, serializeArchive, mergeArchives, parseAnnotatedCsv, parseArchive, type MergeReport } from '@/lib/persist';

interface NewReminderInput {
  doc_no: string; item_code: string; row_id?: string;
  item_name: string; supplier: string;
  channel: ReminderChannel; template_used: TemplateLevel;
  ncc_response?: string; eta_promised_new?: string;
  ncc_response_status: ReminderStatus;
}

interface DataContextType {
  rows: RawBOData[];
  data: TransformedBOData[];
  annotations: Map<CompositeKey, Annotation>;
  archive: ReminderEntry[];
  currentUser: string;
  isLoading: boolean;
  lastUpdated: string | null;
  lastExportAt: string | null;

  setRows: (rows: RawBOData[]) => void;
  setIsLoading: (loading: boolean) => void;
  setLastUpdated: (date: string) => void;
  setCurrentUser: (name: string) => void;

  logReminder: (input: NewReminderInput) => ReminderEntry;
  exportSnapshot: () => { csv: Blob; json: Blob };
  importHandoff: (csv: string, json: string) => Promise<{ report: MergeReport; warnings: string[] }>;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

const LS_USER = 'backorder.currentUser';
const LS_LAST_EXPORT = 'backorder.lastExportAt';

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [rows, setRows] = useState<RawBOData[]>([]);
  const [annotations, setAnnotations] = useState<Map<CompositeKey, Annotation>>(new Map());
  const [archive, setArchive] = useState<ReminderEntry[]>([]);
  const [currentUserState, setCurrentUserState] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [lastExportAt, setLastExportAt] = useState<string | null>(null);

  useEffect(() => {
    setCurrentUserState(localStorage.getItem(LS_USER) ?? '');
    setLastExportAt(localStorage.getItem(LS_LAST_EXPORT));
  }, []);

  const data = useMemo(() => transformData(rows), [rows]);

  const setCurrentUser = (name: string) => {
    setCurrentUserState(name);
    localStorage.setItem(LS_USER, name);
  };

  const logReminder = (input: NewReminderInput): ReminderEntry => {
    const r = createReminder({
      ...input,
      reminder_by: currentUserState || 'Unknown',
    });
    setArchive(prev => [...prev, r]);
    setAnnotations(prev => {
      const next = new Map(prev);
      const key = compositeKey(r.doc_no, r.item_code, r.row_id);
      next.set(key, applyToAnnotation(prev.get(key), r));
      return next;
    });
    return r;
  };

  const exportSnapshot = () => {
    const csvStr = serializeAnnotatedCsv(rows, annotations);
    const jsonStr = serializeArchive(archive);
    const now = new Date().toISOString();
    localStorage.setItem(LS_LAST_EXPORT, now);
    setLastExportAt(now);
    return {
      csv: new Blob([csvStr], { type: 'text/csv;charset=utf-8' }),
      json: new Blob([jsonStr], { type: 'application/json' }),
    };
  };

  const importHandoff = async (csvText: string, jsonText: string) => {
    const { rows: importedRows, annotations: importedAnn } = parseAnnotatedCsv(csvText);
    const { reminders: importedReminders, warnings: archiveWarn } = parseArchive(jsonText);
    const { merged, report } = mergeArchives(archive, importedReminders);

    setRows(importedRows);
    setAnnotations(prev => {
      const next = new Map(prev);
      importedAnn.forEach((v, k) => next.set(k, v));
      return next;
    });
    setArchive(merged);
    return { report, warnings: archiveWarn };
  };

  const value: DataContextType = {
    rows, data, annotations, archive, currentUser: currentUserState,
    isLoading, lastUpdated, lastExportAt,
    setRows, setIsLoading, setLastUpdated, setCurrentUser,
    logReminder, exportSnapshot, importHandoff,
  };

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used within DataProvider');
  return ctx;
}
