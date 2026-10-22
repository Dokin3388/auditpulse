import React from 'react';
import { useAuditStore } from '../../services/auditStore';
import {
  LayoutDashboard,
  Layers,
  CheckSquare,
  Clock,
  Users2,
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
  | 'performance'
  | 'reports'
  | 'settings';

interface SidebarProps {
  activeTab: NavTab;
  setActiveTab: (tab: NavTab) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab }) => {
  const { filteredQueueItems, filteredActions, teamChangeAlerts, currentUser } = useAuditStore();

  const pendingQueueCount = filteredQueueItems.filter(
    (q) => q.status === 'ASSIGNED' || q.status === 'IN_REVIEW' || q.status === 'PENDING'
  ).length;

  const urgentRecheckCount = filteredActions.filter(
    (a) => a.status === 'SALE_MARKED_DONE' || a.isOverdue
  ).length;

  const unreviewedTeamAlerts = teamChangeAlerts.filter((a) => !a.reviewed).length;

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
      badgeColor: 'bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-200',
    },
    {
      id: 'action-detail' as NavTab,
      label: 'Sale Action',
      icon: CheckSquare,
      badge: filteredActions.length > 0 ? filteredActions.length : null,
      badgeColor: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
    },
    {
      id: 'recheck-today' as NavTab,
      label: 'Recheck hôm nay',
      icon: Clock,
      badge: urgentRecheckCount > 0 ? urgentRecheckCount : null,
      badgeColor: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
    },
    {
      id: 'portfolio' as NavTab,
      label: 'Auditor Portfolio',
      icon: Users2,
      badge: unreviewedTeamAlerts > 0 ? `${unreviewedTeamAlerts} đổi team` : null,
      badgeColor: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200',
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
      label: 'Catalog & Cấu hình',
      icon: Settings,
      badge: null,
    },
  ];

  return (
    <aside className="w-56 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col shrink-0 min-h-[calc(100vh-90px)] transition-colors">
      <div className="p-3 flex-1 space-y-0.5">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 px-2.5 py-1.5">
          Phân hệ tác vụ
        </div>

        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center justify-between px-2.5 py-2 rounded-md text-xs transition-colors text-left ${
                isActive
                  ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-semibold border-l-2 border-slate-900 dark:border-slate-100'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-850'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <Icon
                  className={`w-4 h-4 shrink-0 ${
                    isActive
                      ? 'text-slate-900 dark:text-white'
                      : 'text-slate-400 group-hover:text-slate-600'
                  }`}
                />
                <span className="truncate">{item.label}</span>
              </div>
              {item.badge !== null && item.badge !== undefined && (
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded font-medium shrink-0 ml-1.5 ${
                    item.badgeColor || 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Footer info */}
      <div className="p-3 border-t border-slate-200 dark:border-slate-800 text-[11px] text-slate-400 space-y-1.5">
        <div className="flex items-center justify-between px-1">
          <span className="font-medium text-slate-600 dark:text-slate-400">AuditFlow Spec</span>
          <span className="font-mono text-[10px]">v1.1</span>
        </div>
        <div className="px-1 text-[10px] text-slate-400 leading-tight">
          Role: <strong className="text-slate-600 dark:text-slate-300">{currentUser.role}</strong>
        </div>
      </div>
    </aside>
  );
};
