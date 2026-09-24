import React from 'react';
import { FileText, MoreHorizontal, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const MOCK_FILES = [
  {
    id: 1,
    name: 'Q3 Client Onboarding Guide.pdf',
    type: 'PDF',
    folder: 'Operations',
    userInitials: 'JD',
    time: '2 hours ago',
    iconBg: 'bg-wissen-navy/10',
    iconFg: 'text-wissen-navy',
    typeBg: 'bg-wissen-navy/10 text-wissen-navy',
    userBg: 'bg-violet-100 text-violet-700',
  },
  {
    id: 2,
    name: 'Vendor Contract - Renewal.docx',
    type: 'DOCX',
    folder: 'Legal',
    userInitials: 'AK',
    time: 'Yesterday',
    iconBg: 'bg-blue-500/10',
    iconFg: 'text-blue-600',
    typeBg: 'bg-blue-500/10 text-blue-700',
    userBg: 'bg-blue-100 text-blue-700',
  },
  {
    id: 3,
    name: 'Sprint Capacity Plan.xlsx',
    type: 'XLSX',
    folder: 'Engineering',
    userInitials: 'JD',
    time: 'Yesterday',
    iconBg: 'bg-orange-500/10',
    iconFg: 'text-orange-600',
    typeBg: 'bg-orange-500/10 text-orange-700',
    userBg: 'bg-violet-100 text-violet-700',
  },
  {
    id: 4,
    name: 'Security Policy v4.pdf',
    type: 'PDF',
    folder: 'Compliance',
    userInitials: 'RS',
    time: 'Sep 21',
    iconBg: 'bg-wissen-navy/10',
    iconFg: 'text-wissen-navy',
    typeBg: 'bg-wissen-navy/10 text-wissen-navy',
    userBg: 'bg-amber-100 text-amber-700',
  },
];

export function RecentDocumentsTable({ files = MOCK_FILES, onOpenFile }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-4">
        <CardTitle className="text-base font-semibold">Recent documents</CardTitle>
        <button className="flex items-center text-xs font-medium text-wissen-navy hover:underline dark:text-wissen-navy-light">
          View all <ChevronRight className="ml-1 h-3 w-3" />
        </button>
      </CardHeader>
      <CardContent className="pt-0 p-0">
        <div className="w-full overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="py-3 px-6 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Name</th>
                <th className="py-3 px-6 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Type</th>
                <th className="py-3 px-6 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Folder</th>
                <th className="py-3 px-6 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Modified By</th>
                <th className="py-3 px-6 text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {files.map((file) => (
                <tr
                  key={file.id}
                  className="hover:bg-accent/30 transition-colors group cursor-pointer"
                  onClick={() => onOpenFile?.(file)}
                >
                  <td className="py-3 px-6">
                    <div className="flex items-center gap-3">
                      <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', file.iconBg)}>
                        <FileText className={cn('h-4 w-4', file.iconFg)} />
                      </span>
                      <span className="font-medium text-foreground">{file.name}</span>
                    </div>
                  </td>
                  <td className="py-3 px-6">
                    <span className={cn('px-2 py-0.5 rounded text-[10px] font-bold tracking-wider', file.typeBg)}>
                      {file.type}
                    </span>
                  </td>
                  <td className="py-3 px-6 text-muted-foreground">{file.folder}</td>
                  <td className="py-3 px-6">
                    <div className="flex items-center gap-2">
                      <span className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold', file.userBg)}>
                        {file.userInitials}
                      </span>
                      <span className="text-muted-foreground text-xs">{file.time}</span>
                    </div>
                  </td>
                  <td className="py-3 px-6 text-right">
                    <button
                      className="p-1 rounded-md text-muted-foreground hover:bg-muted opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
