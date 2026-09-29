import React, { useEffect, useState } from 'react';
import { Loader2, Pencil } from 'lucide-react';

import { useFolders } from '@/context/folder-context';
import { useToast } from '@/context/toast-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export function RenameFolderDialog({ open, onOpenChange, folder, onRenamed }) {
  const { renameFolder } = useFolders();
  const toast = useToast();

  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Prefill with the current name each time the dialog opens for a folder.
  useEffect(() => {
    if (!open) return;
    setName(folder?.name || '');
    setError('');
  }, [open, folder]);

  const cleanedName = name.trim();
  const unchanged = cleanedName === (folder?.name ?? '');

  const handleOpenChange = (next) => {
    // Don't let the dialog be dismissed mid-request; the outcome would otherwise go unseen.
    if (submitting) return;
    onOpenChange(next);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting || !folder) return;

    if (!cleanedName) {
      setName('');
      setError('Folder name is required.');
      return;
    }
    if (unchanged) {
      setError('Enter a different name to rename this folder.');
      return;
    }

    setSubmitting(true);
    try {
      // The API response is the source of truth for the new name (see FolderProvider).
      const updated = await renameFolder(folder.id, cleanedName);
      toast.success('Folder renamed', `"${folder.name}" is now "${updated.name}".`);
      setSubmitting(false);
      onOpenChange(false);
      onRenamed?.(updated);
    } catch (err) {
      // Keep the dialog open with the entered name so the user can retry.
      toast.error('Could not rename folder', err?.message || 'Something went wrong. Please try again.');
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent id="rename-folder-dialog" data-testid="rename-folder-dialog" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Rename Folder</DialogTitle>
          <DialogDescription>Give this folder a new name. Its documents stay exactly where they are.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="rename-folder-input">
              Folder Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="rename-folder-input"
              data-testid="rename-folder-input"
              placeholder="e.g. HR Policies"
              value={name}
              disabled={submitting}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError('');
              }}
              onFocus={(e) => e.target.select()}
              autoFocus
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" disabled={submitting} onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button
              id="rename-folder-submit"
              data-testid="rename-folder-submit"
              type="submit"
              disabled={submitting || !cleanedName || unchanged}
              aria-busy={submitting}
              className="gap-2 bg-wissen-navy text-white hover:bg-wissen-navy/90"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Renaming...
                </>
              ) : (
                <>
                  <Pencil className="h-4 w-4" />
                  Rename Folder
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
