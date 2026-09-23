import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, FolderKanban, FolderPlus, MessageSquareText, Database, BarChart3, PieChart, Plus, Loader2 } from 'lucide-react';

import { cn } from '@/lib/utils';
import { AppShell } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { UploadDialog } from '@/components/features/upload-dialog';
import { CreateWorkspaceDialog } from '@/components/features/create-workspace-dialog';
import { ToastNotification } from '@/components/ui/toast-notification';
import { EmptyWorkspaceState } from '@/components/features/empty-workspace-state';
import { RecentDocumentsCard } from '@/components/features/recent-documents-card';

import { fetchDocumentFolders, invalidateDocumentFoldersCache, addFileToCachedDocument } from '@/lib/documents-api';
import { useHealthStatus } from '@/hooks/use-health-status';
import { useWorkspace } from '@/context/workspace-context';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';
const DASHBOARD_FOLDERS_PAGE_SIZE = 100;

function StatCard({ icon: Icon, label, value, hint, iconBg, iconFg }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', iconBg)}>
          <Icon className={cn('h-4 w-4', iconFg)} />
        </span>
      </div>
      <p className="mt-3 font-display text-2xl font-bold tracking-tight text-card-foreground">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function InsightPlaceholder({ title, icon: Icon, message, action }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col items-center justify-center gap-3 px-6 py-10 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <Icon className="h-6 w-6 text-muted-foreground" />
        </div>
        <p className="max-w-xs text-sm text-muted-foreground">{message}</p>
        {action}
      </CardContent>
    </Card>
  );
}

export function DashboardPage() {
  const healthStatus = useHealthStatus();
  const navigate = useNavigate();
  const { setWorkspaceName } = useWorkspace();

  const [folders, setFolders] = useState([]);
  const [totalFolders, setTotalFolders] = useState(0);
  const [loading, setLoading] = useState(true);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [createWorkspaceOpen, setCreateWorkspaceOpen] = useState(false);
  const [toastOpen, setToastOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState(
    'We’ve got your file(s) and are working on them right now. Sit tight—the details will appear shortly.'
  );

  const loadFolders = () => {
    setLoading(true);
    return fetchDocumentFolders({ apiBaseUrl: API_BASE_URL, page: 1, pageSize: DASHBOARD_FOLDERS_PAGE_SIZE })
      .then(({ items, total }) => {
        setFolders(items);
        setTotalFolders(total);
      })
      .catch((err) => console.error('Failed to fetch document folders', err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    let cancelled = false;
    loadFolders().catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalDocuments = useMemo(
    () => folders.reduce((sum, folder) => sum + (folder.filesCount || 0), 0),
    [folders]
  );

  const recentFiles = useMemo(() => {
    const flattened = [];
    folders.forEach((folder) => {
      (folder.files || []).forEach((file) => {
        flattened.push({ ...file, folderId: folder.id, folderName: folder.name, date: folder.updatedAt });
      });
    });
    return flattened
      .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
      .slice(0, 5);
  }, [folders]);

  const today = useMemo(
    () => new Date().toLocaleDateString('en-US', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }),
    []
  );

  const handleOpenFile = (file) => {
    navigate('/workspace', { state: { folderId: file.folderId, fileId: file.id } });
  };

  const handleCreated = () => {
    invalidateDocumentFoldersCache();
    loadFolders();
  };

  const handleFileAddedToFolder = (folderId, file) => {
    addFileToCachedDocument(folderId, file.name);
    setFolders((prev) =>
      prev.map((folder) =>
        folder.id === folderId
          ? { ...folder, files: [...(folder.files || []), file], filesCount: (folder.filesCount || 0) + 1 }
          : folder
      )
    );
  };

  const handleShowToast = (msg) => {
    setToastMessage(msg || 'We’ve got your files and are working on them right now. Sit tight—the details will appear shortly.');
    setToastOpen(true);
  };

  const handleWorkspaceCreated = (workspace) => {
    setWorkspaceName(workspace.name);
    // Wait for the Create Workspace dialog's ~200ms close animation to finish
    // before opening the Upload dialog, so the two don't render stacked mid-transition.
    setTimeout(() => setUploadOpen(true), 250);
  };

  return (
    <AppShell title="Dashboard" subtitle={today} healthStatus={healthStatus}>
      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : totalFolders === 0 ? (
        <EmptyWorkspaceState
          className="flex-1 justify-center px-4 py-16"
          icon={FolderPlus}
          heading="You don't have a workspace yet"
          description="Create your first workspace to start uploading documents, asking AI questions and collaborating with your team."
          ctaLabel="Create Workspace"
          ctaIcon={FolderPlus}
          onCtaClick={() => setCreateWorkspaceOpen(true)}
        />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard
              icon={FileText}
              label="Total Documents"
              value={totalDocuments}
              iconBg="bg-wissen-navy/10"
              iconFg="text-wissen-navy dark:text-wissen-navy-light"
            />
            <StatCard
              icon={FolderKanban}
              label="Total Folders"
              value={totalFolders}
              iconBg="bg-blue-500/10"
              iconFg="text-blue-600 dark:text-blue-400"
            />
            <StatCard
              icon={MessageSquareText}
              label="AI Queries Today"
              value="—"
              hint="Coming soon"
              iconBg="bg-violet-500/10"
              iconFg="text-violet-600 dark:text-violet-400"
            />
            <StatCard
              icon={Database}
              label="Storage Used"
              value="—"
              hint="Coming soon"
              iconBg="bg-emerald-500/10"
              iconFg="text-emerald-600 dark:text-emerald-400"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <InsightPlaceholder
              title="AI Query Insights"
              icon={BarChart3}
              message="Upload documents to see AI query insights"
              action={
                <Button
                  size="sm"
                  className="gap-2 bg-wissen-navy text-white hover:bg-wissen-navy/90"
                  onClick={() => setUploadOpen(true)}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Upload Document
                </Button>
              }
            />
            <InsightPlaceholder
              title="File Type Distribution"
              icon={PieChart}
              message="File type distribution will appear here once you upload documents"
            />
          </div>

          <RecentDocumentsCard loading={false} files={recentFiles} onOpenFile={handleOpenFile} viewAllHref="/workspace" />
        </div>
      )}

      <CreateWorkspaceDialog
        open={createWorkspaceOpen}
        onOpenChange={setCreateWorkspaceOpen}
        onCreated={handleWorkspaceCreated}
      />

      <UploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        apiBaseUrl={API_BASE_URL}
        folders={folders}
        onCreated={handleCreated}
        onAddToFolder={handleFileAddedToFolder}
        onShowToast={handleShowToast}
      />

      <ToastNotification open={toastOpen} onClose={() => setToastOpen(false)} message={toastMessage} />
    </AppShell>
  );
}
