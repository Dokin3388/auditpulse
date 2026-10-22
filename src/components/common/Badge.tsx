import React from 'react';
import type { IssueSeverity, RescuedAttribution } from '../../types';

interface BadgeProps {
  children: React.ReactNode;
  className?: string;
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'purple' | 'neutral' | 'outline';
  size?: 'xs' | 'sm' | 'md';
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  className = '',
  variant = 'default',
  size = 'sm',
}) => {
  const sizeClasses = {
    xs: 'px-1.5 py-0.5 text-[10px]',
    sm: 'px-2 py-0.5 text-[11px]',
    md: 'px-2.5 py-1 text-xs',
  }[size];

  const variantClasses = {
    default:
      'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700',
    success:
      'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800',
    warning:
      'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200 dark:border-amber-800',
    danger:
      'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200 dark:border-rose-800',
    info:
      'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700',
    purple:
      'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700',
    neutral:
      'bg-slate-50 text-slate-600 dark:bg-slate-850 dark:text-slate-400 border border-slate-200 dark:border-slate-800',
    outline:
      'bg-transparent text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700',
  }[variant];

  return (
    <span
      className={`inline-flex items-center font-medium rounded whitespace-nowrap tracking-tight ${sizeClasses} ${variantClasses} ${className}`}
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
      <span className="inline-flex items-center gap-1">
        <Badge variant="danger" size="sm">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-500 mr-1 shrink-0"></span>
          QUÁ HẠN
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
        <Badge variant="neutral">
          <span className="w-1.5 h-1.5 rounded-full bg-slate-400 mr-1.5 shrink-0"></span>
          Đang mở (OPEN)
        </Badge>
      );
    case 'SALE_MARKED_DONE':
      return (
        <Badge variant="warning">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mr-1.5 shrink-0"></span>
          Sale đã làm (Chờ recheck)
        </Badge>
      );
    case 'IN_RECHECK':
      return (
        <Badge variant="info">
          <span className="w-1.5 h-1.5 rounded-full bg-slate-600 dark:bg-slate-400 mr-1.5 shrink-0"></span>
          Đang recheck
        </Badge>
      );
    case 'VERIFIED_CLOSED':
      return (
        <Badge variant="success">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5 shrink-0"></span>
          Đã đóng (Closed)
        </Badge>
      );
    case 'REOPENED':
      return (
        <Badge variant="danger">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-500 mr-1.5 shrink-0"></span>
          Đã mở lại (Reopened)
        </Badge>
      );
    case 'WAIVED':
      return <Badge variant="neutral">Miễn trừ (Waived)</Badge>;
    case 'CANCELLED':
      return <Badge variant="neutral">Đã hủy (Cancelled)</Badge>;
    default:
      return <Badge variant="default">{status}</Badge>;
  }
};

export const QueueStatusBadge: React.FC<{ status: string }> = ({ status }) => {
  switch (status) {
    case 'UNASSIGNED':
      return <Badge variant="neutral">Chưa gán Auditor</Badge>;
    case 'PENDING':
    case 'ASSIGNED':
      return <Badge variant="neutral">Chờ audit</Badge>;
    case 'IN_REVIEW':
      return (
        <Badge variant="warning">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mr-1.5 shrink-0"></span>
          Đang chấm
        </Badge>
      );
    case 'COMPLETED_PASS':
      return (
        <Badge variant="success">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5 shrink-0"></span>
          Đạt (Pass)
        </Badge>
      );
    case 'COMPLETED_FAIL':
      return (
        <Badge variant="danger">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-500 mr-1.5 shrink-0"></span>
          Không đạt (Fail)
        </Badge>
      );
    case 'SKIPPED':
      return <Badge variant="neutral">Bỏ qua</Badge>;
    case 'BLOCKED':
      return (
        <Badge variant="danger">
          Bị chặn
        </Badge>
      );
    default:
      return <Badge variant="default">{status}</Badge>;
  }
};

export const RiskTagBadge: React.FC<{ code: string; label: string }> = ({ code, label }) => {
  switch (code) {
    case 'YESTERDAY_CUSTOMERS':
      return (
        <Badge variant="info" size="xs">
          {label}
        </Badge>
      );
    case 'NO_QUOTATION':
      return (
        <Badge variant="warning" size="xs">
          {label}
        </Badge>
      );
    case 'QUOTED_NOT_ORDERED':
      return (
        <Badge variant="danger" size="xs">
          {label}
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
    <span className="inline-flex items-center gap-1">
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
        <Badge variant="danger" size="xs" className="bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-200 font-bold border-rose-300 dark:border-rose-700">
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
          Đơn cứu được (Audit-assisted)
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
