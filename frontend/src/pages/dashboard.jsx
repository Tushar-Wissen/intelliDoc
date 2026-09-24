import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, FolderPlus } from 'lucide-react';

import { AppShell } from '@/components/layout/app-shell';
import { UploadDialog } from '@/components/features/upload-dialog';
import { CreateWorkspaceDialog } from '@/components/features/create-workspace-dialog';
import { EmptyWorkspaceState } from '@/components/features/empty-workspace-state';

import { useHealthStatus } from '@/hooks/use-health-status';
import { useWorkspace } from '@/context/workspace-context';
import { useFolders } from '@/context/folder-context';

import { DashboardStatCards } from '@/components/dashboard/stat-cards';
import { MostAccessedCard } from '@/components/dashboard/most-accessed-card';
import { AiSuccessRateCard } from '@/components/dashboard/ai-success-rate-card';
import { RecentDocumentsTable } from '@/components/dashboard/recent-documents-table';

export function DashboardPage() {
  const healthStatus = useHealthStatus();
  const navigate = useNavigate();
  const { workspaces, loading: workspacesLoading } = useWorkspace();
  const { folders, loading } = useFolders();

  const totalFolders = folders.length;
  const [uploadOpen, setUploadOpen] = useState(false);
  const [createWorkspaceOpen, setCreateWorkspaceOpen] = useState(false);

  const totalDocuments = useMemo(
    () => folders.reduce((sum, folder) => sum + (folder.filesCount || 0), 0),
    [folders]
  );

  const handleWorkspaceCreated = () => {
    setTimeout(() => setUploadOpen(true), 250);
  };

  return (
    <AppShell title="Dashboard" healthStatus={healthStatus}>
      {loading || workspacesLoading ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : workspaces.length === 0 ? (
        <EmptyWorkspaceState
          className="flex-1 justify-center px-4 py-16"
          icon={FolderPlus}
          heading="You don't have a workspace yet"
          description="Create your first workspace to start uploading documents, asking AI questions and collaborating with your team."
          ctaLabel="Create Workspace"
          ctaIcon={FolderPlus}
          onCtaClick={() => setCreateWorkspaceOpen(true)}
          ctaTestId="workspace-empty-create-button"
        />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-1 py-1">

          {/* Stats row */}
          <DashboardStatCards totalDocuments={totalDocuments} totalFolders={totalFolders} />

          {/* Middle row: most accessed + AI success rate */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-6">
            <MostAccessedCard />
            <AiSuccessRateCard />
          </div>

          {/* Recent documents table */}
          <RecentDocumentsTable
            onOpenFile={(file) =>
              navigate('/workspace', { state: { folderId: file.folderId, fileId: file.id } })
            }
          />

        </div>
      )}

      <CreateWorkspaceDialog
        open={createWorkspaceOpen}
        onOpenChange={setCreateWorkspaceOpen}
        onCreated={handleWorkspaceCreated}
      />

      <UploadDialog open={uploadOpen} onOpenChange={setUploadOpen} />
    </AppShell>
  );
}
