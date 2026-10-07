import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, ChevronRight, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { TOUR_STEPS } from '@/components/onboarding/tour-steps';
import { cn } from '@/lib/utils';

const VIEWPORT_MARGIN = 16;
const CARD_GAP = 14;
const SPOTLIGHT_PADDING = 6;
const MOBILE_BREAKPOINT = 640;
// How long to keep looking for a step's target after it opens (e.g. while a page or its data loads).
const TARGET_WAIT_MS = 2500;
const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])';

const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

function findVisibleTarget(selectors = []) {
  for (const selector of selectors) {
    for (const element of document.querySelectorAll(selector)) {
      const rect = element.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) return element;
    }
  }
  return null;
}

function toSpotlightRect(element) {
  const rect = element.getBoundingClientRect();
  // Keep the cut-out inside the target's region (e.g. the sidebar, marked data-tour-bounds) so its
  // padding never uncovers a strip of the neighbouring area, and inside the viewport so a very
  // tall target (e.g. the chat panel) still reads as a cut-out.
  const bounds = element.closest('[data-tour-bounds]')?.getBoundingClientRect() ?? {
    top: 0,
    left: 0,
    bottom: window.innerHeight,
    right: window.innerWidth,
  };
  const top = Math.max(rect.top - SPOTLIGHT_PADDING, bounds.top + 2, 2);
  const left = Math.max(rect.left - SPOTLIGHT_PADDING, bounds.left + 2, 2);
  const bottom = Math.min(rect.bottom + SPOTLIGHT_PADDING, bounds.bottom - 2, window.innerHeight - 2);
  const right = Math.min(rect.right + SPOTLIGHT_PADDING, bounds.right - 2, window.innerWidth - 2);
  return { top, left, width: Math.max(right - left, 0), height: Math.max(bottom - top, 0) };
}

const sameRect = (a, b) =>
  a === b ||
  (a && b && a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height);

const clamp = (value, min, max) => Math.min(Math.max(value, min), Math.max(min, max));

// Places the card next to the spotlight on the side with room for it, so it never covers the
// highlighted element. Phones dock it to the screen edge furthest from the target instead.
function placeCard(rect, card) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const centred = { top: (vh - card.height) / 2, left: (vw - card.width) / 2 };
  if (!rect) return centred;

  const maxLeft = vw - card.width - VIEWPORT_MARGIN;
  const maxTop = vh - card.height - VIEWPORT_MARGIN;

  if (vw < MOBILE_BREAKPOINT) {
    const roomBelow = vh - (rect.top + rect.height);
    return { top: roomBelow >= rect.top ? maxTop : VIEWPORT_MARGIN, left: (vw - card.width) / 2 };
  }

  const alignX = clamp(rect.left + rect.width / 2 - card.width / 2, VIEWPORT_MARGIN, maxLeft);
  const alignY = clamp(rect.top + rect.height / 2 - card.height / 2, VIEWPORT_MARGIN, maxTop);
  const options = [
    { top: rect.top + rect.height + CARD_GAP, left: alignX },
    { top: rect.top - CARD_GAP - card.height, left: alignX },
    { top: alignY, left: rect.left - CARD_GAP - card.width },
    { top: alignY, left: rect.left + rect.width + CARD_GAP },
  ];
  const fits = options.find(
    (o) => o.top >= VIEWPORT_MARGIN && o.top <= maxTop && o.left >= VIEWPORT_MARGIN && o.left <= maxLeft
  );
  return fits ?? { top: maxTop, left: alignX };
}

// Follows a step's target element: finds it (waiting briefly if the page is still rendering),
// scrolls it into view, and keeps its on-screen rect up to date while scrolling or resizing.
function useTargetRect(step) {
  const [rect, setRect] = useState(null);

  useEffect(() => {
    setRect(null);
    if (!step.targets?.length) return undefined;

    let element = null;
    let frame = 0;
    let resizeObserver = null;
    const startedAt = performance.now();

    const measure = () => {
      frame = 0;
      if (element && !element.isConnected) element = null;
      if (!element) {
        element = findVisibleTarget(step.targets);
        if (!element) {
          if (performance.now() - startedAt < TARGET_WAIT_MS) frame = requestAnimationFrame(measure);
          return;
        }
        element.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
        resizeObserver?.disconnect();
        resizeObserver = new ResizeObserver(schedule);
        resizeObserver.observe(element);
      }
      const next = toSpotlightRect(element);
      setRect((prev) => (sameRect(prev, next) ? prev : next));
    };
    function schedule() {
      if (!frame) frame = requestAnimationFrame(measure);
    }

    measure();
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, true);
    return () => {
      cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, true);
    };
  }, [step]);

  return rect;
}

