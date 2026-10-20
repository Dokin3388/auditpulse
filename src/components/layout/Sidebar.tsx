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
  HelpCircle,
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
      badgeColor: 'bg-brand-500 text-white',
    },
    {
      id: 'action-detail' as NavTab,
      label: 'Sale Action',
      icon: CheckSquare,
      badge: filteredActions.length > 0 ? filteredActions.length : null,
      badgeColor: 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300',
    },
    {
      id: 'recheck-today' as NavTab,
      label: 'Recheck hôm nay',
      icon: Clock,
      badge: urgentRecheckCount > 0 ? urgentRecheckCount : null,
      badgeColor: 'bg-amber-500 text-white font-bold',
    },
    {
      id: 'portfolio' as NavTab,
      label: 'Auditor Portfolio',
      icon: Users2,
      badge: unreviewedTeamAlerts > 0 ? `${unreviewedTeamAlerts} đổi team` : null,
      badgeColor: 'bg-rose-500 text-white',
    },
    {
      id: 'performance' as NavTab,
      label: 'Hiệu suất Auditor',
      icon: TrendingUp,
      badge: 'Outcome',
      badgeColor: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
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
    <aside className="w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col shrink-0 min-h-[calc(100vh-101px)] transition-colors">
      <div className="p-4 flex-1 space-y-1">
        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 px-3 py-2">
          Phân hệ tác vụ
        </div>

        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                isActive
                  ? 'bg-brand-50 text-brand-700 dark:bg-brand-950/80 dark:text-brand-300 shadow-sm border border-brand-200/60 dark:border-brand-800'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <div className="flex items-center gap-3">
                <Icon
                  className={`w-4 h-4 ${
                    isActive ? 'text-brand-600 dark:text-brand-400' : 'text-slate-400'
                  }`}
                />
                <span>{item.label}</span>
              </div>
              {item.badge && (
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                    item.badgeColor || 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Role Notice Card */}
      <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-850/50 m-3 rounded-xl border">
        <div className="flex items-start gap-2 text-xs">
          <HelpCircle className="w-4 h-4 text-brand-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-bold text-slate-800 dark:text-slate-200">
              Quyền: {currentUser.role}
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight">
              {currentUser.role === 'SALE'
                ? 'Chỉ hiển thị khách & việc được phân công của bạn.'
                : currentUser.role === 'AUDITOR'
                ? 'Portfolio cố định theo phân bổ của Head Auditor.'
                : currentUser.role === 'TEAM_LEAD'
                ? 'Ẩn hội thoại/evidence nhạy cảm theo Spec.'
                : 'Đầy đủ quyền cấu hình và duyệt nghiệp vụ.'}
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
};
