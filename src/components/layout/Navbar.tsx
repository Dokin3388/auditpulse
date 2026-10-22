import React from 'react';
import { useAuditStore } from '../../services/auditStore';
import {
  ShieldAlert,
  Moon,
  Sun,
  Database,
  Bell,
  LogOut,
} from 'lucide-react';
import { signOut } from '../../services/auth';

interface NavbarProps {
  darkMode: boolean;
  setDarkMode: (val: boolean) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ darkMode, setDarkMode }) => {
  const { currentUser, filteredActions } = useAuditStore();

  const urgentRecheckCount = filteredActions.filter(
    (a) => a.status === 'SALE_MARKED_DONE' || a.isOverdue
  ).length;

  const handleSignOut = async () => {
    await signOut();
    window.location.reload();
  };

  return (
    <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-[33px] z-30 transition-colors">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 h-13 flex items-center justify-between gap-4">
        {/* Brand identity */}
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-md bg-slate-900 dark:bg-slate-100 flex items-center justify-center text-white dark:text-slate-900">
            <ShieldAlert className="w-4 h-4 stroke-[2]" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-sm tracking-tight text-slate-900 dark:text-white">
                AuditPulse
              </span>
              <span className="text-[10px] font-medium px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                v1.1
              </span>
            </div>
            <p className="text-[10px] text-slate-400 font-normal leading-none mt-0.5">
              See risk early. Recover revenue.
            </p>
          </div>
        </div>

        {/* Sync & environment status */}
        <div className="hidden md:flex items-center gap-2.5 px-2.5 py-1 rounded-md bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 text-[11px]">
          <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
            <Database className="w-3 h-3 text-slate-400" />
            <span>Nguồn CRM/ERP: Chốt 00:02</span>
          </div>
          <span className="text-slate-300 dark:text-slate-700">|</span>
          <span className="text-slate-400 font-mono text-[10px]">
            Asia/Ho_Chi_Minh
          </span>
        </div>

        {/* Right action group */}
        <div className="flex items-center gap-2">
          {/* Dark / Light Toggle */}
          <button
            onClick={() => setDarkMode(!darkMode)}
            className="p-1.5 rounded-md text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title={darkMode ? 'Chuyển sang giao diện Sáng' : 'Chuyển sang giao diện Tối'}
          >
            {darkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
          </button>

          {/* Urgent Notification Bell */}
          <div className="relative">
            <div className="p-1.5 rounded-md text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer">
              <Bell className="w-4 h-4" />
              {urgentRecheckCount > 0 && (
                <span className="absolute top-1 right-1 w-3.5 h-3.5 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center">
                  {urgentRecheckCount}
                </span>
              )}
            </div>
          </div>

          {/* Current User Pill */}
          <div className="flex items-center gap-2 pl-2 border-l border-slate-200 dark:border-slate-800">
            <img
              src={currentUser.avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100'}
              alt={currentUser.name}
              className="w-7 h-7 rounded-full object-cover border border-slate-300 dark:border-slate-700"
            />
            <div className="text-left hidden sm:block leading-tight">
              <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                {currentUser.name}
              </div>
              <div className="text-[10px] text-slate-400 font-medium">
                {currentUser.role === 'HEAD_AUDITOR'
                  ? 'Head Auditor'
                  : currentUser.role === 'AUDITOR'
                  ? `Auditor (${currentUser.auditorId})`
                  : currentUser.role === 'SALE'
                  ? `Sale (${currentUser.saleId})`
                  : 'Team Lead'}
              </div>
            </div>
            <button
              type="button"
              onClick={handleSignOut}
              className="ml-1 inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-2 py-1.5 text-[11px] font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
              title="Đăng xuất"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden md:inline">Đăng xuất</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
