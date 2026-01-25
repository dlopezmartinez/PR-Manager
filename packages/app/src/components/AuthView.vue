<template>
  <div class="auth-view">
    <div class="auth-container">
      <div class="auth-header">
        <div class="logo">
          <img src="../../assets/icon.svg" width="82" height="82" alt="PR Manager" />
        </div>
        <h1>PR Manager</h1>
        <p class="tagline">Manage your Pull Requests from the menubar</p>
      </div>

      <div class="auth-form">
        <div v-if="mode === 'login'" class="form-content">
          <h2>Welcome back</h2>
          <p class="form-subtitle">Sign in to continue</p>

          <form @submit.prevent="handleLogin">
            <div class="form-group">
              <label for="email">Email</label>
              <input
                id="email"
                v-model="email"
                type="email"
                placeholder="you@example.com"
                autocomplete="email"
                required
                :disabled="isLoading"
              />
            </div>

            <div class="form-group">
              <label for="password">Password</label>
              <input
                id="password"
                v-model="password"
                type="password"
                placeholder="Your password"
                autocomplete="current-password"
                required
                :disabled="isLoading"
              />
            </div>

            <div v-if="error" class="error-message">
              {{ error }}
            </div>

            <button type="submit" class="btn-primary" :disabled="isLoading">
              <span v-if="isLoading">Signing in...</span>
              <span v-else>Sign In</span>
            </button>
          </form>

          <p class="form-footer">
            <a href="#" @click.prevent="switchMode('forgot-password')">Forgot password?</a>
          </p>
          <p class="form-footer">
            Don't have an account?
            <a href="#" @click.prevent="switchMode('signup')">Start free trial</a>
          </p>
        </div>

        <div v-else-if="mode === 'forgot-password'" class="form-content">
          <h2>Reset password</h2>
          <p class="form-subtitle">Enter your email to receive a reset link</p>

          <form @submit.prevent="handleForgotPassword">
            <div class="form-group">
              <label for="forgot-email">Email</label>
              <input
                id="forgot-email"
                v-model="email"
                type="email"
                placeholder="you@example.com"
                autocomplete="email"
                required
                :disabled="isLoading"
              />
            </div>

            <div v-if="error" class="error-message">
              {{ error }}
            </div>

            <div v-if="successMessage" class="success-message">
              {{ successMessage }}
            </div>

            <button type="submit" class="btn-primary" :disabled="isLoading || !!successMessage">
              <span v-if="isLoading">Sending...</span>
              <span v-else>Send Reset Link</span>
            </button>
          </form>

          <p class="form-footer">
            <a href="#" @click.prevent="switchMode('login')">Back to sign in</a>
          </p>
        </div>

        <div v-else class="form-content">
          <h2>Start your free trial</h2>
          <p class="form-subtitle">14 days free, no credit card required</p>

          <form @submit.prevent="handleSignup">
            <div class="form-group">
              <label for="name">Name</label>
              <input
                id="name"
                v-model="name"
                type="text"
                placeholder="Your name"
                autocomplete="name"
                :disabled="isLoading"
              />
            </div>

            <div class="form-group">
              <label for="signup-email">Email</label>
              <input
                id="signup-email"
                v-model="email"
                type="email"
                placeholder="you@example.com"
                autocomplete="email"
                required
                :disabled="isLoading"
              />
            </div>

            <div class="form-group">
              <label for="signup-password">Password</label>
              <input
                id="signup-password"
                v-model="password"
                type="password"
                placeholder="At least 8 characters"
                autocomplete="new-password"
                required
                minlength="8"
                :disabled="isLoading"
              />
            </div>

            <div v-if="error" class="error-message">
              {{ error }}
            </div>

            <button type="submit" class="btn-primary" :disabled="isLoading">
              <span v-if="isLoading">Creating account...</span>
              <span v-else>Create Account</span>
            </button>
          </form>

          <p class="form-footer">
            Already have an account?
            <a href="#" @click.prevent="switchMode('login')">Sign in</a>
          </p>
        </div>
      </div>

      <div class="auth-footer">
        <p>
          By continuing, you agree to our
          <a href="#" @click.prevent="openExternal('https://prmanager.app/terms')">Terms of Service</a>
          and
          <a href="#" @click.prevent="openExternal('https://prmanager.app/privacy')">Privacy Policy</a>
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { authStore } from '../stores/authStore';
import { authService } from '../services/authService';

const emit = defineEmits<{
  (e: 'authenticated'): void;
}>();

const mode = ref<'login' | 'signup' | 'forgot-password'>('login');
const email = ref('');
const password = ref('');
const name = ref('');
const error = ref('');
const successMessage = ref('');
const isLoading = ref(false);

