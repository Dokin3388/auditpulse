import React, { useState } from 'react';
import { useAuditStore } from '../../services/auditStore';
import {
  ShieldAlert,
  Moon,
  Sun,
  Database,
  Bell,
  LogOut,
  Calendar,
} from 'lucide-react';
import { signOut } from '../../services/auth';

interface NavbarProps {
  darkMode: boolean;
  setDarkMode: (val: boolean) => void;
}

// Formatted Vietnamese Date for system
const SYSTEM_DATE_DISPLAY = new Date().toLocaleDateString('vi-VN', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

export const Navbar: React.FC<NavbarProps> = ({ darkMode, setDarkMode }) => {
  const { currentUser, filteredActions } = useAuditStore();
  const [loggingOut, setLoggingOut] = useState(false);

  const urgentRecheckCount = filteredActions.filter(
    (a) => a.status === 'SALE_MARKED_DONE' || a.isOverdue
  ).length;

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await signOut();
    } catch {
      // ignore
    } finally {
      window.location.reload();
    }
  };



  return (
    <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-30 transition-colors">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
        {/* Brand identity on left */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-md bg-slate-900 dark:bg-slate-100 flex items-center justify-center text-white dark:text-slate-900 shrink-0">
            <ShieldAlert className="w-4 h-4 stroke-[2]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-base tracking-tight text-slate-900 dark:text-slate-100">
                AuditPulse
              </span>
              <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                v1.1
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-normal hidden sm:block">
              Hệ thống Audit Vận hành Sale
            </p>
          </div>
        </div>

        {/* Right side: System Date, Data Sync Status, User Info, Always Visible Logout */}
        <div className="flex items-center gap-3 sm:gap-4">
          {/* System Date */}
          <div className="hidden lg:flex items-center gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">
            <Calendar className="w-4 h-4 text-slate-500" />
            <span>Ngày: {SYSTEM_DATE_DISPLAY}</span>
          </div>

          {/* Sync & environment status */}
          <div className="hidden md:flex items-center gap-2 px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs">
            <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></span>
            <Database className="w-3.5 h-3.5 text-slate-500" />
            <span className="font-medium text-slate-700 dark:text-slate-300">Dữ liệu Neon: Đã kết nối</span>
          </div>

          {/* Dark / Light Toggle */}
          <button
            onClick={() => setDarkMode(!darkMode)}
            className="p-1.5 rounded-md text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title={darkMode ? 'Chuyển sang giao diện Sáng' : 'Chuyển sang giao diện Tối'}
            aria-label="Toggle dark mode"
          >
            {darkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
          </button>

          {/* Urgent Notification Bell */}
          <div className="relative">
            <div
              className="p-1.5 rounded-md text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              title={urgentRecheckCount > 0 ? `${urgentRecheckCount} ca cần xử lý gấp` : 'Không có thông báo mới'}
            >
              <Bell className="w-4 h-4" />
              {urgentRecheckCount > 0 && (
                <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-rose-500"></span>
              )}
            </div>
          </div>

          {/* User Profile */}
          <div className="flex items-center gap-2.5 pl-2 border-l border-slate-200 dark:border-slate-800">
            <div className="w-7 h-7 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold text-xs flex items-center justify-center shrink-0">
              {currentUser.name.charAt(0)}
            </div>
            <div className="text-left hidden sm:block leading-tight">
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {currentUser.name}
              </div>
              <div className="text-xs text-slate-500 font-medium">
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

          {/* Logout Button: ALWAYS VISIBLE */}
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium text-slate-700 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-slate-300 dark:border-slate-700 transition-colors shrink-0"
            title="Đăng xuất khỏi hệ thống"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">{loggingOut ? 'Đang thoát…' : 'Đăng xuất'}</span>
          </button>
        </div>
      </div>
    </header>
  );
};
