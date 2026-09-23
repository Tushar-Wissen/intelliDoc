import axios from 'axios';

import { API_BASE_URL, API_ERROR_CODES, authHeaders, toApiError } from '@/lib/api-client';

const WORKSPACE_ERROR_MESSAGES = {
  [API_ERROR_CODES.INVALID]: 'Enter a valid workspace name.',
  [API_ERROR_CODES.CONFLICT]: 'A workspace with this name already exists.',
};

// Keeps only the fields the UI relies on, so backend additions don't leak into component state.
function toAppWorkspace(apiWorkspace) {
  return {
    id: apiWorkspace.id,
    name: apiWorkspace.name,
    status: apiWorkspace.status,
    createdAt: apiWorkspace.createdAt,
  };
}

export const workspaceApi = {
  // GET /workspaces
  async list() {
    try {
      const { data } = await axios.get(`${API_BASE_URL}/workspaces`, { headers: authHeaders() });
      const items = Array.isArray(data) ? data : data?.data;
      return (Array.isArray(items) ? items : []).map(toAppWorkspace);
    } catch (err) {
      throw toApiError(err, WORKSPACE_ERROR_MESSAGES);
    }
  },

  // POST /workspaces  { name } -> { id, name, status, createdAt }
  async create(name) {
    try {
      const { data } = await axios.post(`${API_BASE_URL}/workspaces`, { name }, { headers: authHeaders() });
      return toAppWorkspace(data);
    } catch (err) {
      throw toApiError(err, WORKSPACE_ERROR_MESSAGES);
    }
  },
};
