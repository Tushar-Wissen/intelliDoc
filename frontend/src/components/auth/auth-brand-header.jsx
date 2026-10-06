import React from 'react';
import wissenLogo from '@/assets/wissen-logo.png';
import { BrandLogo } from '@/components/brand-logo';

export function AuthBrandHeader() {
  return (
    <div id="auth-brand-header" className="flex flex-col items-center gap-3 text-center">
      <img src={wissenLogo} alt="Wissen Technology" className="h-7 w-auto" />

      <BrandLogo iconClassName="h-11" textClassName="text-3xl" />
      <p id="login-brand-title" className="sr-only">
        DocuMind
      </p>
      <p className="-mt-1 text-xs tracking-wide text-wissen-gray">Your Documents. Smarter Answers.</p>
    </div>
  );
}
