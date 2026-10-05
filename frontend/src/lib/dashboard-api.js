import axios from 'axios';

import { API_BASE_URL, authHeaders, toApiError } from '@/lib/api-client';

export const dashboardApi = {
  async getDashboardStats(workspaceId) {
    try {
      const { data } = await axios.get(`${API_BASE_URL}/api/v1/workspaces/${encodeURIComponent(workspaceId)}/dashboard-stats`, {
        headers: authHeaders(),
      });
      // Backend returns data directly, no wrapper
      return data ?? { totalDocuments: 0, totalFolders: 0, recentDocuments: 0 };
    } catch (err) {
      throw toApiError(err, {});
    }
  },

  async getMostAccessedDocuments(workspaceId) {
    try {
      const { data } = await axios.get(`${API_BASE_URL}/api/v1/workspaces/${encodeURIComponent(workspaceId)}/most-accessed-documents`, {
        headers: authHeaders(),
      });
      // Backend returns { data: [...] }
      const result = data?.data ?? data;
      return Array.isArray(result) ? result : [];
    } catch (err) {
      throw toApiError(err, {});
    }
  },

  async getAiSuccessRate(workspaceId) {
    try {
      const { data } = await axios.get(`${API_BASE_URL}/api/v1/workspaces/${encodeURIComponent(workspaceId)}/ai-success-rate`, {
        headers: authHeaders(),
      });
      // Backend returns object directly, no wrapper
      return data ?? null;
    } catch (err) {
      throw toApiError(err, {});
    }
  },

  async getRecentDocuments(workspaceId) {
    try {
      const { data } = await axios.get(`${API_BASE_URL}/api/v1/workspaces/${encodeURIComponent(workspaceId)}/recent-accessed-documents`, {
        headers: authHeaders(),
      });
      // Backend returns { data: [...] }
      const result = data?.data ?? data;
      return Array.isArray(result) ? result : [];
    } catch (err) {
      throw toApiError(err, {});
    }
  }
};
