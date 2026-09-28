import axios from 'axios';

import { API_BASE_URL, API_ERROR_CODES, authHeaders, toApiError } from '@/lib/api-client';

const MODULE_ERROR_MESSAGES = {
  [API_ERROR_CODES.INVALID]: 'Enter a valid folder name.',
  [API_ERROR_CODES.CONFLICT]: 'A folder with this name already exists in this workspace.',
  [API_ERROR_CODES.NOT_FOUND]: 'This folder no longer exists. Refresh the page and try again.',
};

const modulesUrl = (workspaceId) => `${API_BASE_URL}/workspaces/${encodeURIComponent(workspaceId)}/modules`;

// Adapts one file of a module to the file shape the UI uses. The API has no category or
// sections for a file yet, so the file type doubles as its tag and sections start empty.
function toAppFile(apiFile) {
  return {
    id: apiFile.id,
    name: apiFile.name,
    type: apiFile.type,
    tag: apiFile.type,
    size: apiFile.size,
    createdAt: apiFile.createdAt,
    updatedAt: apiFile.createdAt,
    sections: [],
  };
}

// The backend calls folders "modules". This adapts one to the folder shape the UI uses.
// Create/rename responses carry no files, so those come back with an empty list.
function toAppFolder(apiModule) {
  const files = (Array.isArray(apiModule.files) ? apiModule.files : []).map(toAppFile);
  return {
    id: apiModule.id,
    workspaceId: apiModule.workspaceId,
    name: apiModule.name,
    createdAt: apiModule.createdAt,
    updatedAt: apiModule.createdAt,
    files,
    filesCount: apiModule.totalFiles ?? files.length,
    sectionsCount: 0,
  };
}

export const modulesApi = {
  // GET /workspaces/{workspaceId}/modules
  //   -> [{ id, workspaceId, name, createdAt, totalFiles, files: [{ id, name, type, size, createdAt }] }]
  async list(workspaceId) {
    try {
      const { data } = await axios.get(modulesUrl(workspaceId), { headers: authHeaders() });
      const items = Array.isArray(data) ? data : data?.data;
      return (Array.isArray(items) ? items : []).map(toAppFolder);
    } catch (err) {
      throw toApiError(err, MODULE_ERROR_MESSAGES);
    }
  },

  // POST /workspaces/{workspaceId}/modules  { name } -> { id, workspaceId, name, createdAt }
  async create(workspaceId, name) {
    try {
      const { data } = await axios.post(modulesUrl(workspaceId), { name }, { headers: authHeaders() });
      return toAppFolder(data);
    } catch (err) {
      throw toApiError(err, MODULE_ERROR_MESSAGES);
    }
  },

  // PATCH /modules/{moduleId}  { name } -> { id, workspaceId, name, createdAt }
  async rename(moduleId, name) {
    try {
      const { data } = await axios.patch(
        `${API_BASE_URL}/modules/${encodeURIComponent(moduleId)}`,
        { name },
        { headers: authHeaders() }
      );
      return toAppFolder(data);
    } catch (err) {
      throw toApiError(err, MODULE_ERROR_MESSAGES);
    }
  },

  // DELETE /modules/{moduleId}
  async remove(moduleId) {
    try {
      await axios.delete(`${API_BASE_URL}/modules/${encodeURIComponent(moduleId)}`, { headers: authHeaders() });
    } catch (err) {
      // Show the backend's own reason when it gives one (e.g. why a delete was refused).
      throw toApiError(err, MODULE_ERROR_MESSAGES, { preferServerMessage: true });
    }
  },
};
