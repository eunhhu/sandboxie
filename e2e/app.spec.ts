import { test, expect } from '@playwright/test';

test.describe('Health Check', () => {
  test('API health endpoint returns ok', async ({ request }) => {
    const res = await request.get('/api/health');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.timestamp).toBeTruthy();
  });
});

test.describe('Static File Serving', () => {
  test('root serves index.html with SolidJS app', async ({ page }) => {
    const res = await page.goto('/');
    expect(res?.status()).toBe(200);
    expect(res?.headers()['content-type']).toContain('text/html');
  });

  test('JS assets are served with correct content-type', async ({ request }) => {
    const res = await request.get('/');
    const html = await res.text();
    const jsMatch = html.match(/\/assets\/index-[^"]+\.js/);
    expect(jsMatch).toBeTruthy();

    const jsRes = await request.get(jsMatch![0]);
    expect(jsRes.ok()).toBeTruthy();
    expect(jsRes.headers()['content-type']).toContain('javascript');
  });

  test('CSS assets are served with correct content-type', async ({ request }) => {
    const res = await request.get('/');
    const html = await res.text();
    const cssMatch = html.match(/\/assets\/index-[^"]+\.css/);
    expect(cssMatch).toBeTruthy();

    const cssRes = await request.get(cssMatch![0]);
    expect(cssRes.ok()).toBeTruthy();
    expect(cssRes.headers()['content-type']).toContain('css');
  });

  test('unknown routes fallback to SPA index.html', async ({ page }) => {
    const res = await page.goto('/some/random/path');
    expect(res?.status()).toBe(200);
    expect(res?.headers()['content-type']).toContain('text/html');
  });
});

test.describe('Login Page', () => {
  test('renders login form on first visit', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toContainText('Sandbox Manager');
    await expect(page.locator('label[for="password"]')).toContainText('비밀번호');
    await expect(page.locator('button[type="submit"]')).toContainText('로그인');
    await expect(page.locator('input#password')).toBeVisible();
  });

  test('shows error on wrong password', async ({ page }) => {
    await page.goto('/');
    await page.fill('input#password', 'wrongpassword');
    await page.click('button[type="submit"]');
    await expect(page.locator('.text-destructive')).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Authentication Flow', () => {
  test('login with correct password shows dashboard', async ({ page }) => {
    await page.goto('/');
    await page.fill('input#password', 'changeme');
    await page.click('button[type="submit"]');

    await expect(page.locator('text=로그아웃')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=세션 생성')).toBeVisible();
  });

  test('dashboard shows empty state after login', async ({ page }) => {
    await page.goto('/');
    await page.fill('input#password', 'changeme');
    await page.click('button[type="submit"]');

    await expect(page.locator('text=세션이 없습니다')).toBeVisible({ timeout: 5000 });
  });

  test('logout returns to login page', async ({ page }) => {
    await page.goto('/');
    await page.fill('input#password', 'changeme');
    await page.click('button[type="submit"]');
    await expect(page.locator('text=로그아웃')).toBeVisible({ timeout: 5000 });

    await page.click('text=로그아웃');
    await expect(page.locator('h1')).toContainText('Sandbox Manager');
    await expect(page.locator('input#password')).toBeVisible({ timeout: 5000 });

    const token = await page.evaluate(() => localStorage.getItem('token'));
    expect(token).toBeNull();
  });
});

test.describe('Session Management UI', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.fill('input#password', 'changeme');
    await page.click('button[type="submit"]');
    await expect(page.locator('text=로그아웃')).toBeVisible({ timeout: 5000 });
  });

  test('create session form toggles visibility', async ({ page }) => {
    await expect(page.locator('input#username')).not.toBeVisible();

    await page.click('text=세션 생성');
    await expect(page.locator('input#username')).toBeVisible();
    await expect(page.locator('input#new-password')).toBeVisible();
    await expect(page.locator('input#memory')).toBeVisible();
    await expect(page.locator('input#cpu')).toBeVisible();
    await expect(page.locator('input#ttl')).toBeVisible();

    await page.click('text=세션 생성');
    await expect(page.locator('input#username')).not.toBeVisible();
  });
});

test.describe('API Endpoints', () => {
  test('POST /api/auth/login with correct password returns token', async ({ request }) => {
    const res = await request.post('/api/auth/login', {
      data: { password: 'changeme' },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.token).toBeTruthy();
    expect(typeof body.token).toBe('string');
  });

  test('POST /api/auth/login with wrong password returns 401', async ({ request }) => {
    const res = await request.post('/api/auth/login', {
      data: { password: 'wrong' },
    });
    expect(res.status()).toBe(401);
  });

  test('GET /api/sessions without auth returns 401', async ({ request }) => {
    const res = await request.get('/api/sessions');
    expect(res.status()).toBe(401);
  });

  test('GET /api/sessions with auth returns session list', async ({ request }) => {
    const loginRes = await request.post('/api/auth/login', {
      data: { password: 'changeme' },
    });
    const { token } = await loginRes.json();

    const res = await request.get('/api/sessions', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.sessions).toBeInstanceOf(Array);
  });
});
