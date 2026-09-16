import React, { useState } from 'react';

import { Sidebar, MobileSidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';

export function AppShell({
  title,
  subtitle,
  healthStatus,
  onUploadClick,
  activeView,
  onNavigate,
  activeFolder,
  children,
}) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const collapsed = Boolean(activeFolder);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar
        onUploadClick={onUploadClick}
        activeView={activeView}
        onNavigate={onNavigate}
        collapsed={collapsed}
      />
      <MobileSidebar
        open={mobileNavOpen}
        onOpenChange={setMobileNavOpen}
        onUploadClick={onUploadClick}
        activeView={activeView}
        onNavigate={onNavigate}
      />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <Header
          title={activeFolder ? activeFolder.name : title}
          subtitle={activeFolder ? 'Folder selected — full navigation coming soon' : subtitle}
          healthStatus={healthStatus}
          onMenuClick={() => setMobileNavOpen(true)}
        />
        <main className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
