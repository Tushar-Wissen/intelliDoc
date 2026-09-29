import { FileText, FileSpreadsheet, FileImage, Presentation, File } from 'lucide-react';

const PDF = { label: 'PDF', Icon: FileText, className: 'bg-red-500/10 text-red-600 dark:text-red-400' };
const DOCX = { label: 'DOCX', Icon: FileText, className: 'bg-blue-500/10 text-blue-600 dark:text-blue-400' };
const XLSX = { label: 'XLSX', Icon: FileSpreadsheet, className: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' };
const PPTX = { label: 'PPTX', Icon: Presentation, className: 'bg-orange-500/10 text-orange-600 dark:text-orange-400' };
const TXT = { label: 'TXT', Icon: FileText, className: 'bg-slate-500/10 text-slate-600 dark:text-slate-400' };
const IMAGE = { Icon: FileImage, className: 'bg-violet-500/10 text-violet-600 dark:text-violet-400' };

const BY_EXTENSION = {
  PDF,
  DOC: { ...DOCX, label: 'DOC' },
  DOCX,
  XLS: { ...XLSX, label: 'XLS' },
  XLSX,
  CSV: { ...XLSX, label: 'CSV' },
  PPT: { ...PPTX, label: 'PPT' },
  PPTX,
  TXT,
  PNG: { ...IMAGE, label: 'PNG' },
  JPG: { ...IMAGE, label: 'JPG' },
  JPEG: { ...IMAGE, label: 'JPEG' },
};

export function getFileExtension(fileName = '') {
  const dot = fileName.lastIndexOf('.');
  return dot === -1 ? '' : fileName.slice(dot + 1).toUpperCase();
}

// Icon, label and color classes for a file, keyed off its extension.
export function getFileTypeMeta(fileName) {
  const ext = getFileExtension(fileName);
  return BY_EXTENSION[ext] ?? { label: ext || 'FILE', Icon: File, className: 'bg-muted text-muted-foreground' };
}
