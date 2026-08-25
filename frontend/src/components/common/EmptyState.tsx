import React from 'react';
import { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionText?: string;
  onAction?: () => void;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon,
  title,
  description,
  actionText,
  onAction,
  className = '',
}) => {
  return (
    <div
      className={`glass-panel rounded-2xl p-12 text-center flex flex-col items-center justify-center space-y-3 ${className}`}
    >
      <div className="p-3 bg-slate-800/80 rounded-2xl border border-slate-700/60 text-slate-400">
        <Icon className="w-8 h-8" />
      </div>
      <h4 className="text-sm font-bold text-slate-200">{title}</h4>
      <p className="text-xs text-slate-400 max-w-sm">{description}</p>
      {actionText && onAction && (
        <button
          onClick={onAction}
          className="mt-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-lg shadow-blue-950/40 transition-colors cursor-pointer"
        >
          {actionText}
        </button>
      )}
    </div>
  );
};
