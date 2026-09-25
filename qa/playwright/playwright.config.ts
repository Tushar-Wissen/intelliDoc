import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',

  timeout: 30_000,

  expect: {
    timeout: 5_000,
  },

  fullyParallel: false,

  workers: 1,

  retries: 0,

  reporter: [
    ['list'],
    ['html', { open: 'never' }],
  ],

  use: {
    baseURL: 'http://localhost:8080',

    extraHTTPHeaders: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
  },
});