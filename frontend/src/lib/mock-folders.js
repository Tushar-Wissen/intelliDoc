const FOLDER_NAMES = [
  'Q3 Financial Reports',
  'Legal Contracts',
  'HR Onboarding',
  'Marketing Assets',
  'Client Proposals',
  'Engineering Specs',
  'Vendor Agreements',
  'Research Papers',
  'Product Roadmaps',
  'Compliance Audits',
  'Client Invoices',
  'Meeting Notes',
  'Project Alpha',
  'Project Beta',
  'Design Reviews',
  'Training Materials',
  'Policy Documents',
  'Board Presentations',
  'Tax Filings',
  'Insurance Claims',
  'Customer Feedback',
  'Sales Playbooks',
  'Brand Guidelines',
  'Risk Assessments',
];

const STATUSES = ['ACTIVE', 'COMPLETED', 'ARCHIVED'];

const FILE_NAMES = [
  'Q3_Annual_Report',
  'TechSpec_v2',
  'Risk_Matrix_2025',
  'Board_Minutes_Sept',
  'Vendor_Agreement_Draft',
  'Client_Onboarding_Guide',
  'Audit_Summary_Q2',
  'Product_Roadmap_2025',
  'Incident_Report_0421',
  'Budget_Forecast_FY25',
  'Design_Review_Notes',
  'Compliance_Checklist',
];

export const FILE_TAGS = ['finance', 'technical', 'compliance', 'governance', 'legal', 'product', 'security', 'operations'];

const SECTION_NAMES = [
  'Overview',
  'Architecture',
  'API Reference',
  'Database Schema',
  'Security Model',
  'Risk Assessment',
  'KPIs & Metrics',
  'Executive Summary',
  'Timeline',
  'Appendix',
];

const POOL_SIZE = 54;
const DAY_MS = 24 * 60 * 60 * 1000;

function seededRandom(seed) {
  let value = seed % 2147483647;
  if (value <= 0) value += 2147483646;
  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}

function buildSection(rand, fileId, index) {
  return {
    id: `${fileId}-section-${index}`,
    name: SECTION_NAMES[index % SECTION_NAMES.length],
    metric: `${50 + Math.floor(rand() * 450)}v`,
  };
}

function buildFile(rand, folderId, index) {
  const fileId = `${folderId}-file-${index}`;
  const sectionsCount = 2 + Math.floor(rand() * 4);

  return {
    id: fileId,
    name: FILE_NAMES[Math.floor(rand() * FILE_NAMES.length)],
    tag: FILE_TAGS[Math.floor(rand() * FILE_TAGS.length)],
    hasUpdates: rand() > 0.5,
    sections: Array.from({ length: sectionsCount }, (_, i) => buildSection(rand, fileId, i)),
  };
}

function buildFolder(index) {
  const rand = seededRandom(index + 1);
  const name = FOLDER_NAMES[index % FOLDER_NAMES.length];
  const suffix = Math.floor(index / FOLDER_NAMES.length);
  const folderId = `folder-${index}`;

  const filesInTree = 3 + Math.floor(rand() * 4);
  const files = Array.from({ length: filesInTree }, (_, i) => buildFile(rand, folderId, i));
  const filesCount = files.length;
  const sectionsCount = files.reduce((sum, file) => sum + file.sections.length, 0);

  const createdDaysAgo = 30 + Math.floor(rand() * 300);
  const updatedDaysAgo = Math.floor(rand() * Math.min(createdDaysAgo, 30));
  const status = STATUSES[Math.floor(rand() * STATUSES.length)];

  const now = Date.now();

  return {
    id: folderId,
    name: suffix > 0 ? `${name} ${suffix + 1}` : name,
    filesCount,
    sectionsCount,
    files,
    status,
    createdAt: new Date(now - createdDaysAgo * DAY_MS).toISOString(),
    updatedAt: new Date(now - updatedDaysAgo * DAY_MS).toISOString(),
  };
}

const FOLDER_POOL = Array.from({ length: POOL_SIZE }, (_, index) => buildFolder(index));

export function fetchMockFolders({ page = 1, pageSize = 12, evaluatedOnly = false, delay = 400 } = {}) {
  const source = evaluatedOnly
    ? FOLDER_POOL.filter((folder) => folder.status === 'COMPLETED')
    : FOLDER_POOL;

  const start = (page - 1) * pageSize;
  const items = source.slice(start, start + pageSize);
  const hasMore = start + pageSize < source.length;

  return new Promise((resolve) => {
    setTimeout(() => resolve({ items, hasMore, total: source.length }), delay);
  });
}
