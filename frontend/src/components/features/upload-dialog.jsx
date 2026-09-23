import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { UploadCloud, FileText, ClipboardType, Loader2, Sparkles, X, Folder, FolderPlus, Check, ChevronDown, Search } from 'lucide-react';

import { cn } from '@/lib/utils';
import { colorForFolder } from '@/lib/folder-colors';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const TABS = [
  { key: 'file', label: 'Upload file', icon: UploadCloud },
  { key: 'text', label: 'Paste text', icon: ClipboardType },
];

const NEW_FOLDER_VALUE = '__new__';
const LOCAL_FILE_TAGS = ['policy', 'compliance', 'finance', 'legal', 'operations'];
const WORKSPACE_ID = 'ws_001';

function FolderSelect({ id, folders, value, onChange, disabled }) {
  const [query, setQuery] = useState('');
  const searchInputRef = useRef(null);

  const selectedFolder = folders.find((f) => f.id === value);
  const selectedIndex = folders.findIndex((f) => f.id === value);
  const selectedColor = selectedFolder ? colorForFolder(selectedFolder, selectedIndex) : null;

  const filteredFolders = folders.filter((folder) =>
    folder.name?.toLowerCase().includes(query.trim().toLowerCase())
  );

  if (disabled) {
    return (
      <div className="space-y-1.5">
        <Label htmlFor={id}>Folder</Label>
        <div
          id={id}
          className="flex h-9 w-full items-center gap-2 rounded-lg border border-input bg-muted/40 px-3 text-sm text-muted-foreground"
        >
          {selectedFolder ? (
            <span className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded-md', selectedColor.bg)}>
              <Folder className={cn('h-3 w-3', selectedColor.fg)} />
            </span>
          ) : (
            <Folder className="h-4 w-4 shrink-0" />
          )}
          <span className="truncate text-foreground">{selectedFolder?.name}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>Folder</Label>
      <DropdownMenu onOpenChange={(next) => { if (!next) setQuery(''); }}>
        <DropdownMenuTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            className="w-full justify-between bg-background font-normal"
          >
            <span className="flex min-w-0 items-center gap-2">
              {selectedFolder ? (
                <span className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded-md', selectedColor.bg)}>
                  <Folder className={cn('h-3 w-3', selectedColor.fg)} />
                </span>
              ) : (
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-wissen-navy/10 text-wissen-navy dark:text-wissen-navy-light">
                  <FolderPlus className="h-3 w-3" />
                </span>
              )}
              <span className="truncate">{selectedFolder ? selectedFolder.name : 'Create new folder'}</span>
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="max-h-72 overflow-y-auto"
          style={{ width: 'var(--radix-dropdown-menu-trigger-width)' }}
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            searchInputRef.current?.focus();
          }}
        >
          <div className="relative px-2 py-1.5">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              ref={searchInputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
              placeholder="Search folders..."
              className="h-8 w-full rounded-md border border-input bg-background pl-8 pr-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
          <DropdownMenuSeparator />

          {filteredFolders.length === 0 ? (
            <p className="px-2 py-3 text-center text-xs text-muted-foreground">
              {query ? `No folders match "${query}".` : 'No folders yet.'}
            </p>
          ) : (
            filteredFolders.map((folder) => {
              const idx = folders.findIndex((f) => f.id === folder.id);
              const color = colorForFolder(folder, idx);
              return (
                <DropdownMenuItem key={folder.id} className="gap-2" onClick={() => onChange(folder.id)}>
                  <span className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded-md', color.bg)}>
                    <Folder className={cn('h-3 w-3', color.fg)} />
                  </span>
                  <span className="flex-1 truncate">{folder.name}</span>
                  {value === folder.id && <Check className="h-4 w-4 shrink-0 text-wissen-navy dark:text-wissen-navy-light" />}
                </DropdownMenuItem>
              );
            })
          )}

          {folders.length === 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="gap-2" onClick={() => onChange(NEW_FOLDER_VALUE)}>
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-wissen-navy/10 text-wissen-navy dark:text-wissen-navy-light">
                  <FolderPlus className="h-3 w-3" />
                </span>
                <span className="flex-1 truncate">Create new folder</span>
                {value === NEW_FOLDER_VALUE && <Check className="h-4 w-4 shrink-0 text-wissen-navy dark:text-wissen-navy-light" />}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function UploadDialog({
  open,
  onOpenChange,
  apiBaseUrl = '',
  folders = [],
  onCreated,
  onAddToFolder,
  onShowToast,
  lockedFolderId = null,
}) {
  const [tab, setTab] = useState('file');
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);

  const [folderChoice, setFolderChoice] = useState(() => lockedFolderId ?? folders[0]?.id ?? NEW_FOLDER_VALUE);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({ title: '', file: '' });

  const reset = () => {
    setSelectedFile(null);
    setIsDragging(false);
    setFolderChoice(lockedFolderId ?? folders[0]?.id ?? NEW_FOLDER_VALUE);
    setTitle('');
    setContent('');
    setError('');
    setFieldErrors({ title: '', file: '' });
    setTab('file');
  };

  // The dialog stays mounted while closed, and `folders` can still be loading on the very
  // first open, so re-sync the default selection whenever the dialog opens rather than only
  // relying on the initial state or the post-close reset(). A `lockedFolderId` (opened from
  // inside a folder's own view) always wins over whatever was previously selected.
  useEffect(() => {
    if (!open) return;
    if (lockedFolderId) {
      setFolderChoice(lockedFolderId);
      return;
    }
    setFolderChoice((prev) =>
      prev !== NEW_FOLDER_VALUE && folders.some((f) => f.id === prev) ? prev : folders[0]?.id ?? NEW_FOLDER_VALUE
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, folders, lockedFolderId]);

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setSelectedFile(e.dataTransfer.files[0]);
      setFieldErrors((prev) => ({ ...prev, file: '' }));
    }
  };

  const handleOpenChange = (next) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const pickTag = () => LOCAL_FILE_TAGS[Math.floor(Math.random() * LOCAL_FILE_TAGS.length)];
  const titleFromFileName = (fileName) => fileName.replace(/\.[^/.]+$/, '');

  const handleSubmitFile = async () => {
    const isNewFolder = folderChoice === NEW_FOLDER_VALUE;

    if (!selectedFile) {
      setFieldErrors((prev) => ({ ...prev, file: 'Please select a file to upload.' }));
      return;
    }

    setFieldErrors({ title: '', file: '' });
    setError('');

    // Adding to an existing folder isn't backed by a real endpoint yet, so it's handled
    // entirely on the client — same approach as folder creation elsewhere in the app.
    if (!isNewFolder) {
      onAddToFolder?.(folderChoice, {
        id: `local-file-${Date.now()}`,
        name: selectedFile.name,
        tag: pickTag(),
        hasUpdates: false,
        sections: [],
      });
      handleOpenChange(false);
      onShowToast?.('We’ve got your file and are working on it right now. Sit tight—the details will appear shortly.');
      return;
    }

    setSubmitting(true);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('title', titleFromFileName(selectedFile.name));

      const res = await axios.post(
        `${apiBaseUrl}/api/v1/workspaces/${WORKSPACE_ID}/documents`,
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        }
      );

      if (res.data?.isError) {
        throw new Error(res.data?.message || 'Failed to upload the document. Please try again.');
      }

      onCreated?.(res.data?.data ?? res.data);
      handleOpenChange(false);
      onShowToast?.('We’ve got your file and are working on it right now. Sit tight—the details will appear shortly.');
    } catch (err) {
      setError(
        err.response?.data?.message ||
          err.message ||
          'Failed to upload the document. Please try again.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitText = async (e) => {
    e.preventDefault();
    const isNewFolder = folderChoice === NEW_FOLDER_VALUE;

    const nextFieldErrors = { title: '', file: '' };
    if (!title.trim()) nextFieldErrors.title = 'Title is required.';
    if (!content.trim()) nextFieldErrors.file = 'Document text content is required.';
    if (nextFieldErrors.title || nextFieldErrors.file) {
      setFieldErrors(nextFieldErrors);
      return;
    }

    setFieldErrors({ title: '', file: '' });
    setError('');

    if (!isNewFolder) {
      onAddToFolder?.(folderChoice, {
        id: `local-file-${Date.now()}`,
        name: title.trim(),
        tag: pickTag(),
        hasUpdates: false,
        sections: [],
      });
      handleOpenChange(false);
      onShowToast?.('We’ve got your document and are working on it right now. Sit tight—the details will appear shortly.');
      return;
    }

    setSubmitting(true);

    try {
      const res = await axios.post(
        `${apiBaseUrl}/api/v1/documents`,
        {
          title,
          content,
          contentType: 'text/plain',
        }
      );

      if (res.data?.isError) {
        throw new Error(res.data?.message || 'Failed to upload the document. Please try again.');
      }

      onCreated?.(res.data?.data ?? res.data);
      handleOpenChange(false);
      onShowToast?.('We’ve got your document and are working on it right now. Sit tight—the details will appear shortly.');
    } catch (err) {
      setError(
        err.response?.data?.message ||
          err.message ||
          'Failed to upload the document. Please try again.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload document</DialogTitle>
          <DialogDescription>
            Add a document to analyze with AI-powered summarization and Q&amp;A.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                'flex items-center justify-center gap-1.5 rounded-md py-1.5 text-sm font-medium transition-colors',
                tab === t.key
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <t.icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'file' ? (
          <>
            <FolderSelect
              id="doc-file-folder"
              folders={folders}
              value={folderChoice}
              onChange={setFolderChoice}
              disabled={Boolean(lockedFolderId)}
            />

            <label
              htmlFor="document-upload-input"
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              className={cn(
                'mt-4 flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-9 text-center transition-colors',
                isDragging
                  ? 'border-primary bg-accent'
                  : 'border-border hover:border-primary/50 hover:bg-accent/50'
              )}
            >
              <input
                id="document-upload-input"
                type="file"
                accept=".pdf,.docx,.csv,.txt"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    setSelectedFile(e.target.files[0]);
                    setFieldErrors((prev) => ({ ...prev, file: '' }));
                  }
                }}
              />
              <UploadCloud className="h-9 w-9 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">
                  <span className="text-primary font-semibold">Click to browse files</span> or drag and drop
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  PDF, DOCX, CSV or TXT &mdash; up to 25MB
                </p>
              </div>
            </label>

            {selectedFile && (
              <div className="mt-4">
                <div className="flex items-center justify-between rounded-md border p-2 text-sm">
                  <div className="flex items-center gap-2 overflow-hidden">
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate font-medium">{selectedFile.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      ({(selectedFile.size / 1024).toFixed(1)} KB)
                    </span>
                  </div>
                  <button
                    type="button"
                    className="shrink-0 rounded-full p-1 hover:bg-muted"
                    onClick={() => setSelectedFile(null)}
                  >
                    <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                  </button>
                </div>
              </div>
            )}
            {fieldErrors.file && <p className="mt-2 text-sm text-destructive">{fieldErrors.file}</p>}

            {error && <p className="mt-2 text-sm text-destructive">{error}</p>}

            <DialogFooter className="mt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button type="button" onClick={handleSubmitFile} disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Uploading...
                  </>
                ) : (
                  'Upload'
                )}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={handleSubmitText} className="space-y-4">
            <FolderSelect
              id="doc-text-folder"
              folders={folders}
              value={folderChoice}
              onChange={setFolderChoice}
              disabled={Boolean(lockedFolderId)}
            />

            <div className="space-y-1.5">
              <Label htmlFor="doc-title">Document title</Label>
              <Input
                id="doc-title"
                placeholder="e.g. Q3 Financial Performance Report.txt"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="doc-content">Document text content</Label>
              <Textarea
                id="doc-content"
                rows={6}
                placeholder="Paste document text or contract clauses here for instant analysis..."
                value={content}
                onChange={(e) => setContent(e.target.value)}
                required
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Analyzing...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" /> Analyze with AI
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
