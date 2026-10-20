import React from 'react';
import type { IssueSeverity, RescuedAttribution } from '../../types';

interface BadgeProps {
  children: React.ReactNode;
  className?: string;
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'purple' | 'neutral';
  size?: 'xs' | 'sm' | 'md';
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  className = '',
  variant = 'default',
  size = 'sm',
}) => {
  const sizeClasses = {
    xs: 'px-1.5 py-0.5 text-[11px]',
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2.5 py-1 text-xs',
  }[size];

  const variantClasses = {
    default: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700',
    success: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800',
    warning: 'bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800',
    danger: 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-200 dark:border-rose-800',
    info: 'bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300 border border-sky-200 dark:border-sky-800',
    purple: 'bg-purple-50 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 border border-purple-200 dark:border-purple-800',
    neutral: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 border border-gray-200 dark:border-gray-700',
  }[variant];

  return (
    <span
      className={`inline-flex items-center font-medium rounded-md whitespace-nowrap transition-colors ${sizeClasses} ${variantClasses} ${className}`}
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
          <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"></span>
          QUÁ HẠN (OVERDUE)
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
        <Badge variant="info">
          <span className="w-1.5 h-1.5 rounded-full bg-sky-500 mr-1"></span>
          Đang mở (OPEN)
        </Badge>
      );
    case 'SALE_MARKED_DONE':
      return (
        <Badge variant="warning">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mr-1 animate-pulse"></span>
          Sale đã làm (Chờ recheck)
        </Badge>
      );
    case 'IN_RECHECK':
      return (
        <Badge variant="purple">
          <span className="w-1.5 h-1.5 rounded-full bg-purple-500 mr-1 animate-spin"></span>
          Đang Recheck
        </Badge>
      );
    case 'VERIFIED_CLOSED':
      return (
        <Badge variant="success">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1"></span>
          Đã xác nhận đóng
        </Badge>
      );
    case 'REOPENED':
      return (
        <Badge variant="danger">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-500 mr-1"></span>
          Đã mở lại (REOPENED)
        </Badge>
      );
    case 'WAIVED':
      return <Badge variant="neutral">Miễn trừ (WAIVED)</Badge>;
    case 'CANCELLED':
      return <Badge variant="neutral">Đã hủy (CANCELLED)</Badge>;
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
      return <Badge variant="info">Chờ audit</Badge>;
    case 'IN_REVIEW':
      return <Badge variant="warning">Đang chấm case</Badge>;
    case 'COMPLETED_PASS':
      return <Badge variant="success">Audit ĐẠT (Pass)</Badge>;
    case 'COMPLETED_FAIL':
      return <Badge variant="danger">Audit KHÔNG ĐẠT</Badge>;
    case 'SKIPPED':
      return <Badge variant="neutral">Bỏ qua (Skipped)</Badge>;
    case 'BLOCKED':
      return <Badge variant="danger">Bị chặn (Blocked)</Badge>;
    default:
      return <Badge variant="default">{status}</Badge>;
  }
};

export const RiskTagBadge: React.FC<{ code: string; label: string }> = ({ code, label }) => {
  switch (code) {
    case 'YESTERDAY_CUSTOMERS':
      return (
        <Badge variant="info" size="xs" className="font-semibold">
          ⚡ {label}
        </Badge>
      );
    case 'NO_QUOTATION':
      return (
        <Badge variant="warning" size="xs" className="font-semibold">
          ⏱️ {label}
        </Badge>
      );
    case 'QUOTED_NOT_ORDERED':
      return (
        <Badge variant="danger" size="xs" className="font-semibold">
          🎯 {label}
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
          Mức độ CAO
        </Badge>
      )}
      {severity === 'MEDIUM' && (
        <Badge variant="warning" size="xs">
          Mức độ TRUNG BÌNH
        </Badge>
      )}
      {severity === 'LOW' && (
        <Badge variant="info" size="xs">
          Mức độ THẤP
        </Badge>
      )}
      {hardFail && (
        <Badge variant="danger" size="xs" className="bg-rose-600 text-white border-0 font-bold">
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
          🛡️ Đơn cứu được (AUDIT_ASSISTED)
        </Badge>
      );
    case 'SALE_SELF_RESOLVED':
      return (
        <Badge variant="info" size="xs">
          🌱 Sale tự xử lý (SALE_SELF_RESOLVED)
        </Badge>
      );
    case 'UNATTRIBUTED':
    default:
      return (
        <Badge variant="neutral" size="xs">
          Chưa rõ nguồn (UNATTRIBUTED)
        </Badge>
      );
  }
};
