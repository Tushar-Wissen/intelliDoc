import * as React from 'react';
import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export function ConfirmDialog({
  open,
  onOpenChange,
  title = 'Are you sure?',
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  loading = false,
  testIdPrefix,
  onConfirm,
}) {
  // While a request is running the dialog can't be dismissed, so the outcome isn't missed.
  const handleOpenChange = (next) => {
    if (loading) return;
    onOpenChange(next);
  };
  const idFor = (suffix) => (testIdPrefix ? `${testIdPrefix}-${suffix}` : undefined);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent id={idFor('dialog')} data-testid={idFor('dialog')} className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <DialogFooter>
          <Button
            id={idFor('cancel')}
            data-testid={idFor('cancel')}
            type="button"
            variant="outline"
            disabled={loading}
            onClick={() => handleOpenChange(false)}
          >
            {cancelLabel}
          </Button>
          <Button
            id={idFor('confirm')}
            data-testid={idFor('confirm')}
            type="button"
            variant={destructive ? 'destructive' : 'default'}
            className={!destructive ? 'bg-wissen-navy text-white hover:bg-wissen-navy/90' : undefined}
            disabled={loading}
            aria-busy={loading}
            onClick={onConfirm}
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
