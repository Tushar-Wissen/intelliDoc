import React, { useEffect, useState } from 'react';
import { UploadCloud, FileText, Loader2, X, Info } from 'lucide-react';

import { cn } from '@/lib/utils';
import { formatBytes } from '@/lib/format';
import { getFileExtension } from '@/lib/file-types';
import { documentsApi, SUPPORTED_UPLOAD_EXTENSIONS } from '@/lib/documents-api';
import { useWorkspace } from '@/context/workspace-context';
import { useFolders } from '@/context/folder-context';
import { useToast } from '@/context/toast-context';
import { FolderSelect } from '@/components/features/folder-select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const ACCEPT = SUPPORTED_UPLOAD_EXTENSIONS.map((ext) => `.${ext.toLowerCase()}`).join(',');
const FORMATS_LABEL = SUPPORTED_UPLOAD_EXTENSIONS.join(' or ');

const titleFromFileName = (fileName) => fileName.replace(/\.[^/.]+$/, '');
const isSameFile = (a, b) => a.name === b.name && a.size === b.size && a.lastModified === b.lastModified;

export function UploadDialog({ open, onOpenChange, onUploaded }) {
  const { selectedWorkspaceId, workspaceName } = useWorkspace();
  const { folders, loading: foldersLoading, error: foldersError } = useFolders();
  const toast = useToast();

  const [files, setFiles] = useState([]);
  // Held in UI state only for now: the upload API has no folder/module field yet, so every
  // upload becomes a workspace-level (orphaned) document. Once it does, send this id with
  // the request in documentsApi.upload and nothing else here needs to change.
  const [selectedFolderId, setSelectedFolderId] = useState(null);
  const [title, setTitle] = useState('');
  // Once the user edits the title themselves, picking another file no longer overwrites it.
  const [titleEdited, setTitleEdited] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [fieldErrors, setFieldErrors] = useState({ title: '', files: '' });
  const [rejections, setRejections] = useState([]);
  const [error, setError] = useState('');

  const workspaceMissing = !selectedWorkspaceId;
  // A title only applies when exactly one file is uploaded; several files keep their own names.
  const singleFile = files.length === 1;

  // Start with a clean form each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    setFiles([]);
    setSelectedFolderId(null);
    setTitle('');
    setTitleEdited(false);
    setIsDragging(false);
    setProgress(0);
    setFieldErrors({ title: '', files: '' });
    setRejections([]);
    setError('');
  }, [open]);

  // Forget a folder selection that no longer exists (e.g. after switching workspace).
  useEffect(() => {
    if (selectedFolderId && !folders.some((f) => f.id === selectedFolderId)) setSelectedFolderId(null);
  }, [folders, selectedFolderId]);

  // Keep the suggested title in step with the selection while the user hasn't typed their own.
  useEffect(() => {
    if (titleEdited) return;
    setTitle(files.length === 1 ? titleFromFileName(files[0].name) : '');
  }, [files, titleEdited]);

  const handleOpenChange = (next) => {
    // Don't let the dialog be dismissed mid-upload; the outcome would otherwise go unseen.
    if (submitting) return;
    onOpenChange(next);
  };

  // Adds picked/dropped files to the selection, skipping unsupported types and duplicates.
  const addFiles = (candidates) => {
    if (!candidates.length) return;
    setRejections([]);
    setError('');

    const supported = [];
    const unsupported = [];
    candidates.forEach((candidate) => {
      if (SUPPORTED_UPLOAD_EXTENSIONS.includes(getFileExtension(candidate.name))) supported.push(candidate);
      else unsupported.push(candidate.name);
    });

    setFiles((prev) => [...prev, ...supported.filter((f) => !prev.some((p) => isSameFile(p, f)))]);
    setFieldErrors((prev) => ({
      ...prev,
      files: unsupported.length
        ? `Unsupported file type: ${unsupported.join(', ')}. Only ${FORMATS_LABEL} files are accepted.`
        : '',
    }));
  };

  const removeFile = (index) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setFieldErrors((prev) => ({ ...prev, files: '' }));
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (!submitting && !workspaceMissing) addFiles(Array.from(e.dataTransfer.files ?? []));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting || workspaceMissing) return;

    const cleanedTitle = title.trim();
    const nextErrors = {
      title: singleFile && !cleanedTitle ? 'Document title is required.' : '',
      files: files.length ? '' : 'Please select at least one file to upload.',
    };
    if (nextErrors.title || nextErrors.files) {
      setFieldErrors(nextErrors);
      return;
    }

    setSubmitting(true);
    setProgress(0);
    setRejections([]);
    setError('');

    try {
      const result = await documentsApi.upload(
        selectedWorkspaceId,
        { files, title: singleFile ? cleanedTitle : undefined },
        { onProgress: setProgress }
      );
      const uploadedCount = result.documents.length;

      if (uploadedCount === 0) {
        // Nothing was accepted: keep the dialog open and explain why.
        const reasons = result.rejections.map((r) => r.message).filter(Boolean);
        setRejections(result.rejections);
        toast.error('Upload failed', reasons[0] || 'No files were accepted. Please try again.');
        setSubmitting(false);
        return;
      }

      onUploaded?.(result.documents);
      setSubmitting(false);
      onOpenChange(false);

      if (result.rejections.length > 0) {
        // Partial success: the accepted documents are saved, the rest are explained.
        const reasons = result.rejections.map((r) => r.message).filter(Boolean).join(' ');
        toast.warning(
          'Uploaded with issues',
          `${uploadedCount} of ${files.length} files uploaded to Orphaned Files. ${reasons}`
        );
      } else if (uploadedCount === 1) {
        toast.success('Upload complete', `"${result.documents[0].name}" was added to Orphaned Files.`);
      } else {
        toast.success('Upload complete', `${uploadedCount} files were added to Orphaned Files.`);
      }
    } catch (err) {
      setError(err?.message || 'Something went wrong. Please try again.');
      toast.error('Upload failed', err?.message || 'Something went wrong. Please try again.');
      setSubmitting(false);
    }
  };

  const locked = submitting || workspaceMissing;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload documents</DialogTitle>
          <DialogDescription>
            Add documents to analyze with AI-powered summarization and Q&amp;A.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {workspaceMissing && (
            <p className="text-sm text-destructive" data-testid="document-workspace-error">
              Select or create a workspace before uploading documents.
            </p>
          )}

          <FolderSelect
            id="document-folder-select"
            folders={folders}
            value={selectedFolderId}
            onChange={setSelectedFolderId}
            loading={foldersLoading}
            error={foldersError}
            disabled={locked}
            noneLabel="No folder (Orphaned Files)"
          />

          {singleFile && (
            <div className="space-y-1.5">
              <Label htmlFor="document-title-input">
                Document title <span className="text-destructive">*</span>
              </Label>
              <Input
                id="document-title-input"
                data-testid="document-title-input"
                placeholder="e.g. Q3 Financial Performance Report"
                value={title}
                disabled={locked}
                onChange={(e) => {
                  setTitle(e.target.value);
                  setTitleEdited(true);
                  if (fieldErrors.title) setFieldErrors((prev) => ({ ...prev, title: '' }));
                }}
              />
              {fieldErrors.title && <p className="text-xs text-destructive">{fieldErrors.title}</p>}
            </div>
          )}

          <div className="space-y-1.5">
            <label
              htmlFor="document-files-input"
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              className={cn(
                'flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-9 text-center transition-colors',
                locked && 'pointer-events-none opacity-60',
                isDragging ? 'border-primary bg-accent' : 'border-border hover:border-primary/50 hover:bg-accent/50'
              )}
            >
              <input
                id="document-files-input"
                data-testid="document-files-input"
                type="file"
                multiple
                accept={ACCEPT}
                className="hidden"
                disabled={locked}
                onChange={(e) => {
                  addFiles(Array.from(e.target.files ?? []));
                  e.target.value = ''; // allow re-selecting the same files after an error
                }}
              />
              <UploadCloud className="h-9 w-9 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">
                  <span className="font-semibold text-primary">Click to browse files</span> or drag and drop
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{FORMATS_LABEL} only &mdash; select as many as you need</p>
              </div>
            </label>
            {fieldErrors.files && <p className="text-xs text-destructive">{fieldErrors.files}</p>}
          </div>

          {files.length > 0 && (
            <ul data-testid="document-files-list" className="max-h-40 space-y-1.5 overflow-y-auto">
              {files.map((file, index) => (
                <li key={`${file.name}-${file.size}-${file.lastModified}`} className="flex items-center justify-between rounded-md border p-2 text-sm">
                  <div className="flex items-center gap-2 overflow-hidden">
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate font-medium">{file.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">({formatBytes(file.size)})</span>
                  </div>
                  <button
                    type="button"
                    disabled={submitting}
                    aria-label={`Remove ${file.name}`}
                    className="shrink-0 rounded-full p-1 hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
                    onClick={() => removeFile(index)}
                  >
                    <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {submitting && (
            <div className="space-y-1.5" data-testid="document-upload-progress">
              <div
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progress}
                className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
              >
                <div
                  className="h-full rounded-full bg-wissen-navy transition-all duration-200"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {progress < 100 ? `Uploading... ${progress}%` : 'Upload finished, processing...'}
              </p>
            </div>
          )}

          {rejections.length > 0 && (
            <ul className="space-y-1 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
              {rejections.map((rejection, idx) => (
                <li key={`${rejection.fileName}-${idx}`}>{rejection.message}</li>
              ))}
            </ul>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}

          <p className="flex items-start gap-2 rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Documents are added to {workspaceName ? `"${workspaceName}"` : 'the workspace'} and appear under
              Orphaned Files until folder assignment is available.
            </span>
          </p>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button
              id="document-submit-button"
              data-testid="document-submit-button"
              type="submit"
              disabled={locked}
              aria-busy={submitting}
              className="gap-2 bg-wissen-navy text-white hover:bg-wissen-navy/90"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <UploadCloud className="h-4 w-4" />
                  {files.length > 1 ? `Upload ${files.length} files` : 'Upload'}
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
