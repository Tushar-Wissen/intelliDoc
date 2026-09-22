import React from 'react';
import { FileText } from 'lucide-react';

import wissenLogo from '@/assets/wissen-logo.png';

export function AuthBrandHeader() {
  return (
    <div id="auth-brand-header" className="flex flex-col items-center gap-3 text-center">
      <img src={wissenLogo} alt="Wissen Technology" className="h-7 w-auto" />

      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-wissen-navy text-white shadow-sm">
          <FileText className="h-5 w-5" />
        </span>
        <span id="login-brand-title" className="font-display text-2xl font-bold tracking-tight">
          IntelliDoc
        </span>
      </div>
    </div>
  );
}
