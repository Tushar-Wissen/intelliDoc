import { expect, test } from '@playwright/test';
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

test.describe('Modules API', () => {
  test('Create module', async ({ request }) => {
    const api = new ApiConfig(request);
    const token = await getToken(request);
    const workspaceName = `Playwright Module Suite ${Date.now()}`;

    const workspaceResponse = await api.createWorkspace(token, { name: workspaceName });
    expect(workspaceResponse.status()).toBe(201);
    const workspace = await workspaceResponse.json();

    const moduleName = `Module ${Date.now()}`;
    const createModuleResponse = await api.createModule(token, workspace.id, { name: moduleName });
    expect(createModuleResponse.status()).toBe(201);
    const createdModule = await createModuleResponse.json();
    expect(createdModule.name).toBe(moduleName);
    expect(createdModule.workspaceId).toBe(workspace.id);

    const archiveResponse = await api.archiveWorkspace(token, workspace.id);
    expect(archiveResponse.status()).toBe(200);
  });

  test('List modules', async ({ request }) => {
    const api = new ApiConfig(request);
    const token = await getToken(request);
    const workspaceName = `Playwright Module Suite ${Date.now()}`;

    const workspaceResponse = await api.createWorkspace(token, { name: workspaceName });
    expect(workspaceResponse.status()).toBe(201);
    const workspace = await workspaceResponse.json();

    const moduleName = `Module ${Date.now()}`;
    const createModuleResponse = await api.createModule(token, workspace.id, { name: moduleName });
    expect(createModuleResponse.status()).toBe(201);
    const createdModule = await createModuleResponse.json();

    const listModulesResponse = await api.listModules(token, workspace.id);
    expect(listModulesResponse.status()).toBe(200);
    const modules = await listModulesResponse.json();
    expect(Array.isArray(modules)).toBeTruthy();
    expect(modules.some((module: any) => module.id === createdModule.id)).toBeTruthy();

    const archiveResponse = await api.archiveWorkspace(token, workspace.id);
    expect(archiveResponse.status()).toBe(200);
  });

  test('Rename module', async ({ request }) => {
    const api = new ApiConfig(request);
    const token = await getToken(request);
    const workspaceName = `Playwright Module Suite ${Date.now()}`;

    const workspaceResponse = await api.createWorkspace(token, { name: workspaceName });
    expect(workspaceResponse.status()).toBe(201);
    const workspace = await workspaceResponse.json();

    const moduleName = `Module ${Date.now()}`;
    const createModuleResponse = await api.createModule(token, workspace.id, { name: moduleName });
    expect(createModuleResponse.status()).toBe(201);
    const createdModule = await createModuleResponse.json();

    const renamedModuleName = `${moduleName} Renamed`;
    const renameResponse = await api.renameModule(token, createdModule.id, { name: renamedModuleName });
    expect(renameResponse.status()).toBe(200);
    const renamedModule = await renameResponse.json();
    expect(renamedModule.name).toBe(renamedModuleName);

    const archiveResponse = await api.archiveWorkspace(token, workspace.id);
    expect(archiveResponse.status()).toBe(200);
  });

  test('Delete module', async ({ request }) => {
    const api = new ApiConfig(request);
    const token = await getToken(request);
    const workspaceName = `Playwright Module Suite ${Date.now()}`;

    const workspaceResponse = await api.createWorkspace(token, { name: workspaceName });
    expect(workspaceResponse.status()).toBe(201);
    const workspace = await workspaceResponse.json();

    const moduleName = `Module ${Date.now()}`;
    const createModuleResponse = await api.createModule(token, workspace.id, { name: moduleName });
    expect(createModuleResponse.status()).toBe(201);
    const createdModule = await createModuleResponse.json();

    const deleteResponse = await api.deleteModule(token, createdModule.id);
    expect(deleteResponse.status()).toBe(204);

    const archiveResponse = await api.archiveWorkspace(token, workspace.id);
    expect(archiveResponse.status()).toBe(200);
  });
});
