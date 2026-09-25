import { expect, test } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { ApiConfig } from '../apiConfig';

const loginData = {
  email: 'jane.doe@company.com',
  password: 'password',
};

async function getToken(request: any): Promise<string> {
  const api = new ApiConfig(request);
  const response = await api.login(loginData);
  expect(response.status()).toBe(200);

  const body = await response.json();
  return body.token;
}

test.describe('Documents API', () => {
  test('List documents in a workspace', async ({ request }) => {
    const api = new ApiConfig(request);
    const token = await getToken(request);

    const workspaceName = `Playwright Documents Workspace ${Date.now()}`;
    const workspaceResponse = await api.createWorkspace(token, { name: workspaceName });
    expect(workspaceResponse.status()).toBe(201);

    const workspace = await workspaceResponse.json();
    const listResponse = await api.listDocuments(token, workspace.id);
    expect(listResponse.status()).toBe(200);

    const body = await listResponse.json();
    expect(body).toHaveProperty('documents');
    expect(Array.isArray(body.documents)).toBeTruthy();

    const archiveResponse = await api.archiveWorkspace(token, workspace.id);
    expect(archiveResponse.status()).toBe(200);
  });

  test('Upload document to a workspace', async ({ request }) => {
    const api = new ApiConfig(request);
    const token = await getToken(request);

    const workspaceName = `Playwright Upload ${Date.now()}`;
    const workspaceResponse = await api.createWorkspace(token, { name: workspaceName });
    expect(workspaceResponse.status()).toBe(201);

    const workspace = await workspaceResponse.json();
    const filePath = path.resolve(__dirname, '../utils/sample.pdf');

    expect(fs.existsSync(filePath)).toBeTruthy();

    const uploadResponse = await api.uploadDocument(token, workspace.id, filePath);
    expect(uploadResponse.status()).toBe(202);

    const archiveResponse = await api.archiveWorkspace(token, workspace.id);
    expect(archiveResponse.status()).toBe(200);
  });
});