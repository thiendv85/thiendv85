import { useEffect, useMemo, useState } from 'react';
import type { InventoryItem } from '../types/inventory';
import { SupersessionGraph, type SupersessionMapping } from '../utils/supersessionGraph';

const STORAGE_KEY = 'supersessionMappings';

function loadInitial(): SupersessionMapping[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch (e) {
    console.error('Failed to load supersession mappings', e);
    return [];
  }
}

/**
 * Owns supersession mappings (loaded from localStorage), the derived graph,
 * and the edit-modal state. Returns a self-contained API for App.tsx.
 */
export function useSupersession(data: InventoryItem[]) {
  const [mappings, setMappings] = useState<SupersessionMapping[]>(loadInitial);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editing, setEditing] = useState<SupersessionMapping | null>(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(mappings));
  }, [mappings]);

  const graph = useMemo(() => {
    if (data.length === 0) return new SupersessionGraph([]);
    return new SupersessionGraph(mappings, data.map((i) => i.ItemCode));
  }, [data, mappings]);

  const saveMapping = (oldPart: string, newPart: string, interchangeable: boolean) => {
    setMappings((prev) => {
      if (editing) {
        const idx = prev.findIndex(
          (m) => m.oldPart === editing.oldPart && m.newPart === editing.newPart
        );
        if (idx > -1) {
          const next = [...prev];
          next[idx] = { oldPart, newPart, interchangeable };
          return next;
        }
      }
      return [...prev, { oldPart, newPart, interchangeable }];
    });
  };

  const openAdd = () => {
    setEditing(null);
    setIsModalOpen(true);
  };
  const openEdit = (m: SupersessionMapping) => {
    setEditing(m);
    setIsModalOpen(true);
  };
  const close = () => setIsModalOpen(false);

  return { mappings, setMappings, graph, isModalOpen, editing, openAdd, openEdit, close, saveMapping };
}
