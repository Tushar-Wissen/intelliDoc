import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  AlignLeft,
  Calendar,
  Check,
  CheckCircle2,
  Copy,
  File,
  FileText,
  FileType,
  HardDrive,
  Hash,
  Info,
  RotateCw,
  Sparkles,
  User,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { formatDate, formatDateTime, formatMegabytes } from '@/lib/format';
import { getFileTypeMeta } from '@/lib/file-types';
import { isDocumentProcessing, useDocumentDetail } from '@/hooks/use-document-detail';
import { useDocumentFile } from '@/hooks/use-document-file';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DocumentPreview } from '@/components/features/document-preview';
import { ProcessingSteps } from '@/components/features/copilot-empty-state';

const TABS = [
  { id: 'summary', label: 'Summary', Icon: AlignLeft },
  { id: 'document', label: 'Document', Icon: File },
];

const FALLBACK = '—';

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

function toPercent(value) {
  return value == null || Number.isNaN(Number(value)) ? null : Math.round(Number(value) * 100);
}

// READY is done, FAILED is terminal, anything else is still somewhere in the pipeline.
function statusStyle(status) {
  if (status === 'READY') return { badge: 'bg-success/10 text-success', icon: 'text-success' };
  if (status === 'FAILED') return { badge: 'bg-destructive/10 text-destructive', icon: 'text-destructive' };
  return {
    badge: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    icon: 'text-amber-600 dark:text-amber-400',
  };
}

function Skeleton({ className }) {
  return <div className={cn('animate-pulse rounded-md bg-muted', className)} />;
}

function SectionTitle({ children }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{children}</p>
  );
}

function CopyButton({ text, label }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return undefined;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      // Clipboard can be blocked (insecure context, permissions); nothing useful to show.
    }
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="h-8 w-8 text-muted-foreground hover:text-foreground"
      onClick={handleCopy}
      disabled={!text}
      aria-label={copied ? 'Copied' : label}
      title={copied ? 'Copied' : label}
    >
      {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
    </Button>
  );
}

function SectionCard({ title, copyText, copyLabel, children, testId }) {
  return (
    <section className="rounded-xl border border-border bg-muted/40 p-5" data-testid={testId}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <SectionTitle>{title}</SectionTitle>
        {copyLabel ? <CopyButton text={copyText} label={copyLabel} /> : null}
      </div>
      {children}
    </section>
  );
}

