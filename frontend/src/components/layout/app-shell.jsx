import React, { useState } from 'react';

import { Sidebar, MobileSidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';

export function AppShell({ title, subtitle, healthStatus, tabsBar, children }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <MobileSidebar open={mobileNavOpen} onOpenChange={setMobileNavOpen} />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <Header
          title={title}
          subtitle={subtitle}
          healthStatus={healthStatus}
          onMenuClick={() => setMobileNavOpen(true)}
        />
        {tabsBar}
        <main className="relative flex min-h-0 flex-1 flex-col overflow-hidden px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
