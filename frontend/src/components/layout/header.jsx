import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Menu, Database, Server, Cpu, LogOut } from 'lucide-react';

import { cn } from '@/lib/utils';
import { useAuth } from '@/context/auth-context';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ThemeToggle } from '@/components/theme-toggle';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

function StatusDot({ status }) {
  return (
    <span
      className={cn(
        'h-1.5 w-1.5 rounded-full',
        status === 'up' && 'bg-success',
        status === 'down' && 'bg-destructive',
        status === 'checking' && 'bg-muted-foreground/50 animate-pulse'
      )}
    />
  );
}

function getInitials(user) {
  const name = user?.fullName?.trim();
  if (name) {
    const parts = name.split(/\s+/);
    return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
  }
  return (user?.email?.[0] || '?').toUpperCase();
}

export function Header({ title, subtitle, healthStatus, onMenuClick }) {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  const services = [
    { key: 'db', label: 'Supabase DB', status: 'up', icon: Database },
    { key: 'backend', label: 'Spring Boot API', status: healthStatus.backend, icon: Server },
    { key: 'ai', label: 'Python AI Service', status: healthStatus.aiService, icon: Cpu },
  ];
  const allUp = services.every((s) => s.status === 'up');

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60 sm:px-6">
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
        aria-label="Open menu"
        onClick={onMenuClick}
      >
        <Menu className="h-5 w-5" />
      </Button>

      <div className="min-w-0 flex-1">
        <h1 className="truncate text-base font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="hidden truncate text-xs text-muted-foreground sm:block">{subtitle}</p>}
      </div>

      <TooltipProvider delayDuration={200}>
        <DropdownMenu>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel>Service health</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {services.map((s) => (
              <DropdownMenuItem key={s.key} className="justify-between" onSelect={(e) => e.preventDefault()}>
                <span className="flex items-center gap-2">
                  <s.icon className="h-4 w-4 text-muted-foreground" />
                  {s.label}
                </span>
                <StatusDot status={s.status} />
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="h-[1.1rem] w-[1.1rem]" />
              <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-primary" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Notifications</TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <ThemeToggle />

      <Separator orientation="vertical" className="hidden h-6 sm:block" />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button id="account-menu-trigger" variant="ghost" className="gap-2 px-1.5">
            <Avatar className="h-7 w-7">
              <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                {getInitials(user)}
              </AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuLabel className="truncate">{user?.email || 'My account'}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem id="profile-menu-item" onClick={() => navigate('/profile')}>
            Profile
          </DropdownMenuItem>
          <DropdownMenuItem id="settings-menu-item" disabled>
            Settings
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem id="sign-out-menu-item" onClick={handleSignOut}>
            <LogOut className="h-4 w-4" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
