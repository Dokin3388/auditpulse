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
  const [selectedAuditDate, setSelectedAuditDate] = useState<string>('');
  const [showAllDates, setShowAllDates] = useState(false);

  // Selected item for audit modal
  const [activeQueueItem, setActiveQueueItem] = useState<AuditQueueItem | null>(() => {
    if (initialSelectedId) {
      return filteredQueueItems.find((q) => q.id === initialSelectedId) || null;
    }
    return null;
  });

  // Reassignment modal state
  const [reassignItem, setReassignItem] = useState<AuditQueueItem | null>(null);
  const [newAuditorId, setNewAuditorId] = useState('');
  const [reassignReason, setReassignReason] = useState('');

  const availableAuditDates = useMemo(
    () => [...new Set(filteredQueueItems.map((item) => item.auditDate.slice(0, 10)))].sort((a, b) => b.localeCompare(a)),
    [filteredQueueItems]
  );
  // Start on the newest available audit day so an old backlog never masks
  // today's operational work when the queue is opened.
  const effectiveAuditDate = showAllDates ? '' : selectedAuditDate || availableAuditDates[0] || '';

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

      // Audit date
      if (effectiveAuditDate && item.auditDate.slice(0, 10) !== effectiveAuditDate) return false;

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
  }, [filteredQueueItems, searchTerm, selectedTeam, selectedAuditor, selectedTag, selectedStatus, effectiveAuditDate]);

  // Auditor list for reassignment
  const auditorOptions = allUsers.filter((u) => u.role === 'AUDITOR');
  const teamOptions = useMemo(
    () => [...new Map(allUsers.filter((u) => u.role === 'SALE' && u.teamId && u.teamName).map((u) => [u.teamId, { id: u.teamId!, name: u.teamName! }])).values()]
      .sort((a, b) => a.name.localeCompare(b.name, 'vi')),
    [allUsers]
  );

  const handleOpenReassign = (item: AuditQueueItem, e: React.MouseEvent) => {
    e.stopPropagation();
    setReassignItem(item);
    setNewAuditorId(item.assignedAuditorId || auditorOptions[0]?.id || '');
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
    setSelectedAuditDate('');
    setShowAllDates(false);
  };

  return (
    <div className="space-y-4 pb-8 animate-in fade-in duration-150">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold uppercase tracking-wider bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
              Run: {effectiveAuditDate ? `RUN-${effectiveAuditDate.replaceAll('-', '')}` : 'Chưa có run'} • v1.1
            </span>
            <span className="text-xs text-slate-400">Snapshot theo ngày {effectiveAuditDate || '—'}</span>
          </div>
          <h1 className="text-base font-semibold text-slate-900 dark:text-white mt-1">
            Hàng chờ Audit Hằng ngày (Audit Queue)
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Mỗi khách hàng 1 dòng duy nhất, gộp nhiều tag rủi ro phát sinh trong ngày audit D.
          </p>
        </div>

        <div className="text-xs text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-900 px-3 py-1.5 rounded-md border border-slate-200 dark:border-slate-800">
          Tổng: <strong className="text-slate-900 dark:text-slate-100 font-semibold">{filteredData.length}</strong> ca audit
        </div>
      </div>

      {/* Minimal Filter Toolbar */}
      <div className="bg-white dark:bg-slate-900 p-3 rounded-lg border border-slate-200 dark:border-slate-800 space-y-2.5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5">
          {/* Search box */}
          <div className="relative lg:col-span-1">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
            <input
              type="text"
              placeholder="Tìm khách, SĐT, sale..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full text-xs pl-8 pr-2.5 py-1.5 bg-slate-50 dark:bg-slate-850 border border-slate-300 dark:border-slate-700 rounded-md focus:outline-none focus:ring-1 focus:ring-slate-400 dark:text-slate-100 placeholder:text-slate-400"
            />
          </div>

          {/* Filter audit date */}
          <div className="flex gap-1.5">
            <input
              type="date"
              value={effectiveAuditDate}
              onChange={(e) => { setShowAllDates(false); setSelectedAuditDate(e.target.value); }}
              className="min-w-0 flex-1 text-xs px-2.5 py-1.5 bg-slate-50 dark:bg-slate-850 border border-slate-300 dark:border-slate-700 rounded-md focus:outline-none focus:ring-1 focus:ring-slate-400 dark:text-slate-100"
            />
            <button
              type="button"
              onClick={() => { setShowAllDates(true); setSelectedAuditDate(''); }}
              className={`shrink-0 px-2 py-1.5 text-[11px] rounded-md border ${showAllDates ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'}`}
            >
              Tất cả ngày
            </button>
          </div>

          {/* Filter Team */}
          <div>
            <select
              value={selectedTeam}
              onChange={(e) => setSelectedTeam(e.target.value)}
              className="w-full text-xs px-2.5 py-1.5 bg-slate-50 dark:bg-slate-850 border border-slate-300 dark:border-slate-700 rounded-md focus:outline-none focus:ring-1 focus:ring-slate-400 dark:text-slate-100"
            >
              <option value="ALL">Tất cả Team Sale</option>
              {teamOptions.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
            </select>
          </div>

          {/* Filter Auditor */}
          <div>
            <select
              value={selectedAuditor}
              onChange={(e) => setSelectedAuditor(e.target.value)}
              className="w-full text-xs px-2.5 py-1.5 bg-slate-50 dark:bg-slate-850 border border-slate-300 dark:border-slate-700 rounded-md focus:outline-none focus:ring-1 focus:ring-slate-400 dark:text-slate-100"
            >
              <option value="ALL">Tất cả Auditor</option>
              {auditorOptions.map((auditor) => <option key={auditor.id} value={auditor.id}>{auditor.name} ({auditor.auditorId || auditor.id})</option>)}
              <option value="UNASSIGNED">Chưa phân công (UNASSIGNED)</option>
            </select>
          </div>

          {/* Filter Risk Tag */}
          <div>
            <select
              value={selectedTag}
              onChange={(e) => {
                const nextTag = e.target.value;
                setSelectedTag(nextTag);
                // A risk-tag search is normally a cross-day investigation.
                // If the date was only implicit (latest day), broaden it so
                // tags from older available audit days are not hidden.
                if (nextTag !== 'ALL' && !selectedAuditDate) setShowAllDates(true);
              }}
              className="w-full text-xs px-2.5 py-1.5 bg-slate-50 dark:bg-slate-850 border border-slate-300 dark:border-slate-700 rounded-md focus:outline-none focus:ring-1 focus:ring-slate-400 dark:text-slate-100"
            >
              <option value="ALL">Tất cả Risk Tags</option>
              <option value="YESTERDAY_CUSTOMERS">Khách hôm qua</option>
              <option value="NO_QUOTATION">Chưa báo giá 2 ngày</option>
              <option value="QUOTED_NOT_ORDERED">Báo giá chưa chốt 7 ngày</option>
            </select>
          </div>

          {/* Filter Status */}
          <div>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full text-xs px-2.5 py-1.5 bg-slate-50 dark:bg-slate-850 border border-slate-300 dark:border-slate-700 rounded-md focus:outline-none focus:ring-1 focus:ring-slate-400 dark:text-slate-100"
            >
              <option value="ALL">Tất cả Trạng thái</option>
              <option value="ASSIGNED">Chờ audit (ASSIGNED)</option>
              <option value="IN_REVIEW">Đang chấm (IN_REVIEW)</option>
              <option value="COMPLETED_PASS">Audit ĐẠT (PASS)</option>
              <option value="COMPLETED_FAIL">Audit KHÔNG ĐẠT (FAIL)</option>
              <option value="SKIPPED">Bỏ qua (SKIPPED)</option>
              <option value="BLOCKED">Bị chặn (BLOCKED)</option>
            </select>
          </div>
        </div>

        {(searchTerm || selectedTeam !== 'ALL' || selectedAuditor !== 'ALL' || selectedTag !== 'ALL' || selectedStatus !== 'ALL' || effectiveAuditDate) && (
          <div className="flex items-center justify-between text-xs pt-1.5 border-t border-slate-100 dark:border-slate-800">
            <span className="text-slate-500 dark:text-slate-400 text-[11px]">
              Đang lọc: Tìm thấy {filteredData.length} kết quả {availableAuditDates.length > 0 && `(Ngày có sẵn: ${availableAuditDates.map((d) => d.split('-').reverse().join('/')).join(', ')})`}
            </span>
            <button
              onClick={resetFilters}
              className="text-slate-700 dark:text-slate-300 hover:underline flex items-center gap-1 font-medium text-[11px]"
            >
              <RotateCcw className="w-3 h-3" /> Xóa bộ lọc
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
        <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-850 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="py-2.5 px-3 font-semibold">Khách hàng / SĐT</th>
                  <th className="py-2.5 px-3 font-semibold">Sale phụ trách (Snapshot)</th>
                  <th className="py-2.5 px-3 font-semibold">Risk Tags</th>
                  <th className="py-2.5 px-3 font-semibold">Auditor phụ trách</th>
                  <th className="py-2.5 px-3 font-semibold">Trạng thái Audit</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {filteredData.map((item) => (
                  <tr
                    key={item.id}
                    onClick={() => setActiveQueueItem(item)}
                    className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 cursor-pointer transition-colors"
                  >
                    <td className="py-2.5 px-3">
                      <div className="font-semibold text-slate-900 dark:text-slate-100">
                        {item.customerName}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-400">
                        <span className="font-mono">{item.customerPhone}</span>
                        <span>•</span>
                        <span>{new Date(item.customerFirstSeen).toLocaleDateString('vi-VN')}</span>
                      </div>
                    </td>

                    <td className="py-2.5 px-3">
                      <div className="font-medium text-slate-800 dark:text-slate-200">
                        {item.saleName}
                      </div>
                      <div className="text-[11px] text-slate-400">{item.teamName}</div>
                    </td>

                    <td className="py-2.5 px-3">
                      <div className="flex flex-wrap items-center gap-1 max-w-xs">
                        {item.riskTags.map((tag) => (
                          <RiskTagBadge key={tag.code} code={tag.code} label={tag.label} />
                        ))}
                        {item.activeActionId && (
                          <span
                            onClick={(e) => {
                              e.stopPropagation();
                              if (onNavigateToAction) onNavigateToAction(item.activeActionId!);
                            }}
                            className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-300 dark:border-slate-700 hover:underline"
                            title="Bấm để mở Action đang mở liên kết"
                          >
                            Đang theo dõi
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-1.5">
                        <span className="font-normal text-slate-700 dark:text-slate-300">
                          {item.assignedAuditorName || (
                            <span className="text-amber-600 dark:text-amber-400 font-medium">Chưa gán</span>
                          )}
                        </span>
                        {item.sharedWork && (
                          <Badge variant="neutral" size="xs" className="text-[9px]">
                            Shared
                          </Badge>
                        )}
                        {(currentUser.role === 'HEAD_AUDITOR' || currentUser.role === 'ADMIN') && (
                          <button
                            onClick={(e) => handleOpenReassign(item, e)}
                            className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 ml-1 transition-colors"
                            title="Chuyển giao Auditor (Head Auditor only)"
                          >
                            <UserCheck className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>

                    <td className="py-2.5 px-3">
                      <div className="space-y-0.5">
                        <QueueStatusBadge status={item.status} />
                        {item.skipOrBlockReason && (
                          <p className="text-[10px] text-slate-400 truncate max-w-[180px]">
                            {item.skipOrBlockReason}
                          </p>
                        )}
                      </div>
                    </td>

                    <td className="py-2.5 px-3 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveQueueItem(item);
                        }}
                        className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-100 dark:hover:bg-white dark:text-slate-900 rounded text-[11px] font-medium transition-colors inline-flex items-center gap-1"
                      >
                        Chấm Case <ChevronRight className="w-3 h-3" />
                      </button>
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
          title="Chuyển giao Queue Item"
          subtitle={`Chuyển giao ca audit cho khách: ${reassignItem.customerName}`}
          maxWidth="md"
        >
          <div className="space-y-3 text-xs">
            <div className="p-2.5 bg-slate-50 dark:bg-slate-850 rounded border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300">
              <p className="font-semibold">Lưu ý tuân thủ Spec v1.1:</p>
              <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                Queue Item được chuyển giao sau khi tạo sẽ được gắn cờ <strong>shared_work</strong>. 
                Sản lượng KPI và attribution đơn cứu sẽ được tính theo quy tắc shared work của Head Auditor.
              </p>
            </div>

            <div>
              <label className="font-medium block mb-1 text-slate-700 dark:text-slate-300">
                Auditor mới phụ trách:
              </label>
              <select
                value={newAuditorId}
                onChange={(e) => setNewAuditorId(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-md border border-slate-300 dark:border-slate-700 dark:bg-slate-800 text-xs focus:outline-none focus:ring-1 focus:ring-slate-400"
              >
                {auditorOptions.map((a) => (
                  <option key={a.auditorId} value={a.auditorId}>
                    {a.name} ({a.auditorId})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="font-medium block mb-1 text-slate-700 dark:text-slate-300">
                Lý do chuyển giao (Bắt buộc):
              </label>
              <textarea
                rows={2}
                placeholder="VD: Auditor cũ nghỉ ốm, xung đột quyền quản lý..."
                value={reassignReason}
                onChange={(e) => setReassignReason(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-md border border-slate-300 dark:border-slate-700 dark:bg-slate-800 text-xs focus:outline-none focus:ring-1 focus:ring-slate-400"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t dark:border-slate-800">
              <button
                type="button"
                onClick={() => setReassignItem(null)}
                className="px-3 py-1.5 rounded-md text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleConfirmReassign}
                disabled={!reassignReason.trim()}
                className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-100 dark:text-slate-900 font-medium rounded-md text-xs disabled:opacity-40 transition-colors"
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
