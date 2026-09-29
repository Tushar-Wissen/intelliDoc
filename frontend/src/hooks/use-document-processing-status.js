import { useEffect, useState } from 'react';
import axios from 'axios';

import { documentsApi } from '@/lib/documents-api';

export const DOCUMENT_STATUS = {
  CHECKING: 'CHECKING', // client-only: the first status request is still in flight
  UPLOADED: 'UPLOADED',
  PARSING: 'PARSING',
  EXTRACTING: 'EXTRACTING',
  INDEXING: 'INDEXING',
  READY: 'READY',
  FAILED: 'FAILED',
};

const POLL_INTERVAL_MS = 5000;

// Tracks a document's processing status (GET /documents/{documentId}) and polls until it is
// READY or FAILED, so AI chat unlocks on its own once the document is ready.
// Returns null when there is no document, or when the status can't be loaded; the chat stays
// usable in that case and the backend remains the final check.
export function useDocumentProcessingStatus(documentId) {
  const [state, setState] = useState({ documentId: null, status: null });

  useEffect(() => {
    if (!documentId) return undefined;

    const controller = new AbortController();
    let timer;

    const poll = async () => {
      try {
        const document = await documentsApi.get(documentId, { signal: controller.signal });
        const status = document.status ? String(document.status).toUpperCase() : null;
        setState({ documentId, status });
        if (status && status !== DOCUMENT_STATUS.READY && status !== DOCUMENT_STATUS.FAILED) {
          timer = setTimeout(poll, POLL_INTERVAL_MS);
        }
      } catch (err) {
        if (axios.isCancel(err)) return;
        setState({ documentId, status: null });
      }
    };

    poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [documentId]);

  if (!documentId) return null;
  // Until the first response for this document arrives, don't reuse the previous document's status.
  return state.documentId === documentId ? state.status : DOCUMENT_STATUS.CHECKING;
}
