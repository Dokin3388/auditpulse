import React from 'react';
import {
  Inbox,
  FilterX,
  Clock,
  ShieldAlert,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react';

interface EmptyStateProps {
  type?: 'empty' | 'no-results' | 'source-delayed' | 'permission-denied' | 'save-failed';
  title?: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  type = 'empty',
  title,
  description,
  actionLabel,
  onAction,
  className = '',
}) => {
  const defaults = {
    empty: {
      icon: <Inbox className="w-8 h-8 text-slate-400 stroke-1" />,
      title: title || 'Chưa có dữ liệu',
      description: description || 'Hệ thống chưa ghi nhận bản ghi nào trong phân mục này.',
    },
    'no-results': {
      icon: <FilterX className="w-8 h-8 text-slate-400 stroke-1" />,
      title: title || 'Không tìm thấy kết quả phù hợp',
      description: description || 'Hãy thử điều chỉnh bộ lọc ngày, team, sale hoặc trạng thái.',
    },
    'source-delayed': {
      icon: <Clock className="w-8 h-8 text-amber-500 stroke-1" />,
      title: title || 'Dữ liệu nguồn đến muộn (Source Delayed)',
      description: description || 'Hệ thống đang chờ hoàn tất chu kỳ đồng bộ dữ liệu lúc 00:00. Dữ liệu sẽ được tính ở Queue Run tiếp theo.',
    },
    'permission-denied': {
      icon: <ShieldAlert className="w-8 h-8 text-rose-500 stroke-1" />,
      title: title || 'Truy cập bị hạn chế (Permission Denied)',
      description: description || 'Theo quy định AuditFlow v1.1, vai trò của bạn không được phép xem nội dung hội thoại hoặc bằng chứng nhạy cảm này.',
    },
    'save-failed': {
      icon: <AlertTriangle className="w-8 h-8 text-rose-500 stroke-1" />,
      title: title || 'Thao tác không thành công',
      description: description || 'Đã có lỗi xảy ra trong quá trình lưu dữ liệu. Vui lòng kiểm tra lại kết nối.',
    },
  }[type];

  return (
    <div
      className={`flex flex-col items-center justify-center p-8 text-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg my-3 ${className}`}
    >
      <div className="p-2.5 bg-slate-50 dark:bg-slate-800/60 rounded-full mb-2.5 border border-slate-200/80 dark:border-slate-700/60">
        {defaults.icon}
      </div>
      <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1">{defaults.title}</h3>
      <p className="text-[11px] text-slate-500 dark:text-slate-400 max-w-sm mb-3.5 leading-relaxed">
        {defaults.description}
      </p>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/50 border border-slate-300 dark:border-slate-700 rounded-md transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          {actionLabel}
        </button>
      )}
    </div>
  );
};
