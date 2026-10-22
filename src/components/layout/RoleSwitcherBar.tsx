import React from 'react';
import { useAuditStore } from '../../services/auditStore';
import { Eye } from 'lucide-react';

export const RoleSwitcherBar: React.FC = () => {
  const { currentUser, allUsers, switchUser } = useAuditStore();

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'HEAD_AUDITOR':
        return 'Head Auditor';
      case 'AUDITOR':
        return 'Auditor';
      case 'SALE':
        return 'Sale';
      case 'TEAM_LEAD':
        return 'Team Lead';
      default:
        return role;
    }
  };

  const getRoleDescription = (role: string) => {
    switch (role) {
      case 'HEAD_AUDITOR':
        return 'Quản trị queue, duyệt catalog lỗi, điều phối 3 Auditor, miễn trừ action, xem toàn bộ KPI.';
      case 'AUDITOR':
        return 'Portfolio cố định: Chấm case, bắt lỗi, giao action cho sale, recheck và đóng action.';
      case 'SALE':
        return 'Chỉ xem action/case của mình: Giao diện tick "Tôi đã thực hiện" + đính kèm bằng chứng.';
      case 'TEAM_LEAD':
        return 'Xem KPI team, action quá hạn, metadata case; không xem evidence/hội thoại nhạy cảm.';
      default:
        return '';
    }
  };

  return (
    <div className="bg-slate-900 text-slate-200 border-b border-slate-800 text-xs px-4 py-1.5 sticky top-0 z-40">
      <div className="max-w-[1600px] mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-[10px] tracking-wider uppercase bg-slate-800 text-slate-300 border border-slate-700 px-1.5 py-0.5 rounded flex items-center gap-1">
            <Eye className="w-3 h-3 text-slate-400" /> VAI TRÒ DEMO
          </span>
          <span className="text-slate-600 hidden sm:inline">•</span>
          <span className="text-slate-400 text-[11px] hidden lg:inline">
            {getRoleDescription(currentUser.role)}
          </span>
        </div>

        <div className="flex items-center gap-1 overflow-x-auto max-w-full">
          {allUsers.map((user) => {
            const isSelected = user.id === currentUser.id;
            return (
              <button
                key={user.id}
                onClick={() => switchUser(user.id)}
                className={`px-2.5 py-1 rounded text-[11px] transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                  isSelected
                    ? 'bg-white text-slate-900 font-semibold'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
              >
                <span>{user.name}</span>
                <span className="text-[10px] opacity-70">
                  ({getRoleBadge(user.role)})
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
