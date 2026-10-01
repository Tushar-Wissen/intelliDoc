import React from 'react';
import { ChevronRight } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DashboardEmptyState } from '@/components/dashboard/dashboard-empty-state';

const MOCK_DOCUMENTS = [
  { id: 1, name: 'Employee Handbook 2026.pdf', category: 'HR', views: 86, maxViews: 100 },
  { id: 2, name: 'Security Policy v4.pdf', category: 'Compliance', views: 64, maxViews: 100 },
  { id: 3, name: 'Q3 Client Onboarding Guide.pdf', category: 'Operations', views: 51, maxViews: 100 },
  { id: 4, name: 'Sprint Capacity Plan.xlsx', category: 'Engineering', views: 38, maxViews: 100 },
  { id: 5, name: 'Vendor Contract - Renewal.docx', category: 'Legal', views: 27, maxViews: 100 },
];

function LoadingRows() {
  return (
    <div className="flex flex-col gap-1" aria-busy="true">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 py-2.5">
          <div className="h-3 w-4 animate-pulse rounded bg-muted" />
          <div className="flex flex-1 flex-col gap-1.5">
            <div className="h-3 w-3/5 animate-pulse rounded bg-muted" />
            <div className="h-2.5 w-1/4 animate-pulse rounded bg-muted" />
          </div>
          <div className="hidden h-2 w-36 animate-pulse rounded-full bg-muted sm:block" />
        </div>
      ))}
    </div>
  );
}

export function MostAccessedCard({ documents = MOCK_DOCUMENTS, loading = false, onViewAll }) {
  const isEmpty = !loading && documents.length === 0;

  return (
    <Card className="flex flex-col lg:col-span-2">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div>
          <CardTitle className="text-base font-semibold">Most accessed documents</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">Views in the last 30 days</p>
        </div>
        {!isEmpty && (
          <button
            type="button"
            onClick={onViewAll}
            className="flex items-center text-xs font-medium text-wissen-navy hover:underline dark:text-wissen-navy-light"
          >
            View all <ChevronRight className="ml-1 h-3 w-3" />
          </button>
        )}
      </CardHeader>
      <CardContent className="flex flex-1 flex-col pt-2">
        {loading ? (
          <LoadingRows />
        ) : isEmpty ? (
          <DashboardEmptyState
            title="No Documents Available"
            description="Your most accessed documents will appear here once you start working with them."
          />
        ) : (
          <div className="flex flex-col gap-1">
            {documents.map((item, index) => {
              const maxViews = item.maxViews ?? 100;
              const views = item.views ?? 0;
              const barData = [{ name: item.name, views, rest: maxViews - views }];
              return (
                <div key={item.id} className="flex items-center gap-4 rounded-lg px-2 py-2 transition-colors hover:bg-accent/40">
                  <div className="w-4 text-xs font-medium text-muted-foreground text-center">{index + 1}</div>
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{item.name}</p>
                    <p className="text-[11px] text-muted-foreground">{item.folder || item.category}</p>
                  </div>

                  <div className="w-36 hidden sm:block" style={{ height: 10 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={barData}
                        layout="vertical"
                        barSize={8}
                        margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
                      >
                        <XAxis type="number" domain={[0, maxViews]} hide />
                        <YAxis type="category" dataKey="name" hide />
                        <Bar dataKey="views" fill="#1D305A" radius={[4, 0, 0, 4]} stackId="a" />
                        <Bar dataKey="rest" fill="#e2e8f0" radius={[0, 4, 4, 0]} stackId="a" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="w-6 text-right text-sm font-medium text-muted-foreground">{views}</div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
