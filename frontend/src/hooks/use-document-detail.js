import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';

import { documentsApi } from '@/lib/documents-api';

const POLL_INTERVAL_MS = 5000;

// READY and FAILED are final; any other status means the pipeline is still working on it.
export function isDocumentProcessing(status) {
  if (!status) return false;
  const normalized = String(status).toUpperCase();
  return normalized !== 'READY' && normalized !== 'FAILED';
}

// Loads a document's details (GET /documents/{documentId}) whenever `documentId` changes.
// A request still in flight is cancelled when the user picks another file, so a slow
// response can never replace the details of the file that's open now.
// While the document is still processing, the details are refetched in the background so the
// summary and overview appear on their own once processing finishes.
export function useDocumentDetail(documentId) {
  const [state, setState] = useState({ status: 'idle', document: null, error: null });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!documentId) {
      setState({ status: 'idle', document: null, error: null });
      return undefined;
    }

    const controller = new AbortController();
    let timer;
    setState({ status: 'loading', document: null, error: null });

    const load = (background) =>
      documentsApi
        .get(documentId, { signal: controller.signal })
        .then((document) => {
          setState({ status: 'success', document, error: null });
          if (isDocumentProcessing(document?.status)) {
            timer = setTimeout(() => load(true), POLL_INTERVAL_MS);
          }
        })
        .catch((err) => {
          if (axios.isCancel(err)) return;
          // A failed background refresh keeps the details already on screen.
          if (background) return;
          setState({ status: 'error', document: null, error: err });
        });

    load(false);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [documentId, reloadKey]);

  const retry = useCallback(() => setReloadKey((key) => key + 1), []);

  return { ...state, retry };
}
