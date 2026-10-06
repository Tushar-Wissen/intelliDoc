import React, { useEffect, useState } from 'react';
import { UploadCloud, FileText, Loader2, X, Info, Briefcase, Lock } from 'lucide-react';

import { cn } from '@/lib/utils';
import { formatBytes } from '@/lib/format';
import { getFileExtension } from '@/lib/file-types';
import { API_ERROR_CODES } from '@/lib/api-client';
import { documentsApi, SUPPORTED_UPLOAD_EXTENSIONS } from '@/lib/documents-api';
import { useWorkspace } from '@/context/workspace-context';
import { useFolders } from '@/context/folder-context';
import { useToast } from '@/context/toast-context';
import { FolderSelect } from '@/components/features/folder-select';
import { Button } from '@/components/ui/button';
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

const isSameFile = (a, b) => a.name === b.name && a.size === b.size && a.lastModified === b.lastModified;

// `defaultFolderId` preselects the folder the dialog was opened from (e.g. an open folder view).
// `target="workspace"` uploads to the selected workspace without a folder (orphaned files): the
// workspace is shown preselected and locked instead of the folder picker.
export function UploadDialog({ open, onOpenChange, onUploaded, defaultFolderId = null, target = 'folder' }) {
  const { selectedWorkspaceId, workspaceName } = useWorkspace();
  const workspaceTarget = target === 'workspace';
  const { folders, loading: foldersLoading, error: foldersError, refreshFolders } = useFolders();
  const toast = useToast();

  const [files, setFiles] = useState([]);
  // Every upload goes into a folder (module); the API has no workspace-level upload here.
  const [selectedFolderId, setSelectedFolderId] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [fieldErrors, setFieldErrors] = useState({ folder: '', files: '' });
  const [rejections, setRejections] = useState([]);
  const [error, setError] = useState('');

  const workspaceMissing = !selectedWorkspaceId;
  // Folders only matter when uploading into one.
  const noFolders = !workspaceTarget && !foldersLoading && folders.length === 0;
  const selectedFolder = folders.find((f) => f.id === selectedFolderId) ?? null;
  // Start with a clean form each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    setFiles([]);
    setSelectedFolderId(defaultFolderId);
    setIsDragging(false);
    setProgress(0);
    setFieldErrors({ folder: '', files: '' });
    setRejections([]);
    setError('');
  }, [open, defaultFolderId]);

  // Forget a folder selection that no longer exists (e.g. after switching workspace).
  // Wait for the list to load so a preselected folder isn't dropped before it arrives.
  useEffect(() => {
    if (foldersLoading) return;
    if (selectedFolderId && !folders.some((f) => f.id === selectedFolderId)) setSelectedFolderId(null);
  }, [folders, foldersLoading, selectedFolderId]);

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

    const nextErrors = {
      folder: workspaceTarget || selectedFolderId ? '' : 'Please select a folder to upload into.',
      files: files.length ? '' : 'Please select at least one file to upload.',
    };
    if (nextErrors.folder || nextErrors.files) {
      setFieldErrors(nextErrors);
      return;
    }

    const folderName = workspaceTarget ? workspaceName || 'the workspace' : selectedFolder?.name ?? 'the folder';
    setSubmitting(true);
    setProgress(0);
    setRejections([]);
    setError('');

    try {
      const body = { files };
      const result = workspaceTarget
        ? await documentsApi.uploadToWorkspace(selectedWorkspaceId, body, { onProgress: setProgress })
        : await documentsApi.upload(selectedFolderId, body, { onProgress: setProgress });
      const uploadedCount = result.documents.length;

      if (uploadedCount === 0) {
        // Nothing was accepted: keep the dialog open and explain why.
        const reasons = result.rejections.map((r) => r.message).filter(Boolean);
        setRejections(result.rejections);
        toast.error('Upload failed', reasons[0] || 'No files were accepted. Please try again.');
        setSubmitting(false);
        return;
      }

      // Folder contents come with the folder list, so re-fetch it to show the new documents.
      if (!workspaceTarget) refreshFolders();
      onUploaded?.(result.documents);
      setSubmitting(false);
      onOpenChange(false);

      if (result.rejections.length > 0) {
        // Partial success: the accepted documents are saved, the rest are explained.
        const reasons = result.rejections.map((r) => r.message).filter(Boolean).join(' ');
        toast.warning(
          'Uploaded with issues',
          `${uploadedCount} of ${files.length} files uploaded to "${folderName}". ${reasons}`
        );
      } else if (uploadedCount === 1) {
        toast.success('Upload complete', `"${result.documents[0].name}" was added to "${folderName}".`);
      } else {
        toast.success('Upload complete', `${uploadedCount} files were added to "${folderName}".`);
      }
    } catch (err) {
      // The folder may have been deleted meanwhile; refresh so the picker drops it.
      if (!workspaceTarget && err?.code === API_ERROR_CODES.NOT_FOUND) refreshFolders();
      setError(err?.message || 'Something went wrong. Please try again.');
      toast.error('Upload failed', err?.message || 'Something went wrong. Please try again.');
      setSubmitting(false);
    }
  };

  const locked = submitting || workspaceMissing || noFolders;

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

          {!workspaceMissing && noFolders && (
            <p className="text-sm text-destructive" data-testid="document-folder-missing-error">
              Create a folder before uploading documents.
            </p>
          )}

          {workspaceTarget ? (
            <div className="space-y-1.5">
              <Label htmlFor="document-workspace-select">
                Workspace <span className="text-destructive">*</span>
              </Label>
              {/* Always the current workspace; shown for context but not changeable here. */}
              <Button
                id="document-workspace-select"
                data-testid="document-workspace-select"
                type="button"
                variant="outline"
                disabled
                aria-readonly="true"
                className="w-full justify-between bg-muted/50 font-normal disabled:opacity-100"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-wissen-navy/10">
                    <Briefcase className="h-3 w-3 text-wissen-navy dark:text-wissen-navy-light" />
                  </span>
                  <span className={cn('truncate', !workspaceName && 'text-muted-foreground')}>
                    {workspaceName || 'No workspace selected'}
                  </span>
                </span>
                <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              </Button>
            </div>
          ) : (
          <div className="space-y-1">
            <FolderSelect
              id="document-folder-select"
              folders={folders}
              value={selectedFolderId}
              onChange={(folderId) => {
                setSelectedFolderId(folderId);
                if (fieldErrors.folder) setFieldErrors((prev) => ({ ...prev, folder: '' }));
              }}
              loading={foldersLoading}
              error={foldersError}
              disabled={locked}
              noneLabel="Select a folder"
              allowNone={false}
              required
              invalid={Boolean(fieldErrors.folder)}
            />
            {fieldErrors.folder && <p className="text-xs text-destructive">{fieldErrors.folder}</p>}
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
            {fieldErrors.files && <p className="break-words text-xs text-destructive">{fieldErrors.files}</p>}
          </div>

          {files.length > 0 && (
            <ul data-testid="document-files-list" className="max-h-40 space-y-1.5 overflow-y-auto">
              {files.map((file, index) => (
                <li key={`${file.name}-${file.size}-${file.lastModified}`} className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm">
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 truncate font-medium" title={file.name}>
                      {file.name}
                    </span>
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
            <ul className="space-y-1 break-words rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
              {rejections.map((rejection, idx) => (
                <li key={`${rejection.fileName}-${idx}`}>{rejection.message}</li>
              ))}
            </ul>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}

          {workspaceTarget && workspaceName ? (
            <p className="flex items-start gap-2 rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0 break-words">
                Documents will be added to the &ldquo;{workspaceName}&rdquo; workspace without a folder. You can move
                them to a folder later.
              </span>
            </p>
          ) : !workspaceTarget && selectedFolder ? (
            <p className="flex items-start gap-2 rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0 break-words">Documents will be added to the &ldquo;{selectedFolder.name}&rdquo; folder.</span>
            </p>
          ) : null}

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
