import React, { useState, useMemo } from 'react';
import { useAuditStore } from '../../services/auditStore';
import type { AuditQueueItem } from '../../types';
import {
  Search,
  RotateCcw,
  UserCheck,
  ChevronRight,
} from 'lucide-react';
import { Badge, QueueStatusBadge, RiskTagBadge } from '../common/Badge';
import { EmptyState } from '../common/EmptyState';
import { AuditCaseDetailModal } from './AuditCaseDetailModal';
import { Modal } from '../common/Modal';

interface AuditQueueViewProps {
  onNavigateToAction?: (actionId: string) => void;
  initialSelectedId?: string | null;
}

export const AuditQueueView: React.FC<AuditQueueViewProps> = ({
  onNavigateToAction,
  initialSelectedId,
}) => {
  const {
    filteredQueueItems,
    currentUser,
    allUsers,
    reassignQueueItem,
  } = useAuditStore();

  // Search & Filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTeam, setSelectedTeam] = useState<string>('ALL');
  const [selectedAuditor, setSelectedAuditor] = useState<string>('ALL');
  const [selectedTag, setSelectedTag] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');

  // Selected item for audit modal
  const [activeQueueItem, setActiveQueueItem] = useState<AuditQueueItem | null>(() => {
    if (initialSelectedId) {
      return filteredQueueItems.find((q) => q.id === initialSelectedId) || null;
    }
    return null;
  });

  // Reassignment modal state
  const [reassignItem, setReassignItem] = useState<AuditQueueItem | null>(null);
  const [newAuditorId, setNewAuditorId] = useState('AUD-01');
  const [reassignReason, setReassignReason] = useState('');

  // Apply filters
  const filteredData = useMemo(() => {
    return filteredQueueItems.filter((item) => {
      // Search
      const matchSearch =
        item.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.customerPhone.includes(searchTerm) ||
        item.saleName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.id.toLowerCase().includes(searchTerm.toLowerCase());
      if (!matchSearch) return false;

      // Team
      if (selectedTeam !== 'ALL' && item.teamId !== selectedTeam) return false;

      // Auditor
      if (selectedAuditor !== 'ALL') {
        if (selectedAuditor === 'UNASSIGNED') {
          if (item.assignedAuditorId !== null) return false;
        } else if (item.assignedAuditorId !== selectedAuditor) {
          return false;
        }
      }

      // Tag
      if (selectedTag !== 'ALL') {
        const hasTag = item.riskTags.some((t) => t.code === selectedTag);
        if (!hasTag) return false;
      }

      // Status
      if (selectedStatus !== 'ALL' && item.status !== selectedStatus) return false;

      return true;
    });
  }, [filteredQueueItems, searchTerm, selectedTeam, selectedAuditor, selectedTag, selectedStatus]);

  // Auditor list for reassignment
  const auditorOptions = allUsers.filter((u) => u.role === 'AUDITOR');

  const handleOpenReassign = (item: AuditQueueItem, e: React.MouseEvent) => {
    e.stopPropagation();
    setReassignItem(item);
    setNewAuditorId(item.assignedAuditorId || 'AUD-01');
    setReassignReason('');
  };

  const handleConfirmReassign = () => {
    if (!reassignItem || !reassignReason.trim()) return;
    reassignQueueItem(reassignItem.id, newAuditorId, reassignReason);
    setReassignItem(null);
  };

  const resetFilters = () => {
    setSearchTerm('');
    setSelectedTeam('ALL');
    setSelectedAuditor('ALL');
    setSelectedTag('ALL');
    setSelectedStatus('ALL');
  };

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300">
              Run: RUN-2026-1020 • v1.1
            </span>
            <span className="text-xs text-slate-400">Snapshot lúc 00:02:15</span>
          </div>
          <h1 className="text-xl font-extrabold text-slate-900 dark:text-white mt-1">
            Hàng chờ Audit Hằng ngày (Audit Queue)
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Mỗi khách hàng là 1 dòng duy nhất, gộp nhiều tag rủi ro phát sinh trong ngày D.
          </p>
        </div>

        <div className="flex items-center gap-3 text-xs">
          <div className="bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-lg text-slate-600 dark:text-slate-300 font-medium">
            Tổng: <strong>{filteredData.length}</strong> ca audit
          </div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Search box */}
          <div className="relative lg:col-span-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Tìm khách, SĐT, sale..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full text-xs pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 dark:text-slate-100"
            />
          </div>

          {/* Filter Team */}
          <div>
            <select
              value={selectedTeam}
              onChange={(e) => setSelectedTeam(e.target.value)}
              className="w-full text-xs px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 dark:text-slate-100"
            >
              <option value="ALL">Tất cả Team Sale</option>
              <option value="TEAM-NORTH">Team B2B Miền Bắc</option>
              <option value="TEAM-ENT">Team Enterprise</option>
              <option value="TEAM-KEY">Team Key Account</option>
              <option value="TEAM-SOUTH">Team B2B Miền Nam</option>
            </select>
          </div>

          {/* Filter Auditor */}
          <div>
            <select
              value={selectedAuditor}
              onChange={(e) => setSelectedAuditor(e.target.value)}
              className="w-full text-xs px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 dark:text-slate-100"
            >
              <option value="ALL">Tất cả Auditor</option>
              <option value="AUD-01">Linh Nguyễn (AUD-01)</option>
              <option value="AUD-02">Huy Trần (AUD-02)</option>
              <option value="AUD-03">Trang Đỗ (AUD-03)</option>
              <option value="UNASSIGNED">Chưa phân công (UNASSIGNED)</option>
            </select>
          </div>

          {/* Filter Risk Tag */}
          <div>
            <select
              value={selectedTag}
              onChange={(e) => setSelectedTag(e.target.value)}
              className="w-full text-xs px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 dark:text-slate-100"
            >
              <option value="ALL">Tất cả Risk Tags</option>
              <option value="YESTERDAY_CUSTOMERS">⚡ Khách hôm qua</option>
              <option value="NO_QUOTATION">⏱️ Chưa báo giá 2 ngày</option>
              <option value="QUOTED_NOT_ORDERED">🎯 Báo giá chưa chốt 7 ngày</option>
            </select>
          </div>

          {/* Filter Status */}
          <div>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full text-xs px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 dark:text-slate-100"
            >
              <option value="ALL">Tất cả Trạng thái</option>
              <option value="ASSIGNED">Chờ audit (ASSIGNED)</option>
              <option value="IN_REVIEW">Đang chấm (IN_REVIEW)</option>
              <option value="COMPLETED_PASS">Audit ĐẠT (COMPLETED_PASS)</option>
              <option value="COMPLETED_FAIL">Audit KHÔNG ĐẠT (FAIL)</option>
              <option value="SKIPPED">Bỏ qua (SKIPPED)</option>
              <option value="BLOCKED">Bị chặn (BLOCKED)</option>
            </select>
          </div>
        </div>

        {(searchTerm || selectedTeam !== 'ALL' || selectedAuditor !== 'ALL' || selectedTag !== 'ALL' || selectedStatus !== 'ALL') && (
          <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-100 dark:border-slate-800">
            <span className="text-slate-500">
              Đang lọc: Tìm thấy {filteredData.length} kết quả
            </span>
            <button
              onClick={resetFilters}
              className="text-brand-600 dark:text-brand-400 hover:underline flex items-center gap-1 font-semibold"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Xóa bộ lọc
            </button>
          </div>
        )}
      </div>

      {/* Queue Table */}
      {filteredData.length === 0 ? (
        <EmptyState
          type="no-results"
          title="Không tìm thấy bản ghi queue nào"
          description="Hãy thử thay đổi điều kiện lọc team, auditor hoặc từ khóa tìm kiếm."
          actionLabel="Xóa bộ lọc"
          onAction={resetFilters}
        />
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/70 dark:bg-slate-850/70 border-b border-slate-200/80 dark:border-slate-800 text-slate-500 dark:text-slate-400 uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="py-3 px-4 font-bold">Khách hàng / SĐT</th>
                  <th className="py-3 px-4 font-bold">Sale phụ trách (Snapshot)</th>
                  <th className="py-3 px-4 font-bold">Risk Tags (Rule v1.1)</th>
                  <th className="py-3 px-4 font-bold">Auditor phụ trách</th>
                  <th className="py-3 px-4 font-bold">Trạng thái Audit</th>
                  <th className="py-3 px-4 font-bold text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {filteredData.map((item) => (
                  <tr
                    key={item.id}
                    onClick={() => setActiveQueueItem(item)}
                    className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 cursor-pointer transition-colors group"
                  >
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-slate-900 dark:text-slate-100 group-hover:text-brand-600 transition-colors">
                        {item.customerName}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-400">
                        <span className="font-mono">{item.customerPhone}</span>
                        <span>•</span>
                        <span>Vào lúc: {new Date(item.customerFirstSeen).toLocaleDateString('vi-VN')}</span>
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-slate-800 dark:text-slate-200">
                        {item.saleName}
                      </div>
                      <div className="text-[11px] text-slate-400">{item.teamName}</div>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="flex flex-wrap items-center gap-1.5 max-w-xs">
                        {item.riskTags.map((tag) => (
                          <RiskTagBadge key={tag.code} code={tag.code} label={tag.label} />
                        ))}
                        {item.activeActionId && (
                          <span
                            onClick={(e) => {
                              e.stopPropagation();
                              if (onNavigateToAction) onNavigateToAction(item.activeActionId!);
                            }}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 hover:underline"
                            title="Bấm để mở Action đang mở liên kết"
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse"></span>
                            Đang theo dõi
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium text-slate-700 dark:text-slate-300">
                          {item.assignedAuditorName || (
                            <span className="text-amber-500 font-semibold">Chưa gán</span>
                          )}
                        </span>
                        {item.sharedWork && (
                          <Badge variant="purple" size="xs" className="text-[10px]">
                            Shared
                          </Badge>
                        )}
                        {(currentUser.role === 'HEAD_AUDITOR' || currentUser.role === 'ADMIN') && (
                          <button
                            onClick={(e) => handleOpenReassign(item, e)}
                            className="p-1 rounded text-slate-400 hover:text-brand-600 hover:bg-slate-100 dark:hover:bg-slate-800 ml-1"
                            title="Chuyển giao Auditor (Head Auditor only)"
                          >
                            <UserCheck className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="space-y-1">
                        <QueueStatusBadge status={item.status} />
                        {item.skipOrBlockReason && (
                          <p className="text-[10px] text-slate-400 truncate max-w-[180px]">
                            Lý do: {item.skipOrBlockReason}
                          </p>
                        )}
                      </div>
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveQueueItem(item);
                          }}
                          className="px-3 py-1.5 bg-brand-50 hover:bg-brand-100 dark:bg-brand-950/80 text-brand-700 dark:text-brand-300 rounded-lg font-semibold text-xs transition-colors flex items-center gap-1"
                        >
                          Chấm Case <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Audit Case Detail Modal */}
      <AuditCaseDetailModal
        queueItem={activeQueueItem}
        isOpen={Boolean(activeQueueItem)}
        onClose={() => setActiveQueueItem(null)}
        onNavigateToAction={onNavigateToAction}
      />

      {/* Reassign Auditor Modal (Spec Section 3 & 9) */}
      {reassignItem && (
        <Modal
          isOpen={Boolean(reassignItem)}
          onClose={() => setReassignItem(null)}
          title="Chuyển giao Queue Item (Head Auditor)"
          subtitle={`Chuyển giao ca audit cho khách ${reassignItem.customerName}`}
          maxWidth="md"
        >
          <div className="space-y-4 text-xs">
            <div className="p-3 bg-amber-50 dark:bg-amber-950/40 rounded-xl border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200">
              <p className="font-semibold">Lưu ý tuân thủ Spec v1.1:</p>
              <p className="mt-1">
                Queue Item được chuyển giao sau khi tạo sẽ được gắn cờ <strong>shared_work</strong>. 
                Sản lượng KPI và attribution đơn cứu sẽ được tính theo quy tắc shared work của Head Auditor.
              </p>
            </div>

            <div>
              <label className="font-semibold block mb-1 text-slate-700 dark:text-slate-300">
                Auditor mới phụ trách:
              </label>
              <select
                value={newAuditorId}
                onChange={(e) => setNewAuditorId(e.target.value)}
                className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-800 text-xs"
              >
                {auditorOptions.map((a) => (
                  <option key={a.auditorId} value={a.auditorId}>
                    {a.name} ({a.auditorId})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="font-semibold block mb-1 text-slate-700 dark:text-slate-300">
                Lý do chuyển giao (Bắt buộc):
              </label>
              <textarea
                rows={2}
                placeholder="VD: Auditor cũ nghỉ ốm, xung đột quyền quản lý..."
                value={reassignReason}
                onChange={(e) => setReassignReason(e.target.value)}
                className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-800 text-xs"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t dark:border-slate-800">
              <button
                type="button"
                onClick={() => setReassignItem(null)}
                className="px-3 py-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleConfirmReassign}
                disabled={!reassignReason.trim()}
                className="px-4 py-1.5 bg-brand-600 hover:bg-brand-700 text-white font-semibold rounded-lg disabled:opacity-50"
              >
                Xác nhận chuyển giao
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
