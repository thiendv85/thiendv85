'use client';
import React, { createContext, useContext, useState } from 'react';
import { TransformedBOData } from '@/lib/transform';

interface DataContextType {
  data: TransformedBOData[];
  setData: (data: TransformedBOData[]) => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  lastUpdated: string | null;
  setLastUpdated: (date: string) => void;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<TransformedBOData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  return (
    <DataContext.Provider value={{ data, setData, isLoading, setIsLoading, lastUpdated, setLastUpdated }}>
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const context = useContext(DataContext);
  if (context === undefined) {
    throw new Error('useData must be used within a DataProvider');
  }
  return context;
}
