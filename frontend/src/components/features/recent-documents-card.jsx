import React from 'react';
import { Link } from 'react-router-dom';
import { FileText, ChevronRight } from 'lucide-react';

import { cn } from '@/lib/utils';
import { formatDate } from '@/lib/format';
import { colorForFolder } from '@/lib/folder-colors';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function RecentDocumentsCard({ loading, files, onOpenFile, viewAllHref }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-semibold">Recent Documents</CardTitle>
        {viewAllHref && (
          <Link
            to={viewAllHref}
            className="flex items-center gap-0.5 text-xs font-medium text-wissen-navy hover:underline dark:text-wissen-navy-light"
          >
            View all
            <ChevronRight className="h-3 w-3" />
          </Link>
        )}
      </CardHeader>
      <CardContent className="pt-0">
        {loading ? (
          <div className="flex flex-col gap-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-11 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        ) : files.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No documents yet</p>
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {files.map((file, idx) => {
              const color = colorForFolder({ id: file.folderId }, idx);
              return (
                <button
                  key={file.id}
                  type="button"
                  onClick={() => onOpenFile(file)}
                  className="flex items-center gap-3 py-2.5 text-left transition-colors hover:bg-accent/40 first:pt-0 last:pb-0"
                >
                  <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', color.bg)}>
                    <FileText className={cn('h-4 w-4', color.fg)} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-card-foreground">{file.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{file.folderName}</p>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">{formatDate(file.date)}</span>
                </button>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
