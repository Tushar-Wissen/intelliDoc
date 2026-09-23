import axios from 'axios';

import { API_BASE_URL, API_ERROR_CODES, authHeaders, toApiError } from '@/lib/api-client';

const MODULE_ERROR_MESSAGES = {
  [API_ERROR_CODES.INVALID]: 'Enter a valid folder name.',
  [API_ERROR_CODES.CONFLICT]: 'A folder with this name already exists in this workspace.',
  [API_ERROR_CODES.NOT_FOUND]: 'This folder no longer exists. Refresh the page and try again.',
};

const modulesUrl = (workspaceId) => `${API_BASE_URL}/workspaces/${encodeURIComponent(workspaceId)}/modules`;

// The backend calls folders "modules". This adapts one to the folder shape the UI uses.
// Files and sections have no endpoint yet, so they start empty and are only tracked locally.
function toAppFolder(apiModule) {
  return {
    id: apiModule.id,
    workspaceId: apiModule.workspaceId,
    name: apiModule.name,
    createdAt: apiModule.createdAt,
    updatedAt: apiModule.createdAt,
    files: [],
    filesCount: 0,
    sectionsCount: 0,
  };
}

export const modulesApi = {
  // GET /workspaces/{workspaceId}/modules
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
};
