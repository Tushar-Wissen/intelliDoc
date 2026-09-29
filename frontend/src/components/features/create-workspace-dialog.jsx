import React, { useState } from 'react';
import { FolderPlus, Loader2 } from 'lucide-react';

import { useWorkspace } from '@/context/workspace-context';
import { useToast } from '@/context/toast-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export function CreateWorkspaceDialog({ open, onOpenChange, onCreated }) {
  const { createWorkspace } = useWorkspace();
  const toast = useToast();

  const [name, setName] = useState('');
  // The workspace API only accepts a name, so the description is kept in the form for now
  // but is not sent to the backend.
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setName('');
    setDescription('');
    setError('');
  };

  const handleOpenChange = (next) => {
    // Don't let the dialog be dismissed mid-request; the outcome would otherwise go unseen.
    if (submitting) return;
    if (!next) reset();
    onOpenChange(next);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;

    const cleanedName = name.trim();
    if (!cleanedName) {
      setError('Workspace name is required.');
      return;
    }

    setSubmitting(true);
    try {
      // Creates the workspace, refreshes the list and selects it (see WorkspaceProvider).
      const workspace = await createWorkspace(cleanedName);
      toast.success('Workspace created', `"${workspace.name}" is ready to use.`);
      setSubmitting(false);
      reset();
      onOpenChange(false);
      onCreated?.(workspace);
    } catch (err) {
      // Keep the dialog open with the entered name so the user can retry.
      toast.error('Could not create workspace', err?.message || 'Something went wrong. Please try again.');
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create Workspace</DialogTitle>
          <DialogDescription>
            Give your workspace a name to start uploading and analyzing documents.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="workspace-name-input">
              Workspace Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="workspace-name-input"
              data-testid="workspace-name-input"
              placeholder="e.g. HR Knowledge Hub"
              value={name}
              disabled={submitting}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError('');
              }}
              autoFocus
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="workspace-description">Description (Optional)</Label>
            <Textarea
              id="workspace-description"
              rows={3}
              placeholder="Store and manage all HR related documents, policies and guidelines."
              value={description}
              disabled={submitting}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" disabled={submitting} onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button
              id="workspace-submit-button"
              data-testid="workspace-submit-button"
              type="submit"
              disabled={submitting}
              aria-busy={submitting}
              className="gap-2 bg-wissen-navy text-white hover:bg-wissen-navy/90"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderPlus className="h-4 w-4" />}
              {submitting ? 'Creating...' : 'Create Workspace'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
