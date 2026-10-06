import React from 'react';
import wissenLogo from '@/assets/wissen-logo.png';
import documindLoginLogo from '@/assets/documind-logo-login.svg';

const FEATURES = ['Workspace AI chat', 'Folder-level search', 'Document Q&A', 'Source citations'];

export function AuthShowcasePanel() {
  return (
    <div
      id="auth-showcase-panel"
      className="relative hidden w-1/2 shrink-0 overflow-hidden bg-gradient-to-br from-wissen-navy-light via-wissen-navy to-wissen-navy-dark lg:flex lg:flex-col xl:w-[45%]"
    >
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_70%_60%_at_10%_0%,black,transparent)]" />

      <div className="relative flex h-full flex-col justify-between px-10 py-10 text-white xl:px-14 xl:py-14">
        <div id="wissen-brand-mark" className="flex w-fit flex-col">
          <img src={documindLoginLogo} alt="Documind" className="h-20 w-auto xl:h-24" />

          {/* Right margin lines the badge's edge up with the end of "Documind" (x=341 of the 348×72 SVG). */}
          <div className="mr-[8px] inline-flex w-fit items-center self-end rounded-md bg-white px-2.5 py-1 shadow-sm xl:mr-[9px]">
            <img src={wissenLogo} alt="Wissen Technology" className="h-4 w-auto xl:h-5" />
          </div>
        </div>

        <div className="flex flex-1 flex-col justify-start gap-7 pb-10 pt-12 xl:pt-16">
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
