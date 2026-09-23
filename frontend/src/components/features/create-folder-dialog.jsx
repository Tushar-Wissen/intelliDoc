import React, { useEffect, useState } from 'react';
import { FolderPlus, Pencil } from 'lucide-react';

import { useWorkspace } from '@/context/workspace-context';
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

export function CreateFolderDialog({ open, onOpenChange, folder = null, onCreated }) {
  const { workspaceName } = useWorkspace();
  const isEdit = Boolean(folder);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');

  // Re-sync fields whenever the dialog opens, or the folder being edited changes.
  useEffect(() => {
    if (!open) return;
    setName(folder?.name || '');
    setDescription(folder?.description || '');
    setError('');
  }, [open, folder]);

  const handleOpenChange = (next) => {
    onOpenChange(next);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const cleanedName = name.trim();
    if (!cleanedName) {
      setError('Folder name is required.');
      return;
    }

    const result = isEdit
      ? { ...folder, name: cleanedName, description: description.trim(), updatedAt: new Date().toISOString() }
      : {
          id: `folder-${Date.now()}`,
          name: cleanedName,
          description: description.trim(),
          files: [],
          filesCount: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

    onCreated?.(result, isEdit);
    handleOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Folder' : 'Create Folder'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Update this folder’s name and description.'
              : 'Organize documents into a dedicated workspace folder for easier review and AI analysis.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="folder-workspace">Workspace</Label>
            <select
              id="folder-workspace"
              value={workspaceName || 'My Workspace'}
              disabled
              className="flex h-10 w-full rounded-md border border-input bg-muted/50 px-3 py-2 text-sm text-foreground shadow-sm disabled:cursor-not-allowed disabled:opacity-100"
            >
              <option value={workspaceName || 'My Workspace'}>{workspaceName || 'My Workspace'}</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="folder-name">
              Folder Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="folder-name"
              placeholder="e.g. HR Policies"
              value={name}
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
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" className="gap-2 bg-wissen-navy text-white hover:bg-wissen-navy/90">
              {isEdit ? (
                <>
                  <Pencil className="h-4 w-4" />
                  Save Changes
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
