import { APIRequestContext, APIResponse } from '@playwright/test';
import fs from 'fs';
import path from 'path';

export class ApiConfig {
  private request: APIRequestContext;

  constructor(request: APIRequestContext) {
    this.request = request;
  }

  private authHeaders(token: string) {
    return {
      Authorization: `Bearer ${token}`,
    };
  }

  async login(loginData: object): Promise<APIResponse> {
    return this.request.post('/auth/login', {
      data: loginData,
    });
  }

  async getCurrentUser(token: string): Promise<APIResponse> {
    return this.request.get('/auth/me', {
      headers: this.authHeaders(token),
    });
  }

  async getHealth(): Promise<APIResponse> {
    return this.request.get('/api/v1/health');
  }

  async listWorkspaces(token: string): Promise<APIResponse> {
    return this.request.get('/workspaces', {
      headers: this.authHeaders(token),
    });
  }

  async createWorkspace(
    token: string,
    payload: object
  ): Promise<APIResponse> {
    return this.request.post('/workspaces', {
      headers: this.authHeaders(token),
      data: payload,
    });
  }

  async getWorkspace(
    token: string,
    workspaceId: string
  ): Promise<APIResponse> {
    return this.request.get(`/workspaces/${workspaceId}`, {
      headers: this.authHeaders(token),
    });
  }

  async patchWorkspace(
    token: string,
    workspaceId: string,
    payload: object
  ): Promise<APIResponse> {
    return this.request.patch(`/workspaces/${workspaceId}`, {
      headers: this.authHeaders(token),
      data: payload,
    });
  }

  async archiveWorkspace(
    token: string,
    workspaceId: string
  ): Promise<APIResponse> {
    return this.request.delete(`/workspaces/${workspaceId}`, {
      headers: this.authHeaders(token),
    });
  }

  async listModules(
    token: string,
    workspaceId: string
  ): Promise<APIResponse> {
    return this.request.get(`/workspaces/${workspaceId}/modules`, {
      headers: this.authHeaders(token),
    });
  }

  async createModule(
    token: string,
    workspaceId: string,
    payload: object
  ): Promise<APIResponse> {
    return this.request.post(`/workspaces/${workspaceId}/modules`, {
      headers: this.authHeaders(token),
      data: payload,
    });
  }

  async renameModule(
    token: string,
    moduleId: string,
    payload: object
  ): Promise<APIResponse> {
    return this.request.patch(`/modules/${moduleId}`, {
      headers: this.authHeaders(token),
      data: payload,
    });
  }

  async deleteModule(
    token: string,
    moduleId: string
  ): Promise<APIResponse> {
    return this.request.delete(`/modules/${moduleId}`, {
      headers: this.authHeaders(token),
    });
  }

  async listDocuments(
    token: string,
    workspaceId: string
  ): Promise<APIResponse> {
    return this.request.get(`/workspaces/${workspaceId}/documents`, {
      headers: this.authHeaders(token),
    });
  }

  async uploadDocument(
    token: string,
    workspaceId: string,
    filePath: string
  ): Promise<APIResponse> {
    const fileBuffer = fs.readFileSync(filePath);
    const fileName = path.basename(filePath);
    const formData = new FormData();
    formData.append('files', new Blob([fileBuffer], { type: 'application/pdf' }), fileName);

    const response = await fetch(`http://localhost:8080/workspaces/${workspaceId}/documents`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });

    return {
      status: () => response.status,
      statusText: () => response.statusText,
      ok: () => response.ok,
      headers: response.headers,
      json: async () => response.json(),
      text: async () => response.text(),
    } as unknown as APIResponse;
  }
}