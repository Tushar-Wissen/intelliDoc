import { test, expect } from '@playwright/test';
import { ApiConfig } from '../apiConfig';

const loginData = {
  email: 'jane.doe@company.com',
  password: 'password',
};

test.describe('Workspace API Tests', () => {
  async function getToken(request: any): Promise<string> {
    const api = new ApiConfig(request);
    const response = await api.login(loginData);
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty('token');
    return body.token;
  }

  test('Health check', async ({ request }) => {
    const api = new ApiConfig(request);
    const response = await api.getHealth();

    expect(response.status()).toBe(200);
  });

  test('Login', async ({ request }) => {
    const response = await new ApiConfig(request).login(loginData);

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty('token');
    expect(body.user).toHaveProperty('id');
  });

  test('Get current user profile', async ({ request }) => {
    const api = new ApiConfig(request);
    const token = await getToken(request);
    const response = await api.getCurrentUser(token);

    expect(response.status()).toBe(200);
    const profile = await response.json();
    expect(profile).toHaveProperty('id');
  });

  test('List workspaces for authenticated user', async ({ request }) => {
    const api = new ApiConfig(request);
    const token = await getToken(request);
    const response = await api.listWorkspaces(token);

    expect(response.status()).toBe(200);
    const workspaces = await response.json();
    expect(Array.isArray(workspaces)).toBeTruthy();
  });

  test('Create workspace', async ({ request }) => {
    const api = new ApiConfig(request);
    const token = await getToken(request);
    const uniqueName = `Playwright Workspace ${Date.now()}`;

    const createResponse = await api.createWorkspace(token, { name: uniqueName });
    expect(createResponse.status()).toBe(201);

    const createdWorkspace = await createResponse.json();
    expect(createdWorkspace.name).toBe(uniqueName);
    expect(createdWorkspace).toHaveProperty('id');

    const archiveResponse = await api.archiveWorkspace(token, createdWorkspace.id);
    expect(archiveResponse.status()).toBe(200);
  });

  test('Get workspace', async ({ request }) => {
    const api = new ApiConfig(request);
    const token = await getToken(request);
    const uniqueName = `Playwright Workspace ${Date.now()}`;

    const createResponse = await api.createWorkspace(token, { name: uniqueName });
    expect(createResponse.status()).toBe(201);
    const createdWorkspace = await createResponse.json();

    const getResponse = await api.getWorkspace(token, createdWorkspace.id);
    expect(getResponse.status()).toBe(200);
    const fetchedWorkspace = await getResponse.json();
    expect(fetchedWorkspace.id).toBe(createdWorkspace.id);
    expect(fetchedWorkspace.name).toBe(uniqueName);

    const archiveResponse = await api.archiveWorkspace(token, createdWorkspace.id);
    expect(archiveResponse.status()).toBe(200);
  });

  test('Update workspace', async ({ request }) => {
    const api = new ApiConfig(request);
    const token = await getToken(request);
    const uniqueName = `Playwright Workspace ${Date.now()}`;

    const createResponse = await api.createWorkspace(token, { name: uniqueName });
    expect(createResponse.status()).toBe(201);
    const createdWorkspace = await createResponse.json();

    const updatedName = `${uniqueName} Updated`;
    const patchResponse = await api.patchWorkspace(token, createdWorkspace.id, { name: updatedName });
    expect(patchResponse.status()).toBe(200);
    const patchedWorkspace = await patchResponse.json();
    expect(patchedWorkspace.name).toBe(updatedName);

    const archiveResponse = await api.archiveWorkspace(token, createdWorkspace.id);
    expect(archiveResponse.status()).toBe(200);
  });

  test('Archive workspace', async ({ request }) => {
    const api = new ApiConfig(request);
    const token = await getToken(request);
    const uniqueName = `Playwright Workspace ${Date.now()}`;

    const createResponse = await api.createWorkspace(token, { name: uniqueName });
    expect(createResponse.status()).toBe(201);
    const createdWorkspace = await createResponse.json();

    const archiveResponse = await api.archiveWorkspace(token, createdWorkspace.id);
    expect(archiveResponse.status()).toBe(200);
    const archivedWorkspace = await archiveResponse.json();
    expect(archivedWorkspace.status).toBe('ARCHIVED');
  });
});
