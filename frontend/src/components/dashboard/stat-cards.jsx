import React from 'react';
import { FileText, Folder, Upload } from 'lucide-react';
import { cn } from '@/lib/utils';

function StatCard({ icon: Icon, label, value, iconBg, iconFg }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm flex flex-col justify-between">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', iconBg)}>
          <Icon className={cn('h-4 w-4', iconFg)} />
        </span>
      </div>
      <div>
        <p className="font-display text-4xl font-bold tracking-tight text-card-foreground">{value}</p>
      </div>
    </div>
  );
}

export function DashboardStatCards({ totalDocuments, totalFolders, recentDocuments }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      <StatCard
        icon={FileText}
        label="Total documents"
        value={totalDocuments || 0}
        iconBg="bg-wissen-navy/10"
        iconFg="text-wissen-navy dark:text-wissen-navy-light"
      />
      <StatCard
        icon={Upload}
        label="Added this week"
        value={recentDocuments || 0}
        iconBg="bg-wissen-navy/10"
        iconFg="text-wissen-navy dark:text-wissen-navy-light"
      />
      <StatCard
        icon={Folder}
        label="Folders"
        value={totalFolders || 0}
        iconBg="bg-gray-100 dark:bg-gray-800"
        iconFg="text-gray-600 dark:text-gray-400"
      />
    </div>
  );
}
