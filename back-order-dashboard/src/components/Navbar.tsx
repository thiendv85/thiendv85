'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import UploadButton from './UploadButton';
import { useData } from './DataProvider';

const navItems = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/action-board', label: 'Action Board' },
  { href: '/detail', label: 'Chi tiết' },
];

export default function Navbar() {
  const pathname = usePathname();
  const { lastUpdated } = useData();

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-white">
      <div className="max-w-[1400px] mx-auto px-4 flex h-14 items-center justify-between">
        <div className="flex items-center gap-8">
          <Link href="/" className="font-bold text-base tracking-tight">
            Back Order Dashboard
          </Link>
          <nav className="flex items-center gap-1">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
                  pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href))
                    ? "bg-slate-100 text-slate-900"
                    : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-4">
          {lastUpdated && (
            <span className="text-[10px] text-slate-400 tabular-nums uppercase font-bold tracking-wider">
              CẬP NHẬT: {lastUpdated}
            </span>
          )}
          <UploadButton />
        </div>
      </div>
    </header>
  );
}
