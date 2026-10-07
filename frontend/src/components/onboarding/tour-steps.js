import {
  Building2,
  Compass,
  Cpu,
  FileWarning,
  FolderTree,
  FolderPlus,
  Folders,
  PartyPopper,
  Sparkles,
  UserCircle,
} from 'lucide-react';

import { AI_MODELS } from '@/constants/ai-models';

const formatList = (items) =>
  items.length > 1 ? `${items.slice(0, -1).join(', ')} or ${items[items.length - 1]}` : items[0] ?? '';

const WORKSPACE_ROUTE = { path: '/workspace', state: { clearFolder: true } };

// Steps of the product tour, in order.
// - `targets`: selectors for the element to spotlight; the first visible match wins. Steps
//   without targets (or whose target isn't on screen, e.g. the sidebar on a phone) show a
//   centred card, plus `hiddenTargetNote` when set.
// - `route`: the page the target lives on; the tour navigates there first.
export const TOUR_STEPS = [
  {
    id: 'welcome',
    kind: 'welcome',
    icon: Sparkles,
    title: 'Welcome to DocuMind',
    description:
      'DocuMind keeps your documents organised and lets you ask questions about them in plain language. ' +
      'Answers come straight from your own files, with citations so you can check the source.',
    highlights: [
      'Organise documents into workspaces and folders',
      'Ask AI about one document, a folder or a whole workspace',
      'Find what you need without reading every page',
    ],
  },
  {
    id: 'workspace-switcher',
    icon: Building2,
    title: 'Switch workspaces',
    description:
      'Workspaces keep separate teams or projects apart. Pick the one you want to work in here, or create a new one.',
    targets: ['#workspace-selector-trigger'],
    route: WORKSPACE_ROUTE,
  },
  {
    id: 'navigation',
    icon: Compass,
    title: 'Find your way around',
    description:
      'Use the Dashboard for an overview of activity across your documents, and My Workspace to work with your folders and files.',
    targets: ['[data-tour="main-nav"]'],
    hiddenTargetNote: 'On a small screen, open the menu button at the top left to see navigation.',
    route: WORKSPACE_ROUTE,
  },
  {
    id: 'sidebar-folders',
    icon: FolderTree,
    title: 'Browse folders and documents',
    description:
      'Every folder in the workspace is listed here. Expand a folder to see its documents, and select one to open it.',
    targets: ['[data-tour="sidebar-folders"]'],
    hiddenTargetNote: 'On a small screen, your folders are in the menu at the top left.',
    route: WORKSPACE_ROUTE,
  },
  {
    id: 'create-upload',
    icon: FolderPlus,
    title: 'Create folders and upload documents',
    description:
      'Group related documents in a folder, then upload files into it. DocuMind processes each upload so the AI can answer questions about it.',
    targets: ['[data-tour="workspace-actions"]', '#sidebar-create-folder-button'],
    route: WORKSPACE_ROUTE,
  },
  {
    id: 'folder-management',
    icon: Folders,
    title: 'Manage folders and documents',
    description:
      'Open a folder to see its documents and their processing status. Use the menu on each folder to rename or delete it. ' +
      'Opening a document shows an AI summary next to the document itself.',
    targets: ['[data-tour="folder-list"]', '[data-tour="sidebar-folders"]'],
    route: WORKSPACE_ROUTE,
  },
  {
    id: 'chat',
    icon: Sparkles,
    title: 'Chat with DocuMind AI',
    description:
      'Ask questions about your documents here. The assistant follows what you have open: a document, a folder, or the whole workspace. ' +
      'Answers cite the pages they come from, and your conversation is saved for next time.',
    targets: ['#copilot-sidebar-panel'],
    route: WORKSPACE_ROUTE,
  },
  {
    id: 'model-selection',
    icon: Cpu,
    title: 'Choose your AI model',
    description:
      `Pick which AI answers your questions: ${formatList(AI_MODELS.map((model) => model.label))}. ` +
      'You can switch at any time, even mid-conversation, and each answer shows which model wrote it.',
    targets: ['#ai-model-dropdown-trigger'],
    route: WORKSPACE_ROUTE,
  },
  {
    id: 'orphaned-files',
    icon: FileWarning,
    title: 'Tidy up orphaned files',
    description: 'Documents that aren’t in any folder collect here, so you can move them where they belong or remove them.',
    targets: ['#orphaned-files-nav'],
    hiddenTargetNote: 'On a small screen, Orphaned Files is in the menu at the top left.',
    route: WORKSPACE_ROUTE,
  },
  {
    id: 'account',
    icon: UserCircle,
    title: 'Your account and help',
    description:
      'Manage your profile and sign out from this menu. You can also replay this tour from here whenever you need a refresher.',
    targets: ['#account-menu-trigger'],
    route: WORKSPACE_ROUTE,
  },
  {
    id: 'complete',
    kind: 'complete',
    icon: PartyPopper,
    title: 'You’re all set!',
    description: 'That’s the tour. Here are a few places to start:',
    quickLinks: [
      { label: 'Open My Workspace', to: '/workspace', state: { clearFolder: true } },
      { label: 'View the dashboard', to: '/' },
      { label: 'Review orphaned files', to: '/orphaned-files' },
    ],
  },
];
