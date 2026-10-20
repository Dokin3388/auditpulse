import React from 'react';
import { useAuditStore } from '../../services/auditStore';
import {
  ShieldAlert,
  Moon,
  Sun,
  Database,
  Bell,
} from 'lucide-react';

interface NavbarProps {
  darkMode: boolean;
  setDarkMode: (val: boolean) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ darkMode, setDarkMode }) => {
  const { currentUser, filteredActions } = useAuditStore();

  const urgentRecheckCount = filteredActions.filter(
    (a) => a.status === 'SALE_MARKED_DONE' || a.isOverdue
  ).length;

  return (
    <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-[37px] z-30 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* Brand identity */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-brand-700 via-brand-600 to-sky-500 flex items-center justify-center text-white shadow-md shadow-brand-500/20">
            <ShieldAlert className="w-6 h-6 stroke-[2.2]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-lg tracking-tight text-slate-900 dark:text-white">
                Audit<span className="text-brand-600 dark:text-brand-400">Pulse</span>
              </span>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-brand-100 text-brand-700 dark:bg-brand-950 dark:text-brand-300">
                v1.1
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-medium tracking-wide">
              See risk early. Recover revenue.
            </p>
          </div>
        </div>

        {/* Sync & environment status */}
        <div className="hidden md:flex items-center gap-3 px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60 text-xs">
          <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <Database className="w-3.5 h-3.5" />
            <span>Nguồn CRM/ERP: Đã chốt 00:02</span>
          </div>
          <span className="text-slate-300 dark:text-slate-600">|</span>
          <span className="text-slate-500 dark:text-slate-400 font-mono text-[11px]">
            TZ: Asia/Ho_Chi_Minh
          </span>
        </div>

        {/* Right action group */}
        <div className="flex items-center gap-3">
          {/* Dark / Light Toggle */}
          <button
            onClick={() => setDarkMode(!darkMode)}
            className="p-2 rounded-lg text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title={darkMode ? 'Chuyển sang giao diện Sáng' : 'Chuyển sang giao diện Tối'}
          >
            {darkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
          </button>

          {/* Urgent Notification Bell */}
          <div className="relative">
            <div className="p-2 rounded-lg text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer">
              <Bell className="w-4 h-4" />
              {urgentRecheckCount > 0 && (
                <span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">
                  {urgentRecheckCount}
                </span>
              )}
            </div>
          </div>

          {/* Current User Pill */}
          <div className="flex items-center gap-2.5 pl-2 border-l border-slate-200 dark:border-slate-800">
            <img
              src={currentUser.avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100'}
              alt={currentUser.name}
              className="w-8 h-8 rounded-full object-cover ring-2 ring-brand-500/20"
            />
            <div className="text-left hidden sm:block">
              <div className="text-xs font-bold text-slate-800 dark:text-slate-100 leading-tight">
                {currentUser.name}
              </div>
              <div className="text-[11px] text-slate-400 font-medium">
                {currentUser.role === 'HEAD_AUDITOR'
                  ? 'Head Auditor'
                  : currentUser.role === 'AUDITOR'
                  ? `Auditor (${currentUser.auditorId})`
                  : currentUser.role === 'SALE'
                  ? `Sale (${currentUser.saleId})`
                  : 'Team Lead'}
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
