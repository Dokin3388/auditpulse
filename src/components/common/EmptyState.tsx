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
      icon: <Inbox className="w-10 h-10 text-slate-400" />,
      title: title || 'Chưa có dữ liệu',
      description: description || 'Hệ thống chưa ghi nhận bản ghi nào trong phân mục này.',
    },
    'no-results': {
      icon: <FilterX className="w-10 h-10 text-slate-400" />,
      title: title || 'Không tìm thấy kết quả phù hợp',
      description: description || 'Hãy thử điều chỉnh bộ lọc ngày, team, sale hoặc trạng thái.',
    },
    'source-delayed': {
      icon: <Clock className="w-10 h-10 text-amber-500" />,
      title: title || 'Dữ liệu nguồn đến muộn (Source Delayed)',
      description: description || 'Hệ thống đang chờ hoàn tất chu kỳ đồng bộ dữ liệu lúc 00:00. Dữ liệu sẽ được tính ở Queue Run tiếp theo.',
    },
    'permission-denied': {
      icon: <ShieldAlert className="w-10 h-10 text-rose-500" />,
      title: title || 'Truy cập bị hạn chế (Permission Denied)',
      description: description || 'Theo quy định AuditFlow v1.1, vai trò của bạn không được phép xem nội dung hội thoại hoặc bằng chứng nhạy cảm này.',
    },
    'save-failed': {
      icon: <AlertTriangle className="w-10 h-10 text-rose-500" />,
      title: title || 'Lưu thao tác thất bại',
      description: description || 'Đã xảy ra lỗi kiểm tra điều kiện nghiệp vụ hoặc kết nối. Vui lòng thử lại.',
    },
  }[type];

  return (
    <div
      className={`flex flex-col items-center justify-center p-8 text-center bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl my-4 ${className}`}
    >
      <div className="p-3.5 bg-slate-50 dark:bg-slate-800 rounded-full mb-3 border border-slate-100 dark:border-slate-700/50">
        {defaults.icon}
      </div>
      <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-1">{defaults.title}</h3>
      <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mb-4 leading-relaxed">
        {defaults.description}
      </p>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-950/60 border border-brand-200 dark:border-brand-800 rounded-lg hover:bg-brand-100 transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          {actionLabel}
        </button>
      )}
    </div>
  );
};
