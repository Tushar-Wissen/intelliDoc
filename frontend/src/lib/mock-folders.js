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

function buildFolder(index) {
  const rand = seededRandom(index + 1);
  const name = FOLDER_NAMES[index % FOLDER_NAMES.length];
  const suffix = Math.floor(index / FOLDER_NAMES.length);

  const filesCount = 3 + Math.floor(rand() * 45);
  const sectionsCount = filesCount + Math.floor(rand() * filesCount * 3);
  const createdDaysAgo = 30 + Math.floor(rand() * 300);
  const updatedDaysAgo = Math.floor(rand() * Math.min(createdDaysAgo, 30));
  const status = STATUSES[Math.floor(rand() * STATUSES.length)];

  const now = Date.now();

  return {
    id: `folder-${index}`,
    name: suffix > 0 ? `${name} ${suffix + 1}` : name,
    filesCount,
    sectionsCount,
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
