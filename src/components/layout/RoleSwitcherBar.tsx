import React from 'react';
import { useAuditStore } from '../../services/auditStore';
import { Eye } from 'lucide-react';

export const RoleSwitcherBar: React.FC = () => {
  const { currentUser, allUsers, switchUser } = useAuditStore();

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'HEAD_AUDITOR':
        return '👑 Head Auditor';
      case 'AUDITOR':
        return '🔍 Auditor';
      case 'SALE':
        return '💼 Sale';
      case 'TEAM_LEAD':
        return '👥 Team Lead';
      default:
        return role;
    }
  };

  const getRoleDescription = (role: string) => {
    switch (role) {
      case 'HEAD_AUDITOR':
        return 'Toàn quyền: Quản lý queue, phê duyệt catalog lỗi, điều phối 3 Auditor, miễn trừ action, xem toàn bộ KPI.';
      case 'AUDITOR':
        return 'Portfolio cố định: Chấm case, bắt lỗi, giao action cho sale, recheck và là người DUY NHẤT có quyền đóng action.';
      case 'SALE':
        return 'Chỉ xem action/case của mình: Giao diện tối giản tick "Tôi đã thực hiện" + đính kèm bằng chứng. Không thể tự đóng action.';
      case 'TEAM_LEAD':
        return 'Quản trị đội ngũ: Xem KPI team, action quá hạn, metadata case; không xem evidence/hội thoại nhạy cảm theo Spec.';
      default:
        return '';
    }
  };

  return (
    <div className="bg-slate-900 text-white border-b border-slate-800 text-xs px-4 py-2 sticky top-0 z-40 shadow-sm">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-bold text-[11px] tracking-wider uppercase bg-brand-600/30 text-brand-400 border border-brand-500/40 px-2 py-0.5 rounded flex items-center gap-1">
            <Eye className="w-3 h-3" /> DEMO ROLE SWITCHER
          </span>
          <span className="text-slate-400 hidden sm:inline">|</span>
          <span className="text-slate-300 font-medium hidden lg:inline">
            {getRoleDescription(currentUser.role)}
          </span>
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto max-w-full pb-1 md:pb-0">
          {allUsers.map((user) => {
            const isSelected = user.id === currentUser.id;
            return (
              <button
                key={user.id}
                onClick={() => switchUser(user.id)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all whitespace-nowrap flex items-center gap-1.5 ${
                  isSelected
                    ? 'bg-brand-500 text-white shadow-sm ring-1 ring-brand-300'
                    : 'bg-slate-800/80 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/60'
                }`}
                title={`${user.name} - ${user.role}`}
              >
                <span>{getRoleBadge(user.role).split(' ')[0]}</span>
                <span className="font-semibold">{user.name}</span>
                {user.role === 'AUDITOR' && (
                  <span className="opacity-75 text-[10px]">({user.auditorId})</span>
                )}
                {user.role === 'SALE' && (
                  <span className="opacity-75 text-[10px]">({user.saleId})</span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
