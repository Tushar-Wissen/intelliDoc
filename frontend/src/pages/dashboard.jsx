import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, FolderPlus } from 'lucide-react';

import { AppShell } from '@/components/layout/app-shell';
import { CreateWorkspaceDialog } from '@/components/features/create-workspace-dialog';
import { EmptyWorkspaceState } from '@/components/features/empty-workspace-state';

import { useHealthStatus } from '@/hooks/use-health-status';
import { useWorkspace } from '@/context/workspace-context';
import { useFolders } from '@/context/folder-context';

import { DashboardStatCards } from '@/components/dashboard/stat-cards';
import { MostAccessedCard } from '@/components/dashboard/most-accessed-card';
import { AiSuccessRateCard } from '@/components/dashboard/ai-success-rate-card';
import { RecentDocumentsTable } from '@/components/dashboard/recent-documents-table';

const formatTimeElapsed = (dateString) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now - date) / 1000);
  
  if (diffInSeconds < 60) return 'Just now';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} mins ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} hours ago`;
  if (diffInSeconds < 172800) return 'Yesterday';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const getFileColors = (type) => {
  const upperType = (type || '').toUpperCase();
  if (upperType.includes('PDF')) {
    return {
      iconBg: 'bg-wissen-navy/10',
      iconFg: 'text-wissen-navy',
      typeBg: 'bg-wissen-navy/10 text-wissen-navy',
    };
  }
  if (upperType.includes('DOC')) {
    return {
      iconBg: 'bg-blue-500/10',
      iconFg: 'text-blue-600',
      typeBg: 'bg-blue-500/10 text-blue-700',
    };
  }
  if (upperType.includes('XLS')) {
    return {
      iconBg: 'bg-orange-500/10',
      iconFg: 'text-orange-600',
      typeBg: 'bg-orange-500/10 text-orange-700',
    };
  }
  return {
    iconBg: 'bg-gray-500/10',
    iconFg: 'text-gray-600',
    typeBg: 'bg-gray-500/10 text-gray-700',
  };
};

export function DashboardPage() {
  const healthStatus = useHealthStatus();
  const navigate = useNavigate();
  const { workspaces, loading: workspacesLoading } = useWorkspace();
  const { folders, loading } = useFolders();

  const totalFolders = folders.length;
  const [createWorkspaceOpen, setCreateWorkspaceOpen] = useState(false);

  const totalDocuments = useMemo(
    () => folders.reduce((sum, folder) => sum + (folder.filesCount || 0), 0),
    [folders]
  );

  const recentDocuments = useMemo(() => {
    const allFiles = folders.flatMap((folder) =>
      (folder.files || []).map((file) => ({
        ...file,
        folderId: folder.id,
        folder: folder.name,
        time: formatTimeElapsed(file.updatedAt || file.createdAt),
        ...getFileColors(file.type),
      }))
    );
    
    return allFiles
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
      .slice(0, 5);
  }, [folders]);

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
        <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto scrollbar-thin pl-1 pr-8 py-1">

          {/* Stats row */}
          <DashboardStatCards totalDocuments={totalDocuments} totalFolders={totalFolders} />

          {/* Middle row: most accessed + AI success rate */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-6">
            <MostAccessedCard
              documents={recentDocuments}
              loading={loading}
              onViewAll={() => navigate('/workspace')}
            />
            <AiSuccessRateCard />
          </div>

          {/* Recent documents table */}
          <RecentDocumentsTable
            files={recentDocuments}
            loading={loading}
            onOpenFile={(file) =>
              navigate('/workspace', { state: { folderId: file.folderId, fileId: file.id } })
            }
            onOpenFolder={(file) => navigate('/workspace', { state: { folderId: file.folderId } })}
            onViewAll={() => navigate('/workspace')}
          />

        </div>
      )}

      <CreateWorkspaceDialog
        open={createWorkspaceOpen}
        onOpenChange={setCreateWorkspaceOpen}
      />
    </AppShell>
  );
}
