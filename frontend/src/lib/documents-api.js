import axios from 'axios';

const WORKSPACE_ID = 'ws_001';
const FILE_TAGS = ['policy', 'compliance', 'finance', 'legal', 'operations'];

// Sample data shaped exactly like the real `/api/v1/workspaces/{id}/documents` response,
// used as a local fallback so the Workspace page has something to render when the backend
// isn't reachable. Remove once a real backend is wired up for good.
const DUMMY_DOCUMENTS = [
  {
    id: 'doc-legal-contracts',
    title: 'Legal Contracts',
    status: 'COMPLETED',
    files_count: 3,
    sections_count: 5,
    uploaded_date: '2026-09-18T10:00:00Z',
    files: [
      {
        files_number: 0,
        files_name: 'Master Services Agreement',
        children: [
          { sections_number: 0, sections_name: 'Scope of Services', page_start: 1, page_end: 4, vectors: 18 },
          { sections_number: 1, sections_name: 'Termination', page_start: 5, page_end: 6, vectors: 9 },
        ],
      },
      {
        files_number: 1,
        files_name: 'NDA Template',
        children: [
          { sections_number: 0, sections_name: 'Confidentiality Obligations', page_start: 1, page_end: 2, vectors: 6 },
        ],
      },
      { files_number: 2, files_name: 'Vendor Contract Q4', children: [] },
    ],
  },
  {
    id: 'doc-research-papers',
    title: 'Research Papers',
    status: 'COMPLETED',
    files_count: 2,
    sections_count: 4,
    uploaded_date: '2026-09-14T10:00:00Z',
    files: [
      {
        files_number: 0,
        files_name: 'Market Analysis 2026',
        children: [
          { sections_number: 0, sections_name: 'Executive Summary', page_start: 1, page_end: 2, vectors: 11 },
          { sections_number: 1, sections_name: 'Methodology', page_start: 3, page_end: 5, vectors: 14 },
        ],
      },
      {
        files_number: 1,
        files_name: 'Competitor Landscape',
        children: [
          { sections_number: 0, sections_name: 'Key Players', page_start: 1, page_end: 3, vectors: 10 },
          { sections_number: 1, sections_name: 'SWOT Analysis', page_start: 4, page_end: 6, vectors: 12 },
        ],
      },
    ],
  },
  {
    id: 'doc-product-specs',
    title: 'Product Specs',
    status: 'PROCESSING',
    files_count: 2,
    sections_count: 0,
    uploaded_date: '2026-09-20T10:00:00Z',
    files: [
      { files_number: 0, files_name: 'API Design Doc', children: [] },
      { files_number: 1, files_name: 'Mobile App Wireframes', children: [] },
    ],
  },
  {
    id: 'doc-financial-reports',
    title: 'Financial Reports',
    status: 'COMPLETED',
    files_count: 3,
    sections_count: 6,
    uploaded_date: '2026-09-05T10:00:00Z',
    files: [
      {
        files_number: 0,
        files_name: 'Q3 Financial Performance Report',
        children: [
          { sections_number: 0, sections_name: 'Revenue Summary', page_start: 1, page_end: 2, vectors: 15 },
          { sections_number: 1, sections_name: 'Expense Breakdown', page_start: 3, page_end: 4, vectors: 13 },
        ],
      },
      {
        files_number: 1,
        files_name: 'Annual Budget Forecast',
        children: [
          { sections_number: 0, sections_name: 'Forecast Assumptions', page_start: 1, page_end: 2, vectors: 8 },
          { sections_number: 1, sections_name: 'Department Allocations', page_start: 3, page_end: 5, vectors: 16 },
        ],
      },
      { files_number: 2, files_name: 'Expense Reimbursements', children: [] },
    ],
  },
  {
    id: 'doc-hr-policies',
    title: 'HR Policies',
    status: 'COMPLETED',
    files_count: 1,
    sections_count: 3,
    uploaded_date: '2026-08-28T10:00:00Z',
    files: [
      {
        files_number: 0,
        files_name: 'Employee Handbook 2026',
        children: [
          { sections_number: 0, sections_name: 'Code of Conduct', page_start: 1, page_end: 3, vectors: 9 },
          { sections_number: 1, sections_name: 'Leave Policy', page_start: 4, page_end: 6, vectors: 11 },
          { sections_number: 2, sections_name: 'Benefits Overview', page_start: 7, page_end: 9, vectors: 10 },
        ],
      },
    ],
  },
  {
    id: 'doc-vendor-agreements',
    title: 'Vendor Agreements',
    status: 'COMPLETED',
    files_count: 2,
    sections_count: 2,
    uploaded_date: '2026-08-20T10:00:00Z',
    files: [
      {
        files_number: 0,
        files_name: 'Cloud Hosting Agreement',
        children: [{ sections_number: 0, sections_name: 'Service Level Terms', page_start: 1, page_end: 3, vectors: 7 }],
      },
      { files_number: 1, files_name: 'Office Supplies Contract', children: [] },
    ],
  },
  {
    id: 'doc-marketing-assets',
    title: 'Marketing Assets',
    status: 'PROCESSING',
    files_count: 1,
    sections_count: 0,
    uploaded_date: '2026-09-21T10:00:00Z',
    files: [{ files_number: 0, files_name: 'Brand Guidelines Draft', children: [] }],
  },
  {
    id: 'doc-onboarding',
    title: 'Onboarding Docs',
    status: 'COMPLETED',
    files_count: 2,
    sections_count: 3,
    uploaded_date: '2026-08-10T10:00:00Z',
    files: [
      {
        files_number: 0,
        files_name: 'New Hire Checklist',
        children: [{ sections_number: 0, sections_name: 'Week One Tasks', page_start: 1, page_end: 2, vectors: 6 }],
      },
      {
        files_number: 1,
        files_name: 'IT Setup Guide',
        children: [
          { sections_number: 0, sections_name: 'Account Provisioning', page_start: 1, page_end: 2, vectors: 5 },
          { sections_number: 1, sections_name: 'Hardware Requests', page_start: 3, page_end: 3, vectors: 4 },
        ],
      },
    ],
  },
];