function switchMode(newMode: 'login' | 'signup' | 'forgot-password') {
  mode.value = newMode;
  error.value = '';
  successMessage.value = '';
}

async function handleLogin() {
  if (!email.value || !password.value) {
    error.value = 'Please fill in all fields';
    return;
  }

  isLoading.value = true;
  error.value = '';

  try {
    await authStore.login(email.value, password.value);
    emit('authenticated');
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to sign in';
  } finally {
    isLoading.value = false;
  }
}

async function handleSignup() {
  if (!email.value || !password.value) {
    error.value = 'Please fill in all required fields';
    return;
  }

  if (password.value.length < 8) {
    error.value = 'Password must be at least 8 characters';
    return;
  }

  isLoading.value = true;
  error.value = '';

  try {
    await authStore.signup(email.value, password.value, name.value || undefined);
    emit('authenticated');
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to create account';
  } finally {
    isLoading.value = false;
  }
}

async function handleForgotPassword() {
  if (!email.value) {
    error.value = 'Please enter your email address';
    return;
  }

  isLoading.value = true;
  error.value = '';
  successMessage.value = '';

  try {
    await authService.forgotPassword(email.value);
    successMessage.value = 'If an account exists, a reset email will be sent. Check your inbox.';
  } catch (err) {
    // Still show success message to prevent email enumeration
    successMessage.value = 'If an account exists, a reset email will be sent. Check your inbox.';
  } finally {
    isLoading.value = false;
  }
}

function openExternal(url: string) {
  window.electronAPI.shell.openExternal(url);
}
</script>

<style scoped>
.auth-view {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: 24px;
  background: var(--color-bg-primary);
}

.auth-container {
  width: 100%;
  max-width: 380px;
}

.auth-header {
  text-align: center;
  margin-bottom: 32px;
}

.logo {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  color: var(--color-text-inverted);
  margin-bottom: 16px;
}

.auth-header h1 {
  font-size: 24px;
  font-weight: 600;
  margin: 0 0 4px 0;
  color: var(--color-text-primary);
}

.tagline {
  font-size: 14px;
  color: var(--color-text-secondary);
  margin: 0;
}

.auth-form {
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border-primary);
  border-radius: var(--radius-xl);
  padding: 24px;
}

.form-content h2 {
  font-size: 18px;
  font-weight: 600;
  margin: 0 0 4px 0;
  color: var(--color-text-primary);
}

.form-subtitle {
  font-size: 14px;
  color: var(--color-text-secondary);
  margin: 0 0 20px 0;
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-primary);
  margin-bottom: 6px;
}

.form-group input {
  width: 100%;
  padding: 10px 12px;
  font-size: 14px;
  border: 1px solid var(--color-border-primary);
  border-radius: var(--radius-md);
  background: var(--color-bg-primary);
  color: var(--color-text-primary);
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
}

.form-group input:focus {
  outline: none;
  border-color: var(--color-accent-primary);
  box-shadow: 0 0 0 3px var(--color-accent-lighter);
}

.form-group input::placeholder {
  color: var(--color-text-tertiary);
}

.form-group input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.error-message {
  padding: 10px 12px;
  background: var(--color-error-bg);
  border: 1px solid var(--color-error);
  border-radius: var(--radius-md);
  color: var(--color-error);
  font-size: 13px;
  margin-bottom: 16px;
}

.success-message {
  padding: 10px 12px;
  background: var(--color-success-bg, rgba(34, 197, 94, 0.1));
  border: 1px solid var(--color-success, #22c55e);
  border-radius: var(--radius-md);
  color: var(--color-success, #22c55e);
  font-size: 13px;
  margin-bottom: 16px;
}

.btn-primary {
  width: 100%;
  padding: 12px 16px;
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-inverted);
  background: var(--color-accent-primary);
  border: none;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: background var(--transition-fast), transform 0.1s;
}

.btn-primary:hover:not(:disabled) {
  background: var(--color-accent-hover);
}

.btn-primary:active:not(:disabled) {
  transform: scale(0.98);
}

.btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.form-footer {
  text-align: center;
  margin-top: 16px;
  font-size: 13px;
  color: var(--color-text-secondary);
}

.form-footer a {
  color: var(--color-accent-text);
  text-decoration: none;
  font-weight: 500;
}

.form-footer a:hover {
  text-decoration: underline;
}

.auth-footer {
  text-align: center;
  margin-top: 24px;
}

.auth-footer p {
  font-size: 12px;
  color: var(--color-text-tertiary);
  margin: 0;
}

.auth-footer a {
  color: var(--color-text-secondary);
  text-decoration: none;
}

.auth-footer a:hover {
  text-decoration: underline;
}
</style>
