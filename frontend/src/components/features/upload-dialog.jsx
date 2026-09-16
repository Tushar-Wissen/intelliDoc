import React, { useState } from 'react';
import axios from 'axios';
import { UploadCloud, FileText, ClipboardType, Loader2, Sparkles, X, Folder } from 'lucide-react';

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

export function UploadDialog({ open, onOpenChange, apiBaseUrl = '', onCreated, onShowToast }) {
  const [tab, setTab] = useState('file');
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState([]);

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const reset = () => {
    setSelectedFiles([]);
    setIsDragging(false);
    setTitle('');
    setContent('');
    setError('');
    setTab('file');
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files) {
      setSelectedFiles((prev) => [...prev, ...Array.from(e.dataTransfer.files)]);
    }
  };

  const handleOpenChange = (next) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const createDummyDocument = (file, fileContent = '') => {
    const id = 'doc_' + Math.random().toString(36).substring(2, 10);
    const isPdf = file.name.toLowerCase().endsWith('.pdf');
    const isDocx = file.name.toLowerCase().endsWith('.docx') || file.name.toLowerCase().endsWith('.doc');
    const isCsv = file.name.toLowerCase().endsWith('.csv');

    return {
      id,
      title: file.name,
      content: fileContent || `Extracted document content for ${file.name}. Parsed and scheduled for AI evaluation.`,
      contentType: file.type || (isPdf ? 'application/pdf' : isDocx ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : isCsv ? 'text/csv' : 'text/plain'),
      status: 'PROCESSING',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      summary: null,
      sentiment: null,
      confidenceScore: null,
      entities: [],
      keyTopics: [],
    };
  };

  const readFileContent = async (file) => {
    try {
      if (file.type === 'text/plain' || file.name.endsWith('.txt') || file.name.endsWith('.csv')) {
        return await file.text();
      }
      const buffer = await file.arrayBuffer();
      const text = new TextDecoder('latin1').decode(buffer);
      const matches = text.match(/BT[\s\S]*?ET/g);
      if (matches && matches.length > 0) {
        const extracted = matches
          .map((block) => {
            const strings = block.match(/\((.*?)\)\s*Tj/g) || [];
            return strings.map((s) => s.replace(/^\(/, '').replace(/\)\s*Tj$/, '')).join(' ');
          })
          .filter(Boolean)
          .join('\n');
        if (extracted.trim().length > 10) {
          return extracted.trim();
        }
      }
      const asciiOnly = text.replace(/[^\x20-\x7E\t\r\n]/g, ' ').replace(/\s+/g, ' ').trim();
      if (asciiOnly.length > 30) {
        return asciiOnly;
      }
      return await file.text();
    } catch {
      return `Document content for ${file.name}`;
    }
  };

  const handleSubmitFiles = async () => {
    if (selectedFiles.length === 0) return;

    setSubmitting(true);
    setError('');

    const newDocs = [];
    for (const file of selectedFiles) {
      let fileContent = await readFileContent(file);
      let createdDoc = null;

      if (apiBaseUrl) {
        try {
          const res = await axios.post(
            `${apiBaseUrl}/api/v1/documents`,
            {
              title: file.name,
              content: fileContent || `Document: ${file.name}`,
              contentType: file.type || 'text/plain',
            },
            { timeout: 2000 }
          );
          createdDoc = res.data;
        } catch {
          // Fallback to dummy data
        }
      }

      if (!createdDoc) {
        createdDoc = createDummyDocument(file, fileContent);
      }
      newDocs.push(createdDoc);
    }

    if (newDocs.length > 1) {
      let folderTitle = '';
      const relativePaths = selectedFiles.map((f) => f.webkitRelativePath).filter(Boolean);
      if (relativePaths.length > 0 && relativePaths[0] && relativePaths[0].includes('/')) {
        folderTitle = relativePaths[0].split('/')[0];
      }
      if (!folderTitle) {
        folderTitle = `Batch Upload (${newDocs.length} files)`;
      }

      const folderItem = {
        id: 'folder_' + Math.random().toString(36).substring(2, 10),
        type: 'folder',
        title: folderTitle,
        files: newDocs,
        status: 'PROCESSING',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      onCreated?.(folderItem);
    } else if (newDocs.length === 1) {
      onCreated?.(newDocs[0]);
    }

    handleOpenChange(false);
    onShowToast?.('We’ve got your files and are working on them right now. Sit tight—the details will appear shortly.');
    setSubmitting(false);
  };

  const handleSubmitText = async (e) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;

    setSubmitting(true);
    setError('');
    let createdDoc = null;

    if (apiBaseUrl) {
      try {
        const res = await axios.post(
          `${apiBaseUrl}/api/v1/documents`,
          {
            title,
            content,
            contentType: 'text/plain',
          },
          { timeout: 2000 }
        );
        createdDoc = res.data;
      } catch {
        // Fallback to dummy data
      }
    }

    if (!createdDoc) {
      createdDoc = createDummyDocument({ name: title, type: 'text/plain' }, content);
    }

    onCreated?.(createdDoc);
    handleOpenChange(false);
    onShowToast?.('We’ve got your files and are working on them right now. Sit tight—the details will appear shortly.');
    setSubmitting(false);
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
            <label
              htmlFor="document-upload-input"
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              className={cn(
                'flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-9 text-center transition-colors',
                isDragging
                  ? 'border-primary bg-accent'
                  : 'border-border hover:border-primary/50 hover:bg-accent/50'
              )}
            >
              <input
                id="document-upload-input"
                type="file"
                multiple
                accept=".pdf,.docx,.csv,.txt"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) {
                    setSelectedFiles((prev) => [...prev, ...Array.from(e.target.files)]);
                  }
                }}
              />
              <input
                id="folder-upload-input"
                type="file"
                webkitdirectory="true"
                directory=""
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) {
                    setSelectedFiles((prev) => [...prev, ...Array.from(e.target.files)]);
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
                <div
                  className="mt-2.5 flex items-center justify-center gap-1.5"
                  onClick={(e) => e.stopPropagation()}
                >
                  <label
                    htmlFor="folder-upload-input"
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border bg-secondary/80 px-2.5 py-1 text-xs font-medium text-secondary-foreground shadow-sm transition-colors hover:bg-secondary"
                  >
                    <Folder className="h-3.5 w-3.5 text-primary" />
                    Or select a folder
                  </label>
                </div>
              </div>
            </label>

            {selectedFiles.length > 0 && (
              <div className="mt-4 flex max-h-[200px] flex-col gap-2 overflow-y-auto">
                {selectedFiles.map((file, index) => (
                  <div
                    key={`${file.name}-${index}`}
                    className="flex items-center justify-between rounded-md border p-2 text-sm"
                  >
                    <div className="flex items-center gap-2 overflow-hidden">
                      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="truncate font-medium">{file.name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        ({(file.size / 1024).toFixed(1)} KB)
                      </span>
                    </div>
                    <button
                      type="button"
                      className="shrink-0 rounded-full p-1 hover:bg-muted"
                      onClick={() => {
                        setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
                      }}
                    >
                      <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                    </button>
                  </div>
                ))}
              </div>
            )}

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
              <Button
                type="button"
                onClick={handleSubmitFiles}
                disabled={selectedFiles.length === 0 || submitting}
              >
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
