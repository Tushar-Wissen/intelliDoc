import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

function DonutChart({ percentage }) {
  const R = 38;
  const STROKE = 9;
  const C = 2 * Math.PI * R;
  const filled = (percentage / 100) * C;

  return (
    <svg width="104" height="104" viewBox="0 0 104 104" style={{ flexShrink: 0 }}>
      {/* Track ring */}
      <circle cx="52" cy="52" r={R} fill="none" stroke="#d1fae5" strokeWidth={STROKE} />
      {/* Progress ring — starts at 12 o'clock */}
      <circle
        cx="52"
        cy="52"
        r={R}
        fill="none"
        stroke="#059669"
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeDasharray={`${filled} ${C}`}
        transform="rotate(-90 52 52)"
      />
      {/* Percentage */}
      <text x="52" y="48" textAnchor="middle" dominantBaseline="middle" fontSize="18" fontWeight="700" fill="currentColor">
        {percentage}%
      </text>
      {/* Label */}
      <text
        x="52"
        y="64"
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize="8.5"
        fontWeight="600"
        letterSpacing="0.06em"
        fill="currentColor"
        opacity="0.5"
      >
        ANSWERED
      </text>
    </svg>
  );
}

export function AiSuccessRateCard({
  percentage = 88,
  answeredCount = 412,
  totalCount = 468,
  weeklyChange = '+6%',
  unansweredTopic = '"Leave policy for contractors" — no matching document found. Consider uploading one.',
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">AI search success rate</CardTitle>
        <p className="text-xs text-muted-foreground mt-1">Last 7 days</p>
      </CardHeader>
      <CardContent className="pt-4 flex flex-col justify-between">
        <div className="flex items-center gap-6 mb-6">
          <DonutChart percentage={percentage} />
          <div className="flex flex-col justify-center">
            <p className="text-sm font-medium text-foreground mb-1">
              <span className="font-bold">{answeredCount}</span> of {totalCount} searches found a useful answer
            </p>
            <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
              {weeklyChange} <span className="font-normal text-muted-foreground">vs last week</span>
            </p>
          </div>
        </div>
        <div className="pt-4 border-t border-border">
          <p className="text-xs font-semibold mb-1 text-foreground">Top unanswered topic</p>
          <p className="text-xs text-muted-foreground leading-relaxed">{unansweredTopic}</p>
        </div>
      </CardContent>
    </Card>
  );
}
