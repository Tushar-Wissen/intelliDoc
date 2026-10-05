import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, FolderPlus } from 'lucide-react';

import { AppShell } from '@/components/layout/app-shell';
import { CreateWorkspaceDialog } from '@/components/features/create-workspace-dialog';
import { EmptyWorkspaceState } from '@/components/features/empty-workspace-state';

import { useHealthStatus } from '@/hooks/use-health-status';
import { useWorkspace } from '@/context/workspace-context';
import { useFolders } from '@/context/folder-context';

import { dashboardApi } from '@/lib/dashboard-api';
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
  const { workspaces, loading: workspacesLoading, selectedWorkspaceId } = useWorkspace();
  const { folders, loading } = useFolders();

  const [createWorkspaceOpen, setCreateWorkspaceOpen] = useState(false);
  const [stats, setStats] = useState({ totalDocuments: 0, totalFolders: 0, recentDocuments: 0 });
  const [loadingStats, setLoadingStats] = useState(false);
  const [mostAccessed, setMostAccessed] = useState([]);
  const [loadingMostAccessed, setLoadingMostAccessed] = useState(false);
  const [aiSuccessRate, setAiSuccessRate] = useState(null);
  const [recentDocuments, setRecentDocuments] = useState([]);
  const [loadingRecentDocuments, setLoadingRecentDocuments] = useState(false);

  React.useEffect(() => {
    if (!selectedWorkspaceId) return;
    let mounted = true;
    
    async function loadStats() {
      setLoadingStats(true);
      setLoadingMostAccessed(true);
      setLoadingRecentDocuments(true);
      try {
        const [statsData, mostAccessedData, aiSuccessData, recentDocsData] = await Promise.all([
          dashboardApi.getDashboardStats(selectedWorkspaceId),
          dashboardApi.getMostAccessedDocuments(selectedWorkspaceId),
          dashboardApi.getAiSuccessRate(selectedWorkspaceId),
          dashboardApi.getRecentDocuments(selectedWorkspaceId)
        ]);
        if (mounted) {
          setStats(statsData);
          setMostAccessed(mostAccessedData);
          setAiSuccessRate(aiSuccessData);
          setRecentDocuments(
            recentDocsData.map((file) => ({
              ...file,
              time: formatTimeElapsed(file.updatedAt || file.createdAt),
              ...getFileColors(file.type),
            }))
          );
        }
      } catch (error) {
        console.error("Failed to fetch dashboard data:", error);
      } finally {
        if (mounted) {
          setLoadingStats(false);
          setLoadingMostAccessed(false);
          setLoadingRecentDocuments(false);
        }
      }
    }
    
    loadStats();
    
    return () => {
      mounted = false;
    };
  }, [selectedWorkspaceId]);

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
          <DashboardStatCards 
            totalDocuments={stats.totalDocuments} 
            totalFolders={stats.totalFolders} 
            recentDocuments={stats.recentDocuments}
          />

          {/* Middle row: most accessed + AI success rate */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-6">
            <MostAccessedCard
              documents={mostAccessed}
              loading={loadingMostAccessed}
              onViewAll={() => navigate('/workspace')}
            />
            <AiSuccessRateCard {...(aiSuccessRate || {})} />
          </div>

          {/* Recent documents table */}
          <RecentDocumentsTable
            files={recentDocuments}
            loading={loadingRecentDocuments}
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
