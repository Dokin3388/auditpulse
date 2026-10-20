import React from 'react';
import type { AuditTrailEvent } from '../../types';
import { Clock, CheckCircle2, AlertTriangle, ArrowRight, UserCheck } from 'lucide-react';
import { Badge } from './Badge';

interface TimelineTrailProps {
  events: AuditTrailEvent[];
  maxItems?: number;
}

export const TimelineTrail: React.FC<TimelineTrailProps> = ({ events, maxItems }) => {
  const displayEvents = maxItems ? events.slice(0, maxItems) : events;

  const getEventIcon = (actionType: string) => {
    switch (actionType) {
      case 'RECHECK_IMPROVED':
      case 'ACTION_VERIFIED_CLOSED':
        return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
      case 'RECHECK_NOT_IMPROVED':
      case 'ACTION_REOPENED':
        return <AlertTriangle className="w-4 h-4 text-rose-500" />;
      case 'AUDITOR_ASSIGNMENT_UPDATED':
        return <UserCheck className="w-4 h-4 text-brand-500" />;
      case 'ACTION_MARKED_DONE':
        return <ArrowRight className="w-4 h-4 text-amber-500" />;
      default:
        return <Clock className="w-4 h-4 text-slate-400" />;
    }
  };

  return (
    <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200 dark:before:bg-slate-800">
      {displayEvents.map((evt) => (
        <div key={evt.id} className="relative group">
          <div className="absolute -left-6 top-0.5 w-5 h-5 rounded-full bg-white dark:bg-slate-900 border-2 border-slate-300 dark:border-slate-700 flex items-center justify-center group-hover:border-brand-500 transition-colors">
            {getEventIcon(evt.actionType)}
          </div>
          <div className="bg-slate-50/70 dark:bg-slate-850/60 p-3 rounded-lg border border-slate-200/60 dark:border-slate-800 space-y-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                  {evt.actorName}
                </span>
                <Badge variant="neutral" size="xs">
                  {evt.actorRole}
                </Badge>
              </div>
              <span className="text-[11px] text-slate-400">
                {new Date(evt.timestamp).toLocaleString('vi-VN')}
              </span>
            </div>
            <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed font-medium">
              {evt.description}
            </p>
            {evt.details && (
              <p className="text-[11px] text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-900 px-2 py-1 rounded border border-slate-200 dark:border-slate-800">
                {evt.details}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};
