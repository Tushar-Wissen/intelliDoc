import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FolderPlus, Loader2 } from 'lucide-react';

import { useWorkspace } from '@/context/workspace-context';
import { useFolders } from '@/context/folder-context';
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

const NO_WORKSPACE_LABEL = 'No workspace selected';
const NO_WORKSPACE_MESSAGE = 'Select or create a workspace before creating a folder.';

export function CreateFolderDialog({ open, onOpenChange, onCreated }) {
  const navigate = useNavigate();
  const { workspaceName, selectedWorkspaceId } = useWorkspace();
  const { createFolder } = useFolders();
  const toast = useToast();

  // A folder needs a workspace to live in.
  const workspaceMissing = !selectedWorkspaceId;

  const [name, setName] = useState('');
  // The modules API only accepts a name, so the description is kept in the form for now
  // but is not sent to the backend.
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Start with a clean form each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    setName('');
    setDescription('');
    setError('');
  }, [open]);

  const handleOpenChange = (next) => {
    // Don't let the dialog be dismissed mid-request; the outcome would otherwise go unseen.
    if (submitting) return;
    onOpenChange(next);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting || workspaceMissing) return;

    const cleanedName = name.trim();
    if (!cleanedName) {
      setName('');
      setError('Folder name is required.');
      return;
    }

    setSubmitting(true);
    try {
      // Creates the folder, then refreshes the shared folder list (see FolderProvider).
      const created = await createFolder(cleanedName);
      toast.success('Folder created', `"${created.name}" has been added to ${workspaceName}.`);
      setSubmitting(false);
      onOpenChange(false);
      onCreated?.(created);
      // The workspace page opens (selects) the folder named in the router state.
      navigate('/workspace', { state: { folderId: created.id } });
    } catch (err) {
      // Keep the dialog open with the entered name so the user can retry.
      toast.error('Could not create folder', err?.message || 'Something went wrong. Please try again.');
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create Folder</DialogTitle>
          <DialogDescription>
            Organize documents into a dedicated workspace folder for easier review and AI analysis.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="folder-workspace">Workspace</Label>
            <select
              id="folder-workspace"
              value={workspaceName || NO_WORKSPACE_LABEL}
              disabled
              className="flex h-10 w-full rounded-md border border-input bg-muted/50 px-3 py-2 text-sm text-foreground shadow-sm disabled:cursor-not-allowed disabled:opacity-100"
            >
              <option value={workspaceName || NO_WORKSPACE_LABEL}>{workspaceName || NO_WORKSPACE_LABEL}</option>
            </select>
            {workspaceMissing && (
              <p className="text-xs text-destructive" data-testid="folder-workspace-error">
                {NO_WORKSPACE_MESSAGE}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="folder-name-input">
              Folder Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="folder-name-input"
              data-testid="folder-name-input"
              placeholder="e.g. HR Policies"
              value={name}
              disabled={submitting || workspaceMissing}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError('');
              }}
              autoFocus
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="folder-description">Description (Optional)</Label>
            <Textarea
              id="folder-description"
              rows={3}
              placeholder="Short summary of what this folder contains."
              value={description}
              disabled={submitting || workspaceMissing}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" disabled={submitting} onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button
              id="folder-submit-button"
              data-testid="folder-submit-button"
              type="submit"
              disabled={submitting || workspaceMissing}
              aria-busy={submitting}
              className="gap-2 bg-wissen-navy text-white hover:bg-wissen-navy/90"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <FolderPlus className="h-4 w-4" />
                  Create Folder
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
