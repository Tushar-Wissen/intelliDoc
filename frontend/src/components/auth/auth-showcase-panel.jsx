import React from 'react';
import { FileText } from 'lucide-react';

import wissenLogo from '@/assets/wissen-logo.png';

const FEATURES = ['Workspace AI chat', 'Folder-level search', 'Document Q&A', 'Source citations'];

export function AuthShowcasePanel() {
  return (
    <div
      id="auth-showcase-panel"
      className="relative hidden w-1/2 shrink-0 overflow-hidden bg-gradient-to-br from-wissen-navy-light via-wissen-navy to-wissen-navy-dark lg:flex lg:flex-col xl:w-[45%]"
    >
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_70%_60%_at_10%_0%,black,transparent)]" />

      <div className="relative flex h-full flex-col justify-between px-10 py-10 text-white xl:px-14 xl:py-14">
        <div id="wissen-brand-mark" className="flex flex-col gap-5">
          <div className="inline-flex w-fit items-center rounded-lg bg-white px-3.5 py-2 shadow-sm">
            <img src={wissenLogo} alt="Wissen Technology" className="h-6 w-auto xl:h-7" />
          </div>

          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/15 ring-1 ring-white/20">
              <FileText className="h-5 w-5" />
            </span>
            <span className="font-display text-2xl font-bold tracking-tight">IntelliDoc</span>
          </div>
        </div>

        <div className="flex flex-1 flex-col justify-center gap-7 py-10">
          <h1 className="max-w-lg font-display text-5xl leading-[1.08] tracking-tight xl:text-6xl">
            <span className="font-extrabold">Your documents.</span>
            <br />
            <span className="font-normal text-white/70">Understood.</span>
          </h1>

          <p className="max-w-md text-[15px] leading-relaxed tracking-wide text-white/65">
            Upload any document and have a conversation with its content. Contracts, research,
            reports — answered instantly.
          </p>

          <ul id="auth-showcase-features" className="flex flex-wrap gap-2">
            {FEATURES.map((label) => (
              <li
                key={label}
                className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-white/80"
              >
                {label}
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs tracking-wide text-white/40">
          © {new Date().getFullYear()} Wissen Technology. All rights reserved.
        </p>
      </div>
    </div>
  );
}
