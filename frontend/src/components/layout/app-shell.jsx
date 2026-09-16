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
  children,
}) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar onUploadClick={onUploadClick} activeView={activeView} onNavigate={onNavigate} />
      <MobileSidebar
        open={mobileNavOpen}
        onOpenChange={setMobileNavOpen}
        onUploadClick={onUploadClick}
        activeView={activeView}
        onNavigate={onNavigate}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <Header
          title={title}
          subtitle={subtitle}
          healthStatus={healthStatus}
          onMenuClick={() => setMobileNavOpen(true)}
        />
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
