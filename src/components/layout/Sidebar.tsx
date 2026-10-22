import React from 'react';
import { useAuditStore } from '../../services/auditStore';
import {
  LayoutDashboard,
  Layers,
  CheckSquare,
  Clock,
  UserRoundCog,
  TrendingUp,
  FileBarChart,
  Settings,
} from 'lucide-react';

export type NavTab =
  | 'dashboard'
  | 'queue'
  | 'action-detail'
  | 'recheck-today'
  | 'portfolio'
  | 'assignments'
  | 'performance'
  | 'reports'
  | 'settings';

interface SidebarProps {
  activeTab: NavTab;
  setActiveTab: (tab: NavTab) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab }) => {
  const { filteredQueueItems, filteredActions, currentUser } = useAuditStore();

  const pendingQueueCount = filteredQueueItems.filter(
    (q) => q.status === 'ASSIGNED' || q.status === 'IN_REVIEW' || q.status === 'PENDING'
  ).length;

  const urgentRecheckCount = filteredActions.filter(
    (a) => a.status === 'SALE_MARKED_DONE' || a.isOverdue
  ).length;

  const navItems = [
    {
      id: 'dashboard' as NavTab,
      label: 'Tổng quan',
      icon: LayoutDashboard,
      badge: null,
    },
    {
      id: 'queue' as NavTab,
      label: 'Audit Queue',
      icon: Layers,
      badge: pendingQueueCount > 0 ? pendingQueueCount : null,
      badgeColor: 'bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-200',
    },
    {
      id: 'action-detail' as NavTab,
      label: 'Sale Action',
      icon: CheckSquare,
      badge: filteredActions.length > 0 ? filteredActions.length : null,
      badgeColor: 'bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-200',
    },
    {
      id: 'recheck-today' as NavTab,
      label: 'Recheck hôm nay',
      icon: Clock,
      badge: urgentRecheckCount > 0 ? urgentRecheckCount : null,
      badgeColor: 'bg-amber-100 text-amber-900 dark:bg-amber-900/60 dark:text-amber-200',
    },
    {
      id: 'assignments' as NavTab,
      label: 'Phân công Auditor',
      icon: UserRoundCog,
      badge: null,
    },
    {
      id: 'performance' as NavTab,
      label: 'Hiệu suất Auditor',
      icon: TrendingUp,
      badge: null,
    },
    {
      id: 'reports' as NavTab,
      label: 'Báo cáo & KPI',
      icon: FileBarChart,
      badge: null,
    },
    {
      id: 'settings' as NavTab,
      label: 'Cấu hình',
      icon: Settings,
      badge: null,
    },
  ];

  return (
    <aside className="w-[230px] bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col shrink-0 sticky top-14 h-[calc(100vh-56px)] transition-colors">
      <div className="p-3 flex-1 space-y-1">
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 px-3 py-2">
          Phân hệ tác vụ
        </div>

        {navItems.map((item) => {
          const Icon = item.icon;
          // Treat 'portfolio' as 'assignments' if active
          const isActive = activeTab === item.id || (item.id === 'assignments' && activeTab === 'portfolio');
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-md text-sm transition-all text-left ${
                isActive
                  ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 font-semibold shadow-sm'
                  : 'text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 font-medium'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Icon
                  className={`w-4 h-4 shrink-0 ${
                    isActive
                      ? 'text-white dark:text-slate-900'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                />
                <span className="truncate">{item.label}</span>
              </div>
              {item.badge !== null && item.badge !== undefined && (
                <span
                  className={`text-xs px-2 py-0.5 rounded font-medium shrink-0 ml-1.5 ${
                    isActive
                      ? 'bg-white/20 text-white dark:bg-slate-900/20 dark:text-slate-900'
                      : item.badgeColor || 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Footer Info */}
      <div className="p-3.5 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 space-y-1">
        <div className="flex items-center justify-between px-1">
          <span className="font-semibold text-slate-700 dark:text-slate-300">AuditPulse</span>
          <span className="font-mono text-xs">v1.1</span>
        </div>
        <div className="px-1 text-slate-600 dark:text-slate-400">
          Vai trò: <strong className="text-slate-800 dark:text-slate-200">{currentUser.role}</strong>
        </div>
      </div>
    </aside>
  );
};
