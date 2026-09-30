import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';

import { documentsApi } from '@/lib/documents-api';

// Loads a document's original file (GET /documents/{documentId}/file) whenever `documentId`
// changes and exposes it as an object URL the viewer can embed. A request still in flight is
// cancelled when the user picks another file, and the URL is revoked once it's replaced.
export function useDocumentFile(documentId) {
  const [state, setState] = useState({ status: 'idle', url: null, contentType: '', size: 0, error: null });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!documentId) {
      setState({ status: 'idle', url: null, contentType: '', size: 0, error: null });
      return undefined;
    }

    const controller = new AbortController();
    let objectUrl = null;
    setState({ status: 'loading', url: null, contentType: '', size: 0, error: null });

    documentsApi
      .getFile(documentId, { signal: controller.signal })
      .then((blob) => {
        if (!blob?.size) {
          setState({ status: 'empty', url: null, contentType: blob?.type ?? '', size: 0, error: null });
          return;
        }
        objectUrl = URL.createObjectURL(blob);
        setState({ status: 'success', url: objectUrl, contentType: blob.type, size: blob.size, error: null });
      })
      .catch((err) => {
        if (axios.isCancel(err)) return;
        setState({ status: 'error', url: null, contentType: '', size: 0, error: err });
      });

    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [documentId, reloadKey]);

  const retry = useCallback(() => setReloadKey((key) => key + 1), []);

  return { ...state, retry };
}
