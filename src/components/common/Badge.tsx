import React from 'react';
import type { IssueSeverity, RescuedAttribution } from '../../types';

interface BadgeProps {
  children: React.ReactNode;
  className?: string;
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'purple' | 'neutral' | 'outline' | 'blue';
  size?: 'xs' | 'sm' | 'md';
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  className = '',
  variant = 'default',
  size = 'sm',
}) => {
  const sizeClasses = {
    xs: 'px-2 py-0.5 text-xs',
    sm: 'px-2.5 py-0.5 text-xs font-medium',
    md: 'px-3 py-1 text-sm font-medium',
  }[size];

  const variantClasses = {
    default:
      'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700',
    success:
      'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800',
    warning:
      'bg-amber-50 text-amber-900 dark:bg-amber-950/50 dark:text-amber-300 border border-amber-300 dark:border-amber-800',
    danger:
      'bg-rose-50 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300 border border-rose-300 dark:border-rose-800',
    info:
      'bg-blue-50 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300 border border-blue-200 dark:border-blue-800',
    blue:
      'bg-blue-50 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300 border border-blue-200 dark:border-blue-800',
    purple:
      'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700',
    neutral:
      'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-300 dark:border-slate-700',
    outline:
      'bg-transparent text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700',
  }[variant];

  return (
    <span
      className={`inline-flex items-center rounded whitespace-nowrap tracking-tight ${sizeClasses} ${variantClasses} ${className}`}
    >
      {children}
    </span>
  );
};

export const ActionStatusBadge: React.FC<{ status: string; isOverdue?: boolean }> = ({
  status,
  isOverdue,
}) => {
  if (isOverdue && status !== 'VERIFIED_CLOSED' && status !== 'CANCELLED' && status !== 'WAIVED') {
    return (
      <span className="inline-flex items-center gap-1.5">
        <Badge variant="danger" size="sm">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-600 mr-1 shrink-0"></span>
          Quá hạn
        </Badge>
        <Badge variant="neutral" size="xs">
          {status}
        </Badge>
      </span>
    );
  }

  switch (status) {
    case 'OPEN':
      return (
        <Badge variant="neutral" size="sm">
          <span className="w-1.5 h-1.5 rounded-full bg-slate-500 mr-1.5 shrink-0"></span>
          Đang mở
        </Badge>
      );
    case 'SALE_MARKED_DONE':
      return (
        <Badge variant="warning" size="sm">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mr-1.5 shrink-0"></span>
          Chờ kiểm tra
        </Badge>
      );
    case 'IN_RECHECK':
      return (
        <Badge variant="warning" size="sm">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mr-1.5 shrink-0"></span>
          Đang kiểm tra
        </Badge>
      );
    case 'VERIFIED_CLOSED':
      return (
        <Badge variant="success" size="sm">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 mr-1.5 shrink-0"></span>
          Đã đóng
        </Badge>
      );
    case 'REOPENED':
      return (
        <Badge variant="danger" size="sm">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-600 mr-1.5 shrink-0"></span>
          Chưa đạt (Mở lại)
        </Badge>
      );
    case 'WAIVED':
      return <Badge variant="neutral" size="sm">Miễn trừ</Badge>;
    case 'CANCELLED':
      return <Badge variant="neutral" size="sm">Đã hủy</Badge>;
    default:
      return <Badge variant="default" size="sm">{status}</Badge>;
  }
};

export const QueueStatusBadge: React.FC<{ status: string }> = ({ status }) => {
  switch (status) {
    case 'UNASSIGNED':
      return <Badge variant="neutral" size="sm">Chưa phân công</Badge>;
    case 'PENDING':
      return <Badge variant="neutral" size="sm">Chưa phân công</Badge>;
    case 'ASSIGNED':
      return (
        <Badge variant="info" size="sm">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-600 mr-1.5 shrink-0"></span>
          Đã phân công
        </Badge>
      );
    case 'IN_REVIEW':
      return (
        <Badge variant="warning" size="sm">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-600 mr-1.5 shrink-0"></span>
          Đang kiểm tra
        </Badge>
      );
    case 'COMPLETED_PASS':
      return (
        <Badge variant="success" size="sm">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 mr-1.5 shrink-0"></span>
          Đã đóng (Đạt)
        </Badge>
      );
    case 'COMPLETED_FAIL':
      return (
        <Badge variant="danger" size="sm">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-600 mr-1.5 shrink-0"></span>
          Chưa đạt
        </Badge>
      );
    case 'SKIPPED':
      return <Badge variant="neutral" size="sm">Bỏ qua</Badge>;
    case 'BLOCKED':
      return (
        <Badge variant="danger" size="sm">
          Bị chặn
        </Badge>
      );
    default:
      return <Badge variant="default" size="sm">{status}</Badge>;
  }
};

export const RiskTagBadge: React.FC<{ code: string; label: string }> = ({ code, label }) => {
  switch (code) {
    case 'YESTERDAY_CUSTOMERS':
      return (
        <Badge variant="info" size="xs">
          Khách hôm qua
        </Badge>
      );
    case 'NO_QUOTATION':
      return (
        <Badge variant="warning" size="xs">
          Chưa báo giá 2d
        </Badge>
      );
    case 'QUOTED_NOT_ORDERED':
      return (
        <Badge variant="danger" size="xs">
          Chưa chốt 7d
        </Badge>
      );
    default:
      return <Badge variant="default" size="xs">{label}</Badge>;
  }
};

export const SeverityBadge: React.FC<{ severity: IssueSeverity; hardFail?: boolean }> = ({
  severity,
  hardFail,
}) => {
  return (
    <span className="inline-flex items-center gap-1.5">
      {severity === 'HIGH' && (
        <Badge variant="danger" size="xs">
          Cao
        </Badge>
      )}
      {severity === 'MEDIUM' && (
        <Badge variant="warning" size="xs">
          Trung bình
        </Badge>
      )}
      {severity === 'LOW' && (
        <Badge variant="neutral" size="xs">
          Thấp
        </Badge>
      )}
      {hardFail && (
        <Badge variant="danger" size="xs" className="font-semibold">
          HARD-FAIL
        </Badge>
      )}
    </span>
  );
};

export const AttributionBadge: React.FC<{ status: RescuedAttribution }> = ({ status }) => {
  switch (status) {
    case 'AUDIT_ASSISTED':
      return (
        <Badge variant="success" size="xs" className="font-semibold">
          Đơn cứu được
        </Badge>
      );
    case 'SALE_SELF_RESOLVED':
      return (
        <Badge variant="neutral" size="xs">
          Sale tự xử lý
        </Badge>
      );
    case 'UNATTRIBUTED':
    default:
      return (
        <Badge variant="neutral" size="xs">
          Chưa rõ nguồn
        </Badge>
      );
  }
};
