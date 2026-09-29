import React, { useState } from 'react';
import { AlertTriangle, AlignLeft, File, FileText, RotateCw } from 'lucide-react';

import { cn } from '@/lib/utils';
import { formatBytes, formatDate } from '@/lib/format';
import { getFileTypeMeta } from '@/lib/file-types';
import { useDocumentDetail } from '@/hooks/use-document-detail';
import { useDocumentFile } from '@/hooks/use-document-file';
import { Button } from '@/components/ui/button';
import { DocumentPreview } from '@/components/features/document-preview';

const TABS = [
  { id: 'summary', label: 'Summary', Icon: AlignLeft },
  { id: 'document', label: 'Document', Icon: File },
];

// Confidence bar color: green when the classifier is sure, amber when it's a guess.
function confidenceColor(value) {
  if (value >= 0.8) return 'bg-success';
  if (value >= 0.5) return 'bg-amber-500';
  return 'bg-destructive';
}

function confidenceTextColor(value) {
  if (value >= 0.8) return 'text-success';
  if (value >= 0.5) return 'text-amber-600 dark:text-amber-400';
  return 'text-destructive';
}

function Skeleton({ className }) {
  return <div className={cn('animate-pulse rounded-md bg-muted', className)} />;
}

function TextBlock({ title, text, emptyText }) {
  return (
    <div className="rounded-xl border border-border bg-muted/40 p-5">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{title}</p>
      <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">
        {text || <span className="text-muted-foreground">{emptyText}</span>}
      </p>
    </div>
  );
}

function ViewTabs({ value, onChange }) {
  return (
    <div role="tablist" aria-label="Document view" className="inline-flex rounded-full border border-border bg-muted/50 p-1">
      {TABS.map(({ id, label, Icon }) => {
        const active = value === id;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            id={`document-tab-${id}`}
            data-testid={`document-tab-${id}`}
            aria-selected={active}
            aria-controls={`document-panel-${id}`}
            onClick={() => onChange(id)}
            className={cn(
              'flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              active
                ? 'bg-card text-wissen-navy shadow-sm dark:text-wissen-navy-light'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        );
      })}
    </div>
  );
}

// Classifier confidence from GET /documents/{id}.
function ConfidenceBlock({ detailState }) {
  const { status, document, error, retry } = detailState;

  if (status === 'loading' || status === 'idle') {
    return (
      <div className="w-full space-y-2 sm:w-44" aria-busy="true">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-1.5 w-full" />
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="flex items-center gap-2 text-xs text-destructive" title={error?.message}>
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
        <span>Details unavailable</span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 gap-1 px-2 text-xs"
          onClick={retry}
          data-testid="document-details-retry"
        >
          <RotateCw className="h-3 w-3" />
          Retry
        </Button>
      </div>
    );
  }

  const confidence = document.classificationConfidence;
  if (confidence == null) return null;
  const percent = Math.round(confidence * 100);

  return (
    <div
      className="w-full rounded-lg border border-border bg-muted/40 px-3.5 py-2.5 sm:w-44"
      data-testid="document-confidence"
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Confidence</span>
        <span className={cn('text-sm font-semibold tabular-nums', confidenceTextColor(confidence))}>{percent}%</span>
      </div>
      <div
        className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted"
        role="meter"
        aria-label="Classification confidence"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <div className={cn('h-full rounded-full', confidenceColor(confidence))} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

// The one place the document's metadata is shown: name, size, upload date, pages, and the
// classifier's confidence on the right.
function FileCard({ file, detailState }) {
  const typeMeta = getFileTypeMeta(file.name);
  const document = detailState.document;

  const meta = [
    file.size ? formatBytes(file.size) : null,
    `Uploaded ${formatDate(document?.createdAt ?? file.createdAt)}`,
    document?.pageCount ? `${document.pageCount} ${document.pageCount === 1 ? 'page' : 'pages'}` : null,
  ].filter(Boolean);

  return (
    <div
      data-testid="document-file-card"
      className="flex flex-col gap-4 rounded-xl border border-border bg-card px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg', typeMeta.className)}>
          <FileText className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-card-foreground">{file.name}</p>
          <p className="truncate text-xs text-muted-foreground">{meta.join(' · ')}</p>
        </div>
      </div>

      <div className="shrink-0">
        <ConfidenceBlock detailState={detailState} />
      </div>
    </div>
  );
}

// Single-document screen: the file card (metadata from GET /documents/{id}) and tabs for the
// AI summary and the original file (GET /documents/{id}/file). Both requests start as soon as
// the file is opened.
export function DocumentView({ file }) {
  const [tab, setTab] = useState('document');
  const detailState = useDocumentDetail(file.id);
  const fileState = useDocumentFile(file.id);

  const document = detailState.document;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5" data-testid="document-view">
      <FileCard file={file} detailState={detailState} />

      <div className="flex flex-col gap-5 rounded-xl border border-border bg-card p-5 sm:p-6">
        <ViewTabs value={tab} onChange={setTab} />

        {tab === 'summary' ? (
          <div
            role="tabpanel"
            id="document-panel-summary"
            aria-labelledby="document-tab-summary"
            className="flex flex-col gap-4"
          >
            {detailState.status === 'success' ? (
              <>
                <TextBlock
                  title="Overview"
                  text={document.overview}
                  emptyText="No overview yet. It appears once processing finishes."
                />
                <TextBlock
                  title="Summary"
                  text={document.summary}
                  emptyText="No summary yet. It appears once processing finishes."
                />
              </>
            ) : detailState.status === 'error' ? (
              <p className="rounded-xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
                The summary is unavailable until the document details load.
              </p>
            ) : (
              <>
                <Skeleton className="h-24 w-full rounded-xl" />
                <Skeleton className="h-32 w-full rounded-xl" />
              </>
            )}
          </div>
        ) : (
          <div role="tabpanel" id="document-panel-document" aria-labelledby="document-tab-document">
            <DocumentPreview key={file.id} file={file} fileState={fileState} />
          </div>
        )}
      </div>
    </div>
  );
}