function StepProgress({ index, total }) {
  return (
    <div className="flex items-center gap-1" aria-hidden="true">
      {Array.from({ length: total }).map((_, idx) => (
        <span
          key={idx}
          className={cn(
            'h-1.5 rounded-full transition-all duration-300 motion-reduce:transition-none',
            idx === index ? 'w-5 bg-wissen-navy dark:bg-wissen-navy-light' : 'w-1.5',
            idx < index && 'bg-wissen-navy/50 dark:bg-wissen-navy-light/50',
            idx > index && 'bg-muted-foreground/25'
          )}
        />
      ))}
    </div>
  );
}

export default function OnboardingTour({ onEnd }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [index, setIndex] = useState(0);
  const [cardPosition, setCardPosition] = useState(null);
  const cardRef = useRef(null);
  const titleId = useId();
  const descriptionId = useId();

  const step = TOUR_STEPS[index];
  const total = TOUR_STEPS.length;
  const isFirst = index === 0;
  const isLast = index === total - 1;
  const featureCount = total - 2; // everything between the welcome and completion screens
  const rect = useTargetRect(step);
  const Icon = step.icon;

  const goTo = useCallback((next) => setIndex(clamp(next, 0, total - 1)), [total]);
  const skip = useCallback(() => onEnd('skipped'), [onEnd]);
  const finish = useCallback(() => onEnd('completed'), [onEnd]);
  const next = useCallback(() => (isLast ? finish() : goTo(index + 1)), [isLast, finish, goTo, index]);
  const previous = useCallback(() => goTo(index - 1), [goTo, index]);

  // Bring up the page this step's feature lives on.
  useEffect(() => {
    if (step.route && pathname !== step.route.path) navigate(step.route.path, { state: step.route.state });
  }, [step, pathname, navigate]);

  // Keep the card beside the spotlight; re-place when the step, target or viewport changes.
  useLayoutEffect(() => {
    const place = () => {
      const card = cardRef.current;
      if (!card) return;
      const next = placeCard(rect, { width: card.offsetWidth, height: card.offsetHeight });
      setCardPosition((prev) => (prev && prev.top === next.top && prev.left === next.left ? prev : next));
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [rect, index]);

  // While the tour is open the page behind it is inert: not clickable, focusable or read aloud.
  // Focus returns to where it was once the tour ends.
  useEffect(() => {
    const previouslyFocused = document.activeElement;
    const appRoot = document.getElementById('root');
    appRoot?.setAttribute('inert', '');
    appRoot?.setAttribute('aria-hidden', 'true');
    return () => {
      appRoot?.removeAttribute('inert');
      appRoot?.removeAttribute('aria-hidden');
      if (previouslyFocused instanceof HTMLElement && previouslyFocused.isConnected) previouslyFocused.focus();
    };
  }, []);

  // Move focus to the card on every step so screen readers announce its title and description.
  useEffect(() => {
    cardRef.current?.focus({ preventScroll: true });
  }, [index]);

  const handleKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      skip();
    } else if (event.key === 'ArrowRight' && !isLast) {
      event.preventDefault();
      next();
    } else if (event.key === 'ArrowLeft' && !isFirst) {
      event.preventDefault();
      previous();
    } else if (event.key === 'Tab') {
      // Keep keyboard focus inside the tour.
      const focusable = [...cardRef.current.querySelectorAll(FOCUSABLE)];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === cardRef.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  };

  const openQuickLink = (link) => {
    finish();
    navigate(link.to, { state: link.state });
  };

  // With no target the spotlight collapses to a point mid-screen, leaving a plain dimmed backdrop.
  const spotlight = rect ?? { top: window.innerHeight / 2, left: window.innerWidth / 2, width: 0, height: 0 };
  const showHiddenNote = step.targets?.length && !rect && step.hiddenTargetNote;

  return createPortal(
    <div className="fixed inset-0 z-[100]" data-testid="onboarding-tour">
      {/* Swallows clicks so the page can't be used mid-tour. */}
      <div className="absolute inset-0" aria-hidden="true" />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute rounded-xl transition-all duration-300 ease-out motion-reduce:transition-none"
        style={{
          top: spotlight.top,
          left: spotlight.left,
          width: spotlight.width,
          height: spotlight.height,
          boxShadow: '0 0 0 9999px rgb(15 23 42 / 0.62)',
        }}
      >
        {/* Outline drawn inside the cut-out so it stays visible on dark areas like the sidebar
            and never spills onto neighbouring content. */}
        <div
          className={cn(
            'absolute inset-0 rounded-xl bg-white/[0.06] transition-opacity duration-300 motion-reduce:transition-none',
            rect ? 'opacity-100' : 'opacity-0'
          )}
          style={{ boxShadow: 'inset 0 0 0 2px rgb(255 255 255 / 0.95), inset 0 0 0 5px rgb(129 140 248 / 0.45)' }}
        />
      </div>

      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        aria-roledescription="tutorial step"
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className={cn(
          'absolute w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-2xl outline-none',
          'transition-[top,left,opacity] duration-300 ease-out motion-reduce:transition-none',
          (step.kind === 'welcome' || step.kind === 'complete') && 'w-[min(26rem,calc(100vw-2rem))]',
          cardPosition ? 'opacity-100' : 'opacity-0'
        )}
        style={cardPosition ?? { top: 0, left: 0 }}
      >
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-wissen-navy/10 text-wissen-navy dark:text-wissen-navy-light">
            <Icon className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1 pt-0.5">
            {!step.kind && (
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Step {index} of {featureCount}
              </p>
            )}
            <h2 id={titleId} className="text-base font-semibold leading-snug tracking-tight text-foreground">
              {step.title}
            </h2>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="-mr-2 -mt-2 h-8 w-8 shrink-0 rounded-full text-muted-foreground"
            onClick={isLast ? finish : skip}
            aria-label="Close tutorial"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>

        <div id={descriptionId} className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
          <p>{step.description}</p>
          {step.highlights && (
            <ul className="space-y-1.5">
              {step.highlights.map((item) => (
                <li key={item} className="flex items-start gap-2 text-foreground">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
          )}
          {showHiddenNote && <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs">{step.hiddenTargetNote}</p>}
        </div>

        {step.quickLinks && (
          <nav aria-label="Get started" className="mt-3 flex flex-col gap-1.5">
            {step.quickLinks.map((link) => (
              <button
                key={link.to}
                type="button"
                onClick={() => openQuickLink(link)}
                className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-left text-sm font-medium text-foreground transition-colors hover:border-wissen-navy/40 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wissen-navy/40"
              >
                {link.label}
                <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              </button>
            ))}
            <p className="pt-1 text-xs text-muted-foreground">
              You can replay this tour any time from your account menu.
            </p>
          </nav>
        )}

        {!step.kind && (
          <div className="mt-5">
            <StepProgress index={index - 1} total={featureCount} />
          </div>
        )}

        <div className={cn('flex items-center gap-2', step.kind ? 'mt-5' : 'mt-3')}>
          {!isLast && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="-ml-2 text-muted-foreground"
              onClick={skip}
              aria-label="Skip tutorial"
            >
              {isFirst ? 'Skip tutorial' : 'Skip'}
            </Button>
          )}
          <div className="ml-auto flex items-center gap-2">
            {!isFirst && (
              <Button type="button" variant="outline" size="sm" onClick={previous} aria-label="Previous step">
                <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                Back
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              className="bg-wissen-navy text-white hover:bg-wissen-navy/90"
              onClick={next}
              aria-label={isLast ? 'Finish tutorial' : isFirst ? 'Start tour' : 'Next step'}
            >
              {isLast ? 'Finish' : isFirst ? 'Start tour' : 'Next'}
              {!isLast && <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