function ViewTabs({ value, onChange }) {
  return (
    <div
      role="tablist"
      aria-label="Document view"
      className="flex gap-1 rounded-lg border border-border bg-muted/40 px-1.5 pt-1.5"
    >
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
              '-mb-px flex items-center gap-1.5 rounded-t-md border-b-2 px-3.5 py-1.5 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              active
                ? 'border-primary bg-card text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            <Icon className="h-3.5 w-3.5" />
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
      <div className="w-full space-y-2 sm:w-52" aria-busy="true">
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
  const percent = toPercent(confidence);
  if (percent == null) return null;

  return (
    <div
      className="w-full rounded-lg border border-border bg-muted/40 px-4 py-3 sm:w-52"
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

// Name, size, upload date/uploader, and the classifier's confidence on the right.
function FileCard({ file, detailState }) {
  const document = detailState.document;
  const name = document?.name || file.name;
  const typeMeta = getFileTypeMeta(name);

  const uploaded = `Uploaded ${formatDate(document?.createdAt ?? file.createdAt)}${
    document?.uploadedByName ? ` by ${document.uploadedByName}` : ''
  }`;
  const meta = [document?.fileSizeMb != null ? formatMegabytes(document.fileSizeMb) : null, uploaded].filter(Boolean);

  return (
    <div
      data-testid="document-file-card"
      className="flex flex-col gap-3 rounded-lg border border-border bg-card px-3.5 py-2.5 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-md', typeMeta.className)}>
          <FileText className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-card-foreground" title={name}>
            {name}
          </p>
          <p className="truncate text-xs text-muted-foreground">{meta.join(' · ')}</p>
        </div>
      </div>

      <div className="shrink-0">
        <ConfidenceBlock detailState={detailState} />
      </div>
    </div>
  );
}

function OverviewSection({ items }) {
  return (
    <SectionCard
      title="Overview"
      copyText={items.join(', ')}
      copyLabel="Copy overview"
      testId="document-overview"
    >
      {items.length ? (
        <ul className="flex flex-wrap gap-2.5">
          {items.map((item, idx) => (
            <li key={`${item}-${idx}`}>
              <Badge className="rounded-full border-transparent bg-wissen-navy px-5 py-2 text-sm font-medium text-white hover:bg-wissen-navy dark:bg-wissen-navy-light">
                {item}
              </Badge>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No overview yet. It appears once processing finishes.</p>
      )}
    </SectionCard>
  );
}

function SummarySection({ text }) {
  return (
    <SectionCard title="Summary" copyText={text} copyLabel="Copy summary" testId="document-summary">
      <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">
        {text || <span className="text-muted-foreground">No summary yet. It appears once processing finishes.</span>}
      </p>
    </SectionCard>
  );
}

// Document sheet with a scan beam sweeping over it, shown while the pipeline works.
function ScanningIllustration() {
  return (
    <div className="relative h-28 w-24" aria-hidden="true">
      <div className="absolute inset-0 overflow-hidden rounded-xl border border-wissen-navy/15 bg-card shadow-md">
        <div className="flex flex-col gap-2 p-3.5">
          <FileText className="mb-1 h-5 w-5 text-wissen-navy dark:text-wissen-navy-light" />
          <span className="h-1.5 w-full rounded-full bg-wissen-navy/15" />
          <span className="h-1.5 w-4/5 rounded-full bg-wissen-navy/10" />
          <span className="h-1.5 w-full rounded-full bg-wissen-navy/10" />
          <span className="h-1.5 w-3/5 rounded-full bg-wissen-navy/10" />
          <span className="h-1.5 w-4/5 rounded-full bg-wissen-navy/10" />
        </div>
        <div className="absolute inset-x-0 top-0 animate-scan motion-reduce:hidden">
          <div className="h-8 bg-gradient-to-b from-transparent to-indigo-500/15" />
          <div className="h-0.5 bg-indigo-500 shadow-[0_0_10px_2px_rgba(99,102,241,0.55)]" />
        </div>
      </div>
      <span className="absolute -right-3 -top-3 flex h-8 w-8 items-center justify-center rounded-full bg-wissen-navy text-white shadow-sm ring-4 ring-card">
        <Sparkles className="h-4 w-4 animate-pulse motion-reduce:animate-none" />
      </span>
    </div>
  );
}

// Replaces the empty overview and summary while the document is still in the pipeline.
function ProcessingPanel({ status }) {
  return (
    <section
      data-testid="document-processing"
      className="flex flex-col items-center gap-5 rounded-xl border border-dashed border-wissen-navy/20 bg-gradient-to-b from-wissen-navy/[0.04] to-transparent px-6 py-10 text-center"
    >
      <ScanningIllustration />
      <div className="max-w-md space-y-1.5">
        <h3 className="font-display text-lg font-semibold tracking-tight text-foreground">
          Documents are being processed
        </h3>
        <p className="text-sm leading-relaxed text-muted-foreground">
          We&rsquo;re analyzing and indexing your documents. They will appear here once processing is complete.
        </p>
      </div>
      <div className="w-full max-w-sm">
        <ProcessingSteps status={String(status).toUpperCase()} />
      </div>
      <p className="text-xs text-muted-foreground">This page updates automatically &mdash; no need to refresh.</p>
    </section>
  );
}

function DetailItem({ Icon, iconClassName, label, children }) {
  return (
    <div className="flex items-start gap-2">
      <Icon className={cn('mt-0.5 h-4 w-4 shrink-0 text-wissen-navy dark:text-wissen-navy-light', iconClassName)} />
      <div className="min-w-0">
        <p className="text-[11px] leading-tight text-muted-foreground">{label}</p>
        <div className="mt-0.5 break-words text-[13px] font-medium leading-snug text-foreground">{children}</div>
      </div>
    </div>
  );
}

function DetailsSection({ document }) {
  const status = document.status;
  const style = statusStyle(status);
  const percent = toPercent(document.classificationConfidence);
  const extension = document.extension ? document.extension.toUpperCase() : null;

  // Listed row by row so the three-column grid reads like the reference layout.
  const items = [
    { label: 'Document Type', Icon: FileText, value: document.documentType, className: 'capitalize' },
    { label: 'Page Count', Icon: Hash, value: document.pageCount },
    {
      label: 'Processing Status',
      Icon: CheckCircle2,
      iconClassName: style.icon,
      value: status ? (
        <Badge className={cn('mt-0.5 rounded-md border-transparent px-2 py-px text-[10px] font-bold uppercase', style.badge)}>
          {status}
        </Badge>
      ) : null,
    },
    { label: 'File Type', Icon: FileType, value: document.fileType },
    { label: 'Uploaded By', Icon: User, value: document.uploadedByName },
    {
      label: 'Classification Confidence',
      Icon: Info,
      value: percent != null ? <span className="font-semibold text-primary">{percent}%</span> : null,
    },
    { label: 'File Size', Icon: HardDrive, value: document.fileSizeMb != null ? formatMegabytes(document.fileSizeMb) : null },
    { label: 'Uploaded On', Icon: Calendar, value: document.createdAt ? formatDateTime(document.createdAt) : null },
    { label: 'Extension', Icon: File, value: extension },
  ];

  return (
    <section className="rounded-xl border border-border bg-muted/40 p-4" data-testid="document-details">
      <div className="mb-3">
        <SectionTitle>Document Details</SectionTitle>
      </div>
      <div className="grid gap-x-4 gap-y-3.5 sm:grid-cols-2 lg:grid-cols-3">
        {items.map(({ label, Icon, iconClassName, value, className }) => (
          <DetailItem key={label} Icon={Icon} iconClassName={iconClassName} label={label}>
            {value == null || value === '' ? (
              <span className="text-muted-foreground">{FALLBACK}</span>
            ) : (
              <span className={className}>{value}</span>
            )}
          </DetailItem>
        ))}
      </div>
    </section>
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

      <ViewTabs value={tab} onChange={setTab} />

      {tab === 'summary' ? (
        <div
          role="tabpanel"
          id="document-panel-summary"
          aria-labelledby="document-tab-summary"
          className="flex flex-col gap-5"
        >
          {detailState.status === 'success' ? (
            isDocumentProcessing(document.status) ? (
              <ProcessingPanel status={document.status} />
            ) : (
              <>
                <OverviewSection items={document.overview ?? []} />
                <SummarySection text={document.summary} />
                <DetailsSection document={document} />
              </>
            )
          ) : detailState.status === 'error' ? (
            <p className="rounded-xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
              The summary is unavailable until the document details load.
            </p>
          ) : (
            <>
              <Skeleton className="h-24 w-full rounded-xl" />
              <Skeleton className="h-28 w-full rounded-xl" />
              <Skeleton className="h-44 w-full rounded-xl" />
            </>
          )}
        </div>
      ) : (
        <div
          role="tabpanel"
          id="document-panel-document"
          aria-labelledby="document-tab-document"
          className="rounded-xl border border-border bg-card p-5 sm:p-6"
        >
          <DocumentPreview key={file.id} file={file} fileState={fileState} />
        </div>
      )}
    </div>
  );
}
