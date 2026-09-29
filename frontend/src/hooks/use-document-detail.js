import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';

import { documentsApi } from '@/lib/documents-api';

// Loads a document's details (GET /documents/{documentId}) whenever `documentId` changes.
// A request still in flight is cancelled when the user picks another file, so a slow
// response can never replace the details of the file that's open now.
export function useDocumentDetail(documentId) {
  const [state, setState] = useState({ status: 'idle', document: null, error: null });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!documentId) {
      setState({ status: 'idle', document: null, error: null });
      return undefined;
    }

    const controller = new AbortController();
    setState({ status: 'loading', document: null, error: null });

    documentsApi
      .get(documentId, { signal: controller.signal })
      .then((document) => setState({ status: 'success', document, error: null }))
      .catch((err) => {
        if (axios.isCancel(err)) return;
        setState({ status: 'error', document: null, error: err });
      });

    return () => controller.abort();
  }, [documentId, reloadKey]);

  const retry = useCallback(() => setReloadKey((key) => key + 1), []);

  return { ...state, retry };
}
