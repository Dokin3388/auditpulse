import React, { useState, useMemo } from 'react';
import { useAuditStore } from '../../services/auditStore';
import type { AuditQueueItem } from '../../types';
import {
  Search,
  RotateCcw,
  UserCheck,
  ChevronRight,
  Inbox,
  UserX,
  Clock,
  AlertTriangle,
} from 'lucide-react';
import { QueueStatusBadge, RiskTagBadge } from '../common/Badge';
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

  // Start on the newest available audit day
  const effectiveAuditDate = selectedAuditDate === '__ALL__' ? '' : selectedAuditDate || availableAuditDates[0] || '';

  // Items scoped to the selected audit date
  const dateScopedItems = useMemo(() => {
    if (!effectiveAuditDate) return filteredQueueItems;
    return filteredQueueItems.filter((item) => item.auditDate.slice(0, 10) === effectiveAuditDate);
  }, [filteredQueueItems, effectiveAuditDate]);

  // Stat Bar Metrics
  const totalAuditCount = dateScopedItems.length;
  const unassignedCount = dateScopedItems.filter(
    (item) => !item.assignedAuditorId || item.status === 'UNASSIGNED' || item.status === 'PENDING'
  ).length;
  const inRecheckCount = dateScopedItems.filter(
    (item) => item.status === 'IN_REVIEW' || Boolean(item.activeActionId)
  ).length;
  const overdueCount = dateScopedItems.filter((item) =>
    item.riskTags.some((t) => t.code === 'QUOTED_NOT_ORDERED')
  ).length;

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
    setSelectedAuditDate(availableAuditDates[0] || '');
  };

  const hasActiveFilters = Boolean(
    searchTerm ||
    selectedTeam !== 'ALL' ||
    selectedAuditor !== 'ALL' ||
    selectedTag !== 'ALL' ||
    selectedStatus !== 'ALL' ||
    (selectedAuditDate && selectedAuditDate !== availableAuditDates[0])
  );

  const activeFilterList = useMemo(() => {
    const list: string[] = [];
    if (searchTerm) list.push(`Từ khóa: "${searchTerm}"`);
    if (selectedTeam !== 'ALL') {
      const t = teamOptions.find((x) => x.id === selectedTeam);
      list.push(`Team: ${t ? t.name : selectedTeam}`);
    }
    if (selectedAuditor !== 'ALL') {
      const a = auditorOptions.find((x) => x.id === selectedAuditor);
      list.push(`Auditor: ${a ? a.name : selectedAuditor}`);
    }
    if (selectedTag !== 'ALL') list.push(`Loại: ${selectedTag}`);
    if (selectedStatus !== 'ALL') list.push(`Trạng thái: ${selectedStatus}`);
    return list;
  }, [searchTerm, selectedTeam, selectedAuditor, selectedTag, selectedStatus, teamOptions, auditorOptions]);

  return (
    <div className="space-y-4 pb-12">
      {/* 1. Tiêu đề trang (22–26px) & 2. Một dòng mô tả ngắn */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
          Hàng chờ Audit hằng ngày (Audit Queue)
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
          Quản lý và thực hiện kiểm toán danh sách khách hàng phát sinh rủi ro vận hành theo ngày.
        </p>
      </div>

      {/* 3. Thanh chỉ số: Tổng cần audit, Chưa phân công, Đang recheck, Quá hạn */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white dark:bg-slate-900 p-4 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
              Tổng cần audit
            </span>
            <span className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1 block">
              {totalAuditCount}
            </span>
          </div>
          <div className="w-10 h-10 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-center shrink-0">
            <Inbox className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
              Chưa phân công
            </span>
            <span className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1 block">
              {unassignedCount}
            </span>
          </div>
          <div className="w-10 h-10 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 flex items-center justify-center shrink-0">
            <UserX className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
              Đang recheck
            </span>
            <span className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1 block">
              {inRecheckCount}
            </span>
          </div>
          <div className="w-10 h-10 rounded-md bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
            <Clock className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
              Quá hạn
            </span>
            <span className="text-2xl font-bold text-rose-600 dark:text-rose-400 mt-1 block">
              {overdueCount}
            </span>
          </div>
          <div className="w-10 h-10 rounded-md bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* 4. Khu vực bộ lọc cố định ngay dưới chỉ số: Ngày audit, Team Sale, Auditor, Loại cảnh báo, Trạng thái, Ô tìm kiếm, Nút Xóa bộ lọc */}
      <div className="bg-white dark:bg-slate-900 p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-2.5 items-end">
          {/* Ngày audit */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Ngày audit
            </label>
            <input
              type="date"
              value={effectiveAuditDate}
              onChange={(e) => setSelectedAuditDate(e.target.value)}
              className="w-full text-sm px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-slate-400"
            />
          </div>

          {/* Team Sale */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Team Sale
            </label>
            <select
              value={selectedTeam}
              onChange={(e) => setSelectedTeam(e.target.value)}
              className="w-full text-sm px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-slate-400"
            >
              <option value="ALL">Tất cả Team</option>
              {teamOptions.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </div>

          {/* Auditor */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Auditor
            </label>
            <select
              value={selectedAuditor}
              onChange={(e) => setSelectedAuditor(e.target.value)}
              className="w-full text-sm px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-slate-400"
            >
              <option value="ALL">Tất cả Auditor</option>
              {auditorOptions.map((auditor) => (
                <option key={auditor.id} value={auditor.id}>
                  {auditor.name}
                </option>
              ))}
              <option value="UNASSIGNED">Chưa phân công</option>
            </select>
          </div>

          {/* Loại cảnh báo (Risk tag) */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Loại cảnh báo
            </label>
            <select
              value={selectedTag}
              onChange={(e) => {
                const nextTag = e.target.value;
                setSelectedTag(nextTag);
                if (nextTag !== 'ALL') {
                  setSelectedAuditDate('__ALL__');
                }
              }}
              className="w-full text-sm px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-slate-400"
            >
              <option value="ALL">Tất cả cảnh báo</option>
              <option value="NO_QUOTATION">Chưa báo giá 2 ngày</option>
              <option value="QUOTED_NOT_ORDERED">Chưa chốt đơn 7 ngày</option>
              <option value="YESTERDAY_CUSTOMERS">Khách hôm qua</option>
            </select>
          </div>

          {/* Trạng thái audit */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Trạng thái
            </label>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full text-sm px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-slate-400"
            >
              <option value="ALL">Tất cả trạng thái</option>
              <option value="PENDING">Chưa phân công</option>
              <option value="ASSIGNED">Đã phân công</option>
              <option value="IN_REVIEW">Đang kiểm tra</option>
              <option value="COMPLETED_PASS">Đã đóng (Đạt)</option>
              <option value="COMPLETED_FAIL">Chưa đạt</option>
            </select>
          </div>

          {/* Ô tìm kiếm */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Tìm kiếm
            </label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                placeholder="Khách, SĐT, sale..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full text-sm pl-8 pr-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
              />
            </div>
          </div>

          {/* Nút Xóa bộ lọc placed at the end of the row */}
          <div>
            <button
              onClick={resetFilters}
              disabled={!hasActiveFilters}
              className="w-full h-[34px] px-3 py-1.5 text-sm font-medium border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-md flex items-center justify-center gap-1.5 transition-colors disabled:opacity-40 disabled:hover:bg-transparent"
              title="Đặt lại bộ lọc về mặc định"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Xóa bộ lọc</span>
            </button>
          </div>
        </div>

        {/* Filter feedback line */}
        <div className="flex items-center justify-between text-xs text-slate-500 pt-1 border-t border-slate-100 dark:border-slate-800">
          <span>
            Hiển thị <strong>{filteredData.length}</strong> ca audit{' '}
            {effectiveAuditDate && `cho ngày ${new Date(`${effectiveAuditDate}T00:00:00`).toLocaleDateString('vi-VN')}`}
          </span>
          {availableAuditDates.length > 0 && (
            <span className="hidden md:inline text-slate-400">
              Các ngày có dữ liệu: {availableAuditDates.map((d) => d.split('-').reverse().join('/')).slice(0, 3).join(', ')}
            </span>
          )}
        </div>
      </div>

      {/* 5. Bảng Audit Queue */}
      {filteredData.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-8 text-center space-y-3 shadow-sm">
          <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 mx-auto flex items-center justify-center">
            <Search className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
            Không tìm thấy ca audit nào
          </h3>
          <div className="text-sm text-slate-600 dark:text-slate-400 max-w-md mx-auto space-y-1">
            <p>
              <strong>Ngày đang chọn:</strong>{' '}
              {effectiveAuditDate ? new Date(`${effectiveAuditDate}T00:00:00`).toLocaleDateString('vi-VN') : 'Tất cả'}
            </p>
            <p>
              <strong>Bộ lọc đang áp dụng:</strong>{' '}
              {activeFilterList.length > 0 ? activeFilterList.join(' • ') : 'Mặc định'}
            </p>
            <p>
              <strong>Lý do:</strong> Không có dữ liệu ca audit phù hợp với tiêu chí tìm kiếm hoặc ngày được chọn.
            </p>
          </div>
          <div>
            <button
              onClick={resetFilters}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-100 dark:hover:bg-white dark:text-slate-900 rounded-md text-sm font-semibold transition-colors"
            >
              Xóa bộ lọc
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="overflow-x-auto max-h-[calc(100vh-380px)] min-h-[300px]">
            <table className="w-full text-left border-collapse min-w-[950px]">
              {/* Sticky header on table scroll */}
              <thead className="sticky top-0 z-10 bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 text-sm font-semibold">
                <tr>
                  <th className="py-3 px-4">Khách hàng / SĐT</th>
                  <th className="py-3 px-4">Sale phụ trách</th>
                  <th className="py-3 px-4">Team</th>
                  <th className="py-3 px-4">Risk tags</th>
                  <th className="py-3 px-4">Auditor</th>
                  <th className="py-3 px-4">Trạng thái audit</th>
                  <th className="py-3 px-4 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredData.map((item) => (
                  <tr
                    key={item.id}
                    className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    {/* Cột 1: Khách hàng / SĐT - Nổi bật */}
                    <td className="py-3 px-4">
                      <div className="font-bold text-base text-slate-900 dark:text-slate-100">
                        {item.customerName}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-500 font-mono">
                        <span>{item.customerPhone}</span>
                        <span>•</span>
                        <span>Ngày tạo: {new Date(item.customerFirstSeen).toLocaleDateString('vi-VN')}</span>
                      </div>
                    </td>

                    {/* Cột 2: Sale phụ trách - Nổi bật */}
                    <td className="py-3 px-4">
                      <div className="font-semibold text-sm text-slate-900 dark:text-slate-100">
                        {item.saleName}
                      </div>
                      <div className="text-xs text-slate-500 font-mono">
                        {item.saleId || 'Mã Sale'}
                      </div>
                    </td>

                    {/* Cột 3: Team */}
                    <td className="py-3 px-4 text-sm text-slate-700 dark:text-slate-300 font-medium">
                      {item.teamName}
                    </td>

                    {/* Cột 4: Risk tags - Dùng badge ngắn, không dùng đoạn text dài */}
                    <td className="py-3 px-4">
                      <div className="flex flex-wrap items-center gap-1.5 max-w-xs">
                        {item.riskTags.map((tag) => (
                          <RiskTagBadge key={tag.code} code={tag.code} label={tag.label} />
                        ))}
                      </div>
                    </td>

                    {/* Cột 5: Auditor */}
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5 text-sm">
                        <span className="font-medium text-slate-800 dark:text-slate-200">
                          {item.assignedAuditorName || (
                            <span className="text-slate-500">Chưa gán</span>
                          )}
                        </span>
                        {(currentUser.role === 'HEAD_AUDITOR' || currentUser.role === 'ADMIN') && (
                          <button
                            onClick={(e) => handleOpenReassign(item, e)}
                            className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 ml-1 transition-colors"
                            title="Điều chuyển Auditor phụ trách"
                          >
                            <UserCheck className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>

                    {/* Cột 6: Trạng thái audit - Màu sắc nhất quán */}
                    <td className="py-3 px-4">
                      <QueueStatusBadge status={item.status} />
                    </td>

                    {/* Cột 7: Thao tác - Duy nhất một nút chính "Mở case" */}
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => {
                          if (item.activeActionId && onNavigateToAction) {
                            onNavigateToAction(item.activeActionId);
                          } else {
                            setActiveQueueItem(item);
                          }
                        }}
                        className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-100 dark:hover:bg-white dark:text-slate-900 rounded-md text-sm font-semibold transition-colors inline-flex items-center gap-1"
                      >
                        <span>Mở case</span>
                        <ChevronRight className="w-4 h-4" />
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

      {/* Reassign Auditor Modal */}
      {reassignItem && (
        <Modal
          isOpen={Boolean(reassignItem)}
          onClose={() => setReassignItem(null)}
          title="Chuyển giao Queue Item"
          subtitle={`Chuyển giao ca audit cho khách: ${reassignItem.customerName}`}
          maxWidth="md"
        >
          <div className="space-y-3.5 text-sm">
            <div className="p-3 bg-slate-50 dark:bg-slate-850 rounded-md border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300">
              <p className="font-semibold">Lưu ý tuân thủ:</p>
              <p className="mt-0.5 text-xs text-slate-500">
                Queue Item được chuyển giao sẽ ghi nhận dấu vết thay đổi và cập nhật phân công auditor tương ứng.
              </p>
            </div>

            <div>
              <label className="font-medium block mb-1 text-slate-700 dark:text-slate-300">
                Auditor mới phụ trách:
              </label>
              <select
                value={newAuditorId}
                onChange={(e) => setNewAuditorId(e.target.value)}
                className="w-full px-3 py-2 rounded-md border border-slate-300 dark:border-slate-700 dark:bg-slate-800 text-sm focus:outline-none focus:ring-1 focus:ring-slate-400"
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
                placeholder="VD: Cân bằng tải queue, auditor nghỉ phép..."
                value={reassignReason}
                onChange={(e) => setReassignReason(e.target.value)}
                className="w-full px-3 py-2 rounded-md border border-slate-300 dark:border-slate-700 dark:bg-slate-800 text-sm focus:outline-none focus:ring-1 focus:ring-slate-400"
              />
            </div>

            <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setReassignItem(null)}
                className="px-3.5 py-1.5 rounded-md text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleConfirmReassign}
                disabled={!reassignReason.trim()}
                className="px-4 py-1.5 bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-100 dark:text-slate-900 font-semibold rounded-md text-sm disabled:opacity-40 transition-colors"
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
