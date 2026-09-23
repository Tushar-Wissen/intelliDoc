import axios from 'axios';

const WORKSPACE_ID = 'ws_001';
const FILE_TAGS = ['policy', 'compliance', 'finance', 'legal', 'operations'];

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
      .finally(() => {
        inFlightRequest = null;
      });
  }

  return inFlightRequest;
}

export function invalidateDocumentFoldersCache() {
  documentsCache = null;
}

export async function fetchDocumentFolders({ apiBaseUrl = '', page = 1, pageSize = 12 } = {}) {
  const documents = await loadWorkspaceDocuments(apiBaseUrl);

  const start = (page - 1) * pageSize;
  const items = documents.slice(start, start + pageSize).map(adaptDocumentToFolder);
  const hasMore = start + pageSize < documents.length;

  return { items, hasMore, total: documents.length };
}
