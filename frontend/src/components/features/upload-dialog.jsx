import React, { useState } from 'react';
import axios from 'axios';
import { UploadCloud, FileText, ClipboardType, Loader2, Sparkles, X } from 'lucide-react';

import { cn } from '@/lib/utils';
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

const TABS = [
  { key: 'file', label: 'Upload file', icon: UploadCloud },
  { key: 'text', label: 'Paste text', icon: ClipboardType },
];

const WORKSPACE_ID = 'ws_001';

export function UploadDialog({ open, onOpenChange, apiBaseUrl = '', onCreated, onShowToast }) {
  const [tab, setTab] = useState('file');
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({ title: '', file: '' });

  const reset = () => {
    setSelectedFile(null);
    setIsDragging(false);
    setTitle('');
    setContent('');
    setError('');
    setFieldErrors({ title: '', file: '' });
    setTab('file');
  };

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

  const handleSubmitFile = async () => {
    const nextFieldErrors = { title: '', file: '' };
    if (!title.trim()) nextFieldErrors.title = 'Title is required.';
    if (!selectedFile) nextFieldErrors.file = 'Please select a file to upload.';

    if (nextFieldErrors.title || nextFieldErrors.file) {
      setFieldErrors(nextFieldErrors);
      return;
    }

    setFieldErrors({ title: '', file: '' });
    setError('');
    setSubmitting(true);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('title', title.trim());

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

    const nextFieldErrors = { title: '', file: '' };
    if (!title.trim()) nextFieldErrors.title = 'Title is required.';
    if (!content.trim()) nextFieldErrors.file = 'Document text content is required.';
    if (nextFieldErrors.title || nextFieldErrors.file) {
      setFieldErrors(nextFieldErrors);
      return;
    }

    setFieldErrors({ title: '', file: '' });
    setSubmitting(true);
    setError('');

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
            <div className="space-y-1.5">
              <Label htmlFor="doc-file-title">Title</Label>
              <Input
                id="doc-file-title"
                placeholder="e.g. Q3 Financial Performance Report"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  if (fieldErrors.title) setFieldErrors((prev) => ({ ...prev, title: '' }));
                }}
              />
              {fieldErrors.title && <p className="text-sm text-destructive">{fieldErrors.title}</p>}
            </div>

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
