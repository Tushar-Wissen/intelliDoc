import { LayoutDashboard, FolderKanban, FileWarning, Users, Trash2 } from 'lucide-react';

export const NAV_ITEMS = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, to: '/' },
  { key: 'workspace', label: 'My Workspace', icon: FolderKanban, to: '/workspace' },
];

export const WORKSPACE_UTILITY_ITEMS = [
  { key: 'orphaned', label: 'Orphaned Files', icon: FileWarning, to: '/workspace?view=orphaned', comingSoon: true },
  { key: 'shared', label: 'Shared with me', icon: Users, to: '#', comingSoon: true },
  { key: 'trash', label: 'Trash', icon: Trash2, to: '#', comingSoon: true },
];