function adaptDocumentToFolder(doc) {
  const files = doc.files || [];

  return {
    id: doc.id,
    name: doc.title,
    status: doc.status,
    filesCount: Number(doc.files_count) || files.length,
    sectionsCount: Number(doc.sections_count) || 0,
    createdAt: doc.uploaded_date,
    updatedAt: doc.uploaded_date,
    files: files.map((file, fileIndex) => ({
      id: `${doc.id}-file-${file.files_number ?? fileIndex}`,
      name: file.files_name,
      tag: FILE_TAGS[Number(file.files_number ?? fileIndex) % FILE_TAGS.length],
      hasUpdates: false,
      sections: (file.children || []).map((section, sectionIndex) => ({
        id: `${doc.id}-section-${section.sections_number ?? sectionIndex}`,
        name: section.sections_name,
        metric: section.sections_number,
        pages:
          section.page_start != null && section.page_end != null
            ? `${section.page_start}-${section.page_end}`
            : undefined,
        vectors: section.vectors,
      })),
    })),
  };
}

let documentsCache = null;
let inFlightRequest = null;

async function loadWorkspaceDocuments(apiBaseUrl) {
  if (documentsCache) return documentsCache;

  if (!inFlightRequest) {
    inFlightRequest = axios
      .get(`${apiBaseUrl}/api/v1/workspaces/${WORKSPACE_ID}/documents`)
      .then((res) => {
        if (res.data?.isError) {
          throw new Error(res.data?.message || 'Failed to load documents.');
        }
        documentsCache = res.data?.data ?? [];
        return documentsCache;
      })
      .catch((err) => {
        console.warn('Backend unreachable, showing sample workspace data instead:', err.message);
        documentsCache = DUMMY_DOCUMENTS;
        return documentsCache;
      })
      .finally(() => {
        inFlightRequest = null;
      });
  }

  return inFlightRequest;
}

export function invalidateDocumentFoldersCache() {
  documentsCache = null;
}

// Mirrors a locally-added file into the shared cache (mutating the same document objects
// every fetch returns) so folder-tree consumers that fetch independently — the sidebar,
// a fresh Dashboard load — see it too, without needing a real "add file to folder" endpoint.
export function addFileToCachedDocument(folderId, fileName) {
  const doc = documentsCache?.find((d) => d.id === folderId);
  if (!doc) return;
  doc.files = doc.files || [];
  doc.files.push({ files_number: doc.files.length, files_name: fileName, children: [] });
  doc.files_count = doc.files.length;
}

// Keeps a renamed folder's title consistent for future fetches (sidebar, fresh page loads).
export function updateCachedDocumentTitle(folderId, title) {
  const doc = documentsCache?.find((d) => d.id === folderId);
  if (doc) doc.title = title;
}

// Mirrors a locally-deleted folder out of the shared cache for the same reason.
export function removeCachedDocument(folderId) {
  if (!documentsCache) return;
  documentsCache = documentsCache.filter((d) => d.id !== folderId);
}

export async function fetchDocumentFolders({ apiBaseUrl = '', page = 1, pageSize = 12 } = {}) {
  const documents = await loadWorkspaceDocuments(apiBaseUrl);

  const start = (page - 1) * pageSize;
  const items = documents.slice(start, start + pageSize).map(adaptDocumentToFolder);
  const hasMore = start + pageSize < documents.length;

  return { items, hasMore, total: documents.length };
}
