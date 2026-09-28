import React, { useState } from 'react';
import { AlertTriangle, Download, ExternalLink, FileText, Loader2, Minus, Plus, RotateCw } from 'lucide-react';

import { cn } from '@/lib/utils';
import { getFileExtension } from '@/lib/file-types';
import { Button } from '@/components/ui/button';

const ZOOM_STEPS = [25, 50, 75, 100, 125, 150, 200];
// Starts zoomed out so a whole page fits the viewer width on most screens.
const DEFAULT_ZOOM = 50;

// Browsers render PDFs natively; other formats (e.g. DOCX) are offered as a download.
const isPdf = (contentType, fileName) => contentType === 'application/pdf' || getFileExtension(fileName) === 'PDF';

function PreviewMessage({ icon: Icon, iconClassName, title, description, children }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-card shadow-sm">
        <Icon className={cn('h-5 w-5', iconClassName)} />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        {description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </div>
  );
}

// The "Document" tab: a toolbar plus the file loaded from GET /documents/{id}/file.
// `fileState` comes from useDocumentFile so the request starts as soon as the file is opened.
export function DocumentPreview({ file, fileState }) {
  const { status, url, contentType, error, retry } = fileState;
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);

  const ready = status === 'success';
  const pdf = ready && isPdf(contentType, file.name);
  const zoomIndex = ZOOM_STEPS.indexOf(zoom);

  return (
    <div
      data-testid="document-preview"
      className="flex h-[70vh] min-h-[460px] flex-col overflow-hidden rounded-xl border border-border bg-card"
    >
      {/* Zoom on the left (PDF only), file actions on the right; one row at every width. */}
      <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-border bg-muted/40 px-2 sm:px-3">
        <div className="flex items-center gap-0.5">
          {pdf && (
            <>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                aria-label="Zoom out"
                disabled={zoomIndex <= 0}
                onClick={() => setZoom(ZOOM_STEPS[zoomIndex - 1])}
              >
                <Minus className="h-4 w-4" />
              </Button>
              <span className="w-12 text-center text-sm font-medium tabular-nums text-foreground" aria-live="polite">
                {zoom}%
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                aria-label="Zoom in"
                disabled={zoomIndex >= ZOOM_STEPS.length - 1}
                onClick={() => setZoom(ZOOM_STEPS[zoomIndex + 1])}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>

        <div className="flex items-center gap-1">
          <Button asChild={ready} variant="ghost" size="sm" className="h-8 gap-1.5 px-2" disabled={!ready}>
            {ready ? (
              <a href={url} target="_blank" rel="noreferrer" data-testid="document-preview-open">
                <ExternalLink className="h-4 w-4" />
                <span className="hidden sm:inline">Open</span>
              </a>
            ) : (
              <span>
                <ExternalLink className="h-4 w-4" />
                <span className="hidden sm:inline">Open</span>
              </span>
            )}
          </Button>
          <Button asChild={ready} variant="ghost" size="sm" className="h-8 gap-1.5 px-2" disabled={!ready}>
            {ready ? (
              <a href={url} download={file.name} data-testid="document-preview-download">
                <Download className="h-4 w-4" />
                <span className="hidden sm:inline">Download</span>
              </a>
            ) : (
              <span>
                <Download className="h-4 w-4" />
                <span className="hidden sm:inline">Download</span>
              </span>
            )}
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col bg-muted/60 p-2 sm:p-4">
        {status === 'loading' || status === 'idle' ? (
          <PreviewMessage
            icon={Loader2}
            iconClassName="animate-spin text-wissen-navy dark:text-wissen-navy-light"
            title="Loading document..."
          />
        ) : status === 'error' ? (
          <PreviewMessage
            icon={AlertTriangle}
            iconClassName="text-destructive"
            title="Could not load this document"
            description={error?.message || 'Something went wrong. Please try again.'}
          >
            <Button type="button" variant="outline" className="gap-2" onClick={retry} data-testid="document-preview-retry">
              <RotateCw className="h-4 w-4" />
              Try again
            </Button>
          </PreviewMessage>
        ) : status === 'empty' ? (
          <PreviewMessage
            icon={FileText}
            iconClassName="text-muted-foreground"
            title="This file is empty"
            description="The uploaded file has no content to show."
          />
        ) : pdf ? (
          // Framed inside the padded area so the page sits centered with even spacing. The key
          // reloads the embedded viewer at the new zoom; its own toolbar is hidden in favour of
          // the one above.
          <div className="flex min-h-0 flex-1 overflow-hidden rounded-lg border border-border bg-card shadow-sm">
            <iframe
              key={zoom}
              src={`${url}#toolbar=0&navpanes=0&zoom=${zoom}`}
              title={file.name}
              className="block h-full w-full flex-1 border-0"
            />
          </div>
        ) : (
          <PreviewMessage
            icon={FileText}
            iconClassName="text-muted-foreground"
            title="Preview not available"
            description={`${getFileExtension(file.name) || 'This'} files can't be previewed in the browser. Download the file to open it.`}
          >
            <Button asChild className="gap-2 bg-wissen-navy text-white hover:bg-wissen-navy/90">
              <a href={url} download={file.name}>
                <Download className="h-4 w-4" />
                Download
              </a>
            </Button>
          </PreviewMessage>
        )}
      </div>
    </div>
  );
}
