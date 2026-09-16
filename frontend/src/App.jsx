import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { Search, Plus, FolderOpen, BadgeCheck } from 'lucide-react';

import { AppShell } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DocumentCard } from '@/components/features/document-card';
import { UploadDialog } from '@/components/features/upload-dialog';
import { DocumentDetailDialog } from '@/components/features/document-detail-dialog';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

const VIEWS = {
  all: {
    title: 'Documents',
    subtitle: 'Analyze and query your documents with AI',
  },
  evaluated: {
    title: 'Evaluated Docs',
    subtitle: 'Documents with completed AI evaluation results',
  },
};

export default function App() {
  const [documents, setDocuments] = useState([]);
  const [search, setSearch] = useState('');
  const [view, setView] = useState('all');
  const [healthStatus, setHealthStatus] = useState({ backend: 'checking', aiService: 'checking' });

  const [uploadOpen, setUploadOpen] = useState(false);

  const [selectedDoc, setSelectedDoc] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const [question, setQuestion] = useState('');
  const [qaLoading, setQaLoading] = useState(false);
  const [qaResult, setQaResult] = useState(null);

  useEffect(() => {
    fetchHealthStatus();
    fetchDocuments();
  }, []);

  const fetchHealthStatus = async () => {
    try {
      const res = await axios.get(`${API_BASE_URL}/api/v1/health`);
      setHealthStatus({
        backend: res.data.status === 'UP' ? 'up' : 'down',
        aiService: res.data.ai_service?.status === 'UP' ? 'up' : 'down',
      });
    } catch (err) {
      setHealthStatus({ backend: 'down', aiService: 'down' });
    }
  };

  const fetchDocuments = async () => {
    try {
      const res = await axios.get(`${API_BASE_URL}/api/v1/documents`);
      setDocuments(res.data);
    } catch (err) {
      console.error('Failed to fetch documents', err);
    }
  };

  const handleCreated = (doc) => {
    setDocuments((prev) => [doc, ...prev]);
  };

  const openDocument = (doc) => {
    setSelectedDoc(doc);
    setQaResult(null);
    setQuestion('');
    setDetailOpen(true);
  };

  const handleAskQuestion = async (e) => {
    e.preventDefault();
    if (!selectedDoc || !question.trim()) return;

    setQaLoading(true);
    try {
      const res = await axios.post(`${API_BASE_URL}/api/v1/documents/${selectedDoc.id}/qa`, {
        question,
      });
      setQaResult(res.data);
    } catch (err) {
      alert('Q&A failed: ' + (err.response?.data?.message || err.message));
    } finally {
      setQaLoading(false);
    }
  };

  const viewDocuments = useMemo(() => {
    if (view === 'evaluated') {
      return documents.filter((doc) => doc.status === 'COMPLETED');
    }
    return documents;
  }, [documents, view]);

  const filteredDocuments = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return viewDocuments;
    return viewDocuments.filter((doc) => doc.title?.toLowerCase().includes(query));
  }, [viewDocuments, search]);

  const { title, subtitle } = VIEWS[view];

  return (
    <AppShell
      title={title}
      subtitle={subtitle}
      healthStatus={healthStatus}
      onUploadClick={() => setUploadOpen(true)}
      activeView={view}
      onNavigate={setView}
    >
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Filter documents..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {view !== 'evaluated' && (
            <Button className="gap-2" onClick={() => setUploadOpen(true)}>
              <Plus className="h-4 w-4" />
              Upload
            </Button>
          )}
        </div>

        {viewDocuments.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border py-20 text-center">
            {view === 'evaluated' ? (
              <>
                <BadgeCheck className="h-10 w-10 text-muted-foreground" />
                <p className="font-medium text-muted-foreground">No evaluated documents yet</p>
                <p className="max-w-xs text-sm text-muted-foreground">
                  Documents show up here once their AI evaluation finishes successfully.
                </p>
              </>
            ) : (
              <>
                <FolderOpen className="h-10 w-10 text-muted-foreground" />
                <p className="font-medium text-muted-foreground">No documents yet</p>
                <p className="max-w-xs text-sm text-muted-foreground">
                  Upload a document to get instant AI summaries, entities and Q&amp;A.
                </p>
                <Button className="mt-2 gap-2" onClick={() => setUploadOpen(true)}>
                  <Plus className="h-4 w-4" />
                  Upload Document
                </Button>
              </>
            )}
          </div>
        ) : filteredDocuments.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
            No documents match &ldquo;{search}&rdquo;.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {filteredDocuments.map((doc, idx) => (
              <DocumentCard
                key={doc.id}
                document={doc}
                index={idx}
                selected={selectedDoc?.id === doc.id}
                onClick={() => openDocument(doc)}
              />
            ))}
          </div>
        )}
      </div>

      <UploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        apiBaseUrl={API_BASE_URL}
        onCreated={handleCreated}
      />

      <DocumentDetailDialog
        document={selectedDoc}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        question={question}
        onQuestionChange={setQuestion}
        qaLoading={qaLoading}
        qaResult={qaResult}
        onAskQuestion={handleAskQuestion}
      />
    </AppShell>
  );
}
