import { FileText, BadgeCheck, MessageSquareText, Settings } from 'lucide-react';

export const NAV_ITEMS = [
  { key: 'documents', label: 'My Documents', icon: FileText, href: '#', view: 'all' },
  { key: 'evaluated', label: 'Evaluated Docs', icon: BadgeCheck, href: '#', view: 'evaluated' },
  { key: 'chats', label: 'Saved Chats', icon: MessageSquareText, href: '#', comingSoon: true },
];

export const NAV_FOOTER_ITEMS = [
  { key: 'settings', label: 'Settings', icon: Settings, href: '#', comingSoon: true },
];
