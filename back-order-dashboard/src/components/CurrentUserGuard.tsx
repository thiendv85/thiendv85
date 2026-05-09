'use client';
import React, { useState } from 'react';
import { useData } from './DataProvider';

export default function CurrentUserGuard({ children }: { children: React.ReactNode }) {
  const { currentUser, setCurrentUser } = useData();
  const [name, setName] = useState('');

  if (currentUser) return <>{children}</>;

  return (
    <>
      <div role="dialog" aria-labelledby="user-guard-title" className="fixed inset-0 z-[70] bg-black/60 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-4">
          <h2 id="user-guard-title" className="font-bold mb-2">Tên bạn là gì?</h2>
          <p className="text-sm text-slate-600 mb-3">Tên này được ghi vào log mỗi lần bạn nhắc NCC.</p>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Tên bạn"
            className="w-full border rounded p-2 text-sm mb-3"
          />
          <button
            disabled={!name.trim()}
            onClick={() => setCurrentUser(name.trim())}
            className="w-full bg-blue-600 text-white py-2 rounded font-semibold disabled:opacity-50"
          >
            Lưu
          </button>
        </div>
      </div>
      {children}
    </>
  );
}
