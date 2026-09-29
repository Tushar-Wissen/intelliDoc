import React from 'react';
import { AlertTriangle, FileClock, FileWarning, FolderOpen, Loader2, Plus } from 'lucide-react';

import { DOCUMENT_STATUS } from '@/hooks/use-document-processing-status';
import { cn } from '@/lib/utils';

// Same layout as the folder sidebar's "No folders yet" card: icon tile with a corner badge,
// bold navy title and a short subtitle, with room for extra content underneath.
export function CopilotEmptyState({ icon: Icon, badge, badgeClassName, title, description, children, testId }) {
  return (
    <div className="flex flex-1 items-center justify-center p-4" data-testid={testId}>
      <div className="flex w-full flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-muted/40 px-5 py-6 text-center animate-fade-in">
        <div className="relative">
          <div className="flex h-14 w-14 items-center justify-center rounded-[1.1rem] bg-wissen-navy/10 text-wissen-navy shadow-inner dark:text-wissen-navy-light">
            <Icon className="h-6 w-6" />
          </div>
          {badge && (
            <span
              className={cn(
                'absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-wissen-navy text-white shadow-sm',
                badgeClassName
              )}
            >
              {badge}
            </span>
          )}
        </div>

        <div className="space-y-1">
          <h3 className="text-[0.92rem] font-bold leading-none tracking-[-0.03em] text-wissen-navy dark:text-wissen-navy-light">
            {title}
          </h3>
          <p className="mx-auto max-w-[240px] text-[0.72rem] leading-[1.35] text-wissen-navy/75 dark:text-wissen-navy-light/90">
            {description}
          </p>
        </div>

        {children}
      </div>
    </div>
  );
}

export function NoDocumentsState() {
  return (
    <CopilotEmptyState
      testId="copilot-no-documents"
      icon={FolderOpen}
      badge={<Plus className="h-3 w-3" />}
      title="No documents yet"
      description="Create a folder and upload documents to start chatting with IntelliDoc AI."
    />
  );
}

// Processing stages in pipeline order, as reported by the document's processingStatus.
const PROCESSING_STEPS = [
  { status: DOCUMENT_STATUS.UPLOADED, label: 'Queued', message: 'Queued for processing' },
  { status: DOCUMENT_STATUS.PARSING, label: 'Reading', message: 'Reading the document content' },
  { status: DOCUMENT_STATUS.EXTRACTING, label: 'Extracting', message: 'Extracting key information' },
  { status: DOCUMENT_STATUS.INDEXING, label: 'Indexing', message: 'Indexing for AI search' },
];

function ProcessingSteps({ status }) {
  const current = PROCESSING_STEPS.findIndex((step) => step.status === status);
  const checking = current === -1;
  const message = checking ? 'Checking document status' : PROCESSING_STEPS[current].message;

  return (
    <div className="flex w-full flex-col gap-2.5 rounded-lg border border-border bg-card px-3 py-3 text-left">
      <div className="flex items-center gap-2 text-xs font-medium text-foreground" role="status" aria-live="polite">
        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-wissen-navy dark:text-wissen-navy-light" />
        <span className="truncate">{message}&hellip;</span>
        {!checking && (
          <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
            Step {current + 1} of {PROCESSING_STEPS.length}
          </span>
        )}
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {PROCESSING_STEPS.map((step, idx) => (
          <div key={step.status} className="flex flex-col gap-1">
            <span
              className={cn(
                'h-1 rounded-full',
                idx < current && 'bg-wissen-navy dark:bg-wissen-navy-light',
                idx === current && 'animate-pulse bg-wissen-navy/60 dark:bg-wissen-navy-light/70',
                (checking || idx > current) && 'bg-muted'
              )}
            />
            <span
              className={cn(
                'text-[10px]',
                idx <= current && !checking ? 'font-medium text-foreground' : 'text-muted-foreground'
              )}
            >
              {step.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Shown in place of the chat while the open document isn't ready for AI yet.
export function DocumentProcessingState({ status, documentName }) {
  if (status === DOCUMENT_STATUS.FAILED) {
    return (
      <CopilotEmptyState
        testId="copilot-document-failed"
        icon={FileWarning}
        badge={<AlertTriangle className="h-3 w-3" />}
        badgeClassName="bg-destructive"
        title="Document couldn't be processed"
        description={`Something went wrong while preparing ${documentName ? `"${documentName}"` : 'this document'}, so AI chat isn't available for it.`}
      />
    );
  }

  return (
    <CopilotEmptyState
      testId="copilot-document-processing"
      icon={FileClock}
      badge={<Loader2 className="h-3 w-3 animate-spin" />}
      title="Document is not ready yet"
      description={`${documentName ? `"${documentName}"` : 'This document'} is still being processed. You can start chatting once it's ready.`}
    >
      <ProcessingSteps status={status} />
      <p className="text-[11px] text-muted-foreground">
        Chat unlocks automatically when processing finishes.
      </p>
    </CopilotEmptyState>
  );
}
