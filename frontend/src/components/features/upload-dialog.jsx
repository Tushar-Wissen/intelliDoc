import React, { useState } from 'react';
import axios from 'axios';
import { UploadCloud, FileText, ClipboardType, Loader2, Sparkles } from 'lucide-react';

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

export function UploadDialog({ open, onOpenChange, apiBaseUrl = '', onCreated }) {
  const [tab, setTab] = useState('file');
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const reset = () => {
    setSelectedFile(null);
    setIsDragging(false);
    setTitle('');
    setContent('');
    setError('');
    setTab('file');
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) setSelectedFile(file);
  };

  const handleOpenChange = (next) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const handleSubmitText = async (e) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;

    setSubmitting(true);
    setError('');
    try {
      const res = await axios.post(`${apiBaseUrl}/api/v1/documents`, {
        title,
        content,
        contentType: 'text/plain',
      });
      onCreated?.(res.data);
      handleOpenChange(false);
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Document processing failed');
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
            <label
              htmlFor="document-upload-input"
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              className={cn(
                'flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors',
                isDragging
                  ? 'border-primary bg-accent'
                  : 'border-border hover:border-primary/50 hover:bg-accent/50'
              )}
            >
              <input
                id="document-upload-input"
                type="file"
                className="hidden"
                onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
              />
              {selectedFile ? (
                <>
                  <FileText className="h-9 w-9 text-primary" />
                  <div>
                    <p className="text-sm font-medium">{selectedFile.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(selectedFile.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <UploadCloud className="h-9 w-9 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">
                      <span className="text-primary">Click to browse</span> or drag and drop
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      PDF, DOCX, CSV or TXT &mdash; up to 25MB
                    </p>
                  </div>
                </>
              )}
            </label>

            <DialogFooter>
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button disabled title="File parsing is coming soon &mdash; use Paste text for now">
                Upload
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
