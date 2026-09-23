import axios from 'axios';

import { API_BASE_URL, API_ERROR_CODES, authHeaders, toApiError } from '@/lib/api-client';
import { getFileExtension } from '@/lib/file-types';

export const SUPPORTED_UPLOAD_EXTENSIONS = ['PDF', 'DOCX'];

const DOCUMENT_ERROR_MESSAGES = {
  [API_ERROR_CODES.INVALID]: 'The file could not be uploaded. Only PDF and DOCX files are accepted.',
  [API_ERROR_CODES.NOT_FOUND]: 'This workspace no longer exists. Select another workspace and try again.',
};

const documentsUrl = (workspaceId) => `${API_BASE_URL}/workspaces/${encodeURIComponent(workspaceId)}/documents`;

// Adapts an API document to the file shape the UI uses.
function toAppDocument(apiDocument) {
  return {
    id: apiDocument.id,
    name: apiDocument.fileName,
    type: getFileExtension(apiDocument.fileName),
    status: apiDocument.processingStatus,
    createdAt: apiDocument.createdAt,
  };
}

// The API can accept some files and reject others in the same request.
function toAppRejection(apiRejection) {
  return {
    fileName: apiRejection.fileName,
    code: apiRejection.code,
    message: apiRejection.message,
  };
}

// Multipart field name for the uploaded files (one part per file).
const UPLOAD_FILES_FIELD = 'files';

// Builds the multipart body. When the backend starts accepting a folder/module for uploads,
// append its id here (and take it as a parameter); nothing else in the UI needs to change.
function buildUploadFormData({ files, title }) {
  const formData = new FormData();
  files.forEach((file) => formData.append(UPLOAD_FILES_FIELD, file));
  if (title) formData.append('title', title);
  return formData;
}

export const documentsApi = {
  // GET /workspaces/{workspaceId}/documents -> { documents: [{ id, fileName, processingStatus, createdAt }] }
  async list(workspaceId) {
    try {
      const { data } = await axios.get(documentsUrl(workspaceId), { headers: authHeaders() });
      const items = Array.isArray(data) ? data : data?.documents;
      return (Array.isArray(items) ? items : []).map(toAppDocument);
    } catch (err) {
      throw toApiError(err, DOCUMENT_ERROR_MESSAGES);
    }
  },

  // POST /workspaces/{workspaceId}/documents  (multipart: files[, title])
  //   -> { documents: [...accepted], rejections: [{ fileName, code, message }] }
  // Uploaded documents belong to the workspace (they show under Orphaned Files) for now.
  // `title` is optional and only makes sense for a single file. `onProgress` receives 0-100
  // while the files are being sent.
  async upload(workspaceId, { files, title }, { onProgress } = {}) {
    try {
      // No Content-Type header: the browser adds the multipart boundary itself.
      const { data } = await axios.post(documentsUrl(workspaceId), buildUploadFormData({ files, title }), {
        headers: authHeaders(),
        onUploadProgress: (event) => {
          if (event.total) onProgress?.(Math.round((event.loaded * 100) / event.total));
        },
      });
      return {
        documents: (data?.documents ?? []).map(toAppDocument),
        rejections: (data?.rejections ?? []).map(toAppRejection),
      };
    } catch (err) {
      throw toApiError(err, DOCUMENT_ERROR_MESSAGES);
    }
  },
};
