const DOCUMENT_TITLES = [
  'chandra Employee Policy Folder',
  'Vendor Compliance Folder',
  'Q3 Financial Reporting Folder',
  'Client Onboarding Folder',
  'Engineering Design Folder',
  'Legal Contracts Folder',
];

const STATUSES = ['COMPLETED', 'PROCESSING', 'FAILED'];

const FILE_TEMPLATES = [
  {
    files_name: 'Employee_policy_introduction.pdf',
    children: ['Overview', 'Details'],
  },
  {
    files_name: 'Employee_details.pdf',
    children: ['Personal Information', 'Employment Information'],
  },
  {
    files_name: 'Employee_benefits.pdf',
    children: ['Health Insurance', 'Life Insurance'],
  },
  {
    files_name: 'Compliance_checklist.pdf',
    children: ['Audit Trail', 'Sign-off'],
  },
  {
    files_name: 'Vendor_agreement.pdf',
    children: ['Terms & Conditions', 'Renewal Schedule'],
  },
];

const DAY_MS = 24 * 60 * 60 * 1000;

function seededRandom(seed) {
  let value = seed % 2147483647;
  if (value <= 0) value += 2147483646;
  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}

function randomHex(rand, length) {
  let hex = '';
  for (let i = 0; i < length; i += 1) {
    hex += Math.floor(rand() * 16).toString(16);
  }
  return hex;
}

function buildFiles(rand, fileCount) {
  const files = [];
  for (let i = 0; i < fileCount; i += 1) {
    const template = FILE_TEMPLATES[(i + Math.floor(rand() * FILE_TEMPLATES.length)) % FILE_TEMPLATES.length];
    const filesNumber = String(i + 1);
    let pageCursor = 1;
    files.push({
      files_number: filesNumber,
      files_name: template.files_name,
      children: template.children.map((sectionName, sectionIndex) => {
        const pageStart = pageCursor;
        const pageEnd = pageStart + 1 + Math.floor(rand() * 5);
        pageCursor = pageEnd + 1;
        return {
          sections_number: `${filesNumber}.${sectionIndex + 1}`,
          sections_name: sectionName,
          page_start: pageStart,
          page_end: pageEnd,
          vectors: 60 + Math.floor(rand() * 40) * 10,
        };
      }),
    });
  }
  return files;
}

function buildDocument(index) {
  const rand = seededRandom(index + 1);
  const name = DOCUMENT_TITLES[index % DOCUMENT_TITLES.length];
  const suffix = Math.floor(index / DOCUMENT_TITLES.length);
  const title = suffix > 0 ? `${name} ${suffix + 1}` : name;
  const status = STATUSES[Math.floor(rand() * STATUSES.length)];
  const fileCount = 2 + Math.floor(rand() * 2);
  const files = buildFiles(rand, fileCount);
  const sectionsCount = files.reduce((sum, file) => sum + file.children.length, 0);
  const uploadedDaysAgo = Math.floor(rand() * 120);

  return {
    id: `doc_${randomHex(rand, 12)}`,
    title,
    status,
    uploaded_date: new Date(Date.now() - uploadedDaysAgo * DAY_MS).toISOString(),
    files_count: String(files.length),
    sections_count: String(sectionsCount),
    files,
  };
}

export function getMockDocumentDetailsResponse(count = 2) {
  return {
    message: 'Document details retrieved successfully',
    data: Array.from({ length: count }, (_, index) => buildDocument(index)),
    isError: false,
  };
}

export function fetchMockDocumentDetails({ count = 2, delay = 400 } = {}) {
  return new Promise((resolve) => {
    setTimeout(() => resolve(getMockDocumentDetailsResponse(count)), delay);
  });
}

const FILE_TAGS = ['policy', 'compliance', 'finance', 'legal', 'operations'];

function adaptDocumentToFolder(doc) {
  return {
    id: doc.id,
    name: doc.title,
    status: doc.status,
    filesCount: Number(doc.files_count),
    sectionsCount: Number(doc.sections_count),
    createdAt: doc.uploaded_date,
    updatedAt: doc.uploaded_date,
    files: doc.files.map((file) => ({
      id: `${doc.id}-file-${file.files_number}`,
      name: file.files_name,
      tag: FILE_TAGS[Number(file.files_number) % FILE_TAGS.length],
      hasUpdates: false,
      sections: file.children.map((section) => ({
        id: `${doc.id}-section-${section.sections_number}`,
        name: section.sections_name,
        metric: section.sections_number,
        pages: `${section.page_start}-${section.page_end}`,
        vectors: section.vectors,
      })),
    })),
  };
}

const DOCUMENT_POOL_SIZE = 24;
const DOCUMENT_POOL = Array.from({ length: DOCUMENT_POOL_SIZE }, (_, index) => buildDocument(index));

export function fetchMockDocumentFolders({ page = 1, pageSize = 12, evaluatedOnly = false, delay = 400 } = {}) {
  const source = evaluatedOnly
    ? DOCUMENT_POOL.filter((doc) => doc.status === 'COMPLETED')
    : DOCUMENT_POOL;

  const start = (page - 1) * pageSize;
  const items = source.slice(start, start + pageSize).map(adaptDocumentToFolder);
  const hasMore = start + pageSize < source.length;

  return new Promise((resolve) => {
    setTimeout(() => resolve({ items, hasMore, total: source.length }), delay);
  });
}
