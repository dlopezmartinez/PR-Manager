const { test, expect } = require('@playwright/test');

/**
 * Test Users for E2E Testing
 */
const TEST_USERS = {
  user: {
    email: 'user@prmanager.test',
    password: 'UserSecure123!@#',
  },
};

/**
 * Set auth tokens in localStorage via page.evaluate
 */
async function setAuthTokens(page, tokens) {
  await page.evaluate((t) => {
    localStorage.setItem('pr_manager_token', t.token);
    if (t.refreshToken) {
      localStorage.setItem('pr_manager_refresh_token', t.refreshToken);
    }
    if (t.user) {
      localStorage.setItem('pr_manager_user', JSON.stringify(t.user));
    }
  }, tokens);
}

/**
 * Get auth tokens from localStorage
 */
async function getAuthTokens(page) {
  return page.evaluate(() => {
    const userStr = localStorage.getItem('pr_manager_user');
    return {
      token: localStorage.getItem('pr_manager_token'),
      refreshToken: localStorage.getItem('pr_manager_refresh_token'),
      user: userStr ? JSON.parse(userStr) : null,
    };
  });
}

/**
 * Clear all auth tokens from localStorage
 */
async function clearAuthTokens(page) {
  await page.evaluate(() => {
    localStorage.removeItem('pr_manager_token');
    localStorage.removeItem('pr_manager_refresh_token');
    localStorage.removeItem('pr_manager_user');
  });
}

module.exports = {
  test,
  expect,
  TEST_USERS,
  setAuthTokens,
  getAuthTokens,
  clearAuthTokens,
};
