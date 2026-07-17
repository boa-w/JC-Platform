import { FolderOpen, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

interface EmptyStateProps {
  children: ReactNode;
  icon?: LucideIcon;
}

export function EmptyState({ children, icon: Icon = FolderOpen }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <span className="empty-state-icon" aria-hidden="true">
        <Icon size={22} strokeWidth={1.7} />
      </span>
      <p>{children}</p>
    </div>
  );
}
