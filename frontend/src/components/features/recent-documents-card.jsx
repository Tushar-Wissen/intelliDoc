import React from 'react';
import { Link } from 'react-router-dom';
import { FileText, ChevronRight, Clock, UploadCloud } from 'lucide-react';

import { cn } from '@/lib/utils';
import { formatDate } from '@/lib/format';
import { colorForFolder } from '@/lib/folder-colors';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function RecentDocumentsCard({ loading, files, onOpenFile, onUploadClick, viewAllHref }) {
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
          <div
            data-testid="recent-documents-empty"
            className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-border bg-gradient-to-b from-wissen-navy/[0.03] to-transparent px-6 py-8 text-center"
          >
            <div className="relative">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-wissen-navy/10">
                <FileText className="h-6 w-6 text-wissen-navy dark:text-wissen-navy-light" />
              </div>
              <span className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-wissen-navy text-white shadow-sm">
                <Clock className="h-3 w-3" />
              </span>
            </div>

            <div className="space-y-1">
              <p className="text-sm font-semibold text-foreground">No documents yet</p>
              <p className="mx-auto max-w-xs text-xs leading-relaxed text-muted-foreground">
                Documents you upload or open will show up here for quick access.
              </p>
            </div>

            {onUploadClick && (
              <Button
                type="button"
                size="sm"
                onClick={onUploadClick}
                className="gap-2 bg-wissen-navy text-white hover:bg-wissen-navy/90"
              >
                <UploadCloud className="h-3.5 w-3.5" />
                Upload document
              </Button>
            )}
          </div>
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
