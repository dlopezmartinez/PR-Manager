<template>
  <div class="subscription-screen">
    <div class="subscription-container">
      <!-- Awaiting Payment State -->
      <div v-if="awaitingPayment" class="subscription-content">
        <div class="icon-container loading">
          <svg class="spinner" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10" stroke-opacity="0.25"/>
            <path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"/>
          </svg>
        </div>

        <h2>Waiting for payment confirmation...</h2>
        <p class="description">
          Complete your payment in the browser. This page will update automatically once confirmed.
        </p>

        <div class="polling-status">
          <span class="dot"></span>
          Checking payment status...
        </div>

        <button class="btn-secondary" @click="cancelAwaitingPayment">
          Cancel
        </button>

        <p v-if="pollingTimedOut" class="timeout-message">
          Taking longer than expected? If you completed payment in LemonSqueezy,
          try <button class="btn-link" @click="handleRetryCheck">signing in again</button>.
        </p>
      </div>

      <!-- Subscribe State -->
      <div v-else-if="!authStore.isActive.value" class="subscription-content">
        <div class="icon-container warning">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
        </div>

        <h2>{{ title }}</h2>
        <p class="description">{{ description }}</p>

        <div class="pricing-cards">
          <div class="pricing-card" :class="{ selected: selectedPlan === 'monthly' }" @click="selectedPlan = 'monthly'">
            <div class="plan-name">Monthly</div>
            <div class="plan-price">
              <span class="amount">€2.99</span>
              <span class="period">/month</span>
            </div>
          </div>

          <div class="pricing-card featured" :class="{ selected: selectedPlan === 'yearly' }" @click="selectedPlan = 'yearly'">
            <div class="badge">Save 17%</div>
            <div class="plan-name">Yearly</div>
            <div class="plan-price">
              <span class="amount">€29.99</span>
              <span class="period">/year</span>
            </div>
          </div>
        </div>

        <button class="btn-primary" :disabled="isLoading" @click="handleSubscribe">
          <span v-if="isLoading">Opening checkout...</span>
          <span v-else>Subscribe Now</span>
        </button>

        <p class="guarantee">30-day money-back guarantee</p>

        <div v-if="error" class="error-message">
          {{ error }}
        </div>
      </div>

      <div v-else class="subscription-content">
        <div class="icon-container success">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
            <polyline points="22,4 12,14.01 9,11.01"/>
          </svg>
        </div>

        <h2>Subscription Active</h2>
        <p class="description">
          <span v-if="authStore.isTrialing.value">
            You have {{ authStore.trialDaysLeft.value }} days left in your free trial.
          </span>
          <span v-else>
            Your subscription is active until {{ formatDate(authStore.state.subscription?.currentPeriodEnd) }}.
          </span>
        </p>

        <button class="btn-secondary" :disabled="isLoading" @click="handleManageSubscription">
          <span v-if="isLoading">Opening portal...</span>
          <span v-else>Manage Subscription</span>
        </button>
      </div>

      <div class="subscription-footer">
        <button class="btn-text" @click="handleLogout">
          Sign out
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue';
import { authStore } from '../stores/authStore';

const POLLING_INTERVAL_MS = 5000; // Check every 5 seconds
const POLLING_TIMEOUT_MS = 90000; // Show timeout message after 90 seconds

const emit = defineEmits<{
  (e: 'subscribed'): void;
  (e: 'logout'): void;
}>();

const selectedPlan = ref<'monthly' | 'yearly'>('yearly');
const isLoading = ref(false);
const error = ref('');
const awaitingPayment = ref(false);
const pollingTimedOut = ref(false);

let pollingInterval: ReturnType<typeof setInterval> | null = null;
let timeoutTimer: ReturnType<typeof setTimeout> | null = null;

const title = computed(() => {
  const status = authStore.state.subscription?.status;
  if (status === 'trialing') {
    return 'Your trial has ended';
  }
  if (status === 'canceled') {
    return 'Subscription canceled';
  }
  if (status === 'past_due') {
    return 'Payment required';
  }
  return 'Subscribe to continue';
});

const description = computed(() => {
  const status = authStore.state.subscription?.status;
  if (status === 'trialing') {
    return 'Subscribe now to continue using PR Manager and keep all your data.';
  }
  if (status === 'canceled') {
    return 'Your subscription has been canceled. Subscribe again to continue using PR Manager.';
  }
  if (status === 'past_due') {
    return 'Your payment failed. Please update your payment method to continue.';
  }
  return 'Choose a plan to unlock all features of PR Manager.';
});

function formatDate(dateString?: string): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function startPolling() {
  awaitingPayment.value = true;
  pollingTimedOut.value = false;

  // Start polling interval
  pollingInterval = setInterval(async () => {
    try {
      await authStore.refreshSubscription();
      if (authStore.isActive.value) {
        stopPolling();
        emit('subscribed');
      }
    } catch (err) {
      console.error('Polling error:', err);
    }
  }, POLLING_INTERVAL_MS);

  // Set timeout timer
  timeoutTimer = setTimeout(() => {
    pollingTimedOut.value = true;
  }, POLLING_TIMEOUT_MS);
}

function stopPolling() {
  awaitingPayment.value = false;
  pollingTimedOut.value = false;

  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }
  if (timeoutTimer) {
    clearTimeout(timeoutTimer);
    timeoutTimer = null;
  }
}

function cancelAwaitingPayment() {
  stopPolling();
}

async function handleRetryCheck() {
  stopPolling();
  await authStore.logout();
  emit('logout');
}

onUnmounted(() => {
  stopPolling();
});

async function handleSubscribe() {
  isLoading.value = true;
  error.value = '';

  try {
    await authStore.openCheckout(selectedPlan.value);
    // Start polling after checkout is opened
    startPolling();
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to open checkout';
  } finally {
    isLoading.value = false;
  }
}

async function handleManageSubscription() {
  isLoading.value = true;
  error.value = '';

  try {
    await authStore.openCustomerPortal();
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to open portal';
  } finally {
    isLoading.value = false;
  }
}

async function handleLogout() {
  await authStore.logout();
  emit('logout');
}
</script>

<style scoped>
.subscription-screen {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: 24px;
  background: var(--color-bg-primary);
}

.subscription-container {
  width: 100%;
  max-width: 400px;
}

.subscription-content {
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border-primary);
  border-radius: var(--radius-xl);
  padding: 32px 24px;
  text-align: center;
}

.icon-container {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  border-radius: var(--radius-full);
  margin-bottom: 16px;
}

.icon-container.warning {
  background: var(--color-warning-bg);
  color: var(--color-warning);
}

.icon-container.success {
  background: var(--color-success-bg);
  color: var(--color-success);
}

.subscription-content h2 {
  font-size: 20px;
  font-weight: 600;
  margin: 0 0 8px 0;
  color: var(--color-text-primary);
}

.description {
  font-size: 14px;
  color: var(--color-text-secondary);
  margin: 0 0 24px 0;
  line-height: 1.5;
}

.pricing-cards {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 20px;
}

.pricing-card {
  position: relative;
  padding: 16px;
  border: 2px solid var(--color-border-primary);
  border-radius: var(--radius-lg);
  cursor: pointer;
  transition: border-color var(--transition-fast), transform 0.1s;
}

.pricing-card:hover {
  border-color: var(--color-text-tertiary);
}

.pricing-card.selected {
  border-color: var(--color-accent-primary);
  background: var(--color-accent-lighter);
}

.pricing-card.featured .badge {
  position: absolute;
  top: -10px;
  left: 50%;
  transform: translateX(-50%);
  padding: 2px 8px;
  background: var(--color-accent-primary);
  color: var(--color-text-inverted);
  font-size: 10px;
  font-weight: 600;
  border-radius: var(--radius-sm);
  text-transform: uppercase;
}

.plan-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-secondary);
  margin-bottom: 4px;
}

.plan-price {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 2px;
}

.plan-price .amount {
  font-size: 22px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.plan-price .period {
  font-size: 12px;
  color: var(--color-text-tertiary);
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

.btn-secondary {
  width: 100%;
  padding: 12px 16px;
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-primary);
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border-primary);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: background var(--transition-fast), transform 0.1s;
}

.btn-secondary:hover:not(:disabled) {
  background: var(--color-bg-hover);
}

.btn-secondary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.guarantee {
  font-size: 12px;
  color: var(--color-text-tertiary);
  margin: 12px 0 0 0;
}

.error-message {
  margin-top: 16px;
  padding: 10px 12px;
  background: var(--color-error-bg);
  border: 1px solid var(--color-error);
  border-radius: var(--radius-md);
  color: var(--color-error);
  font-size: 13px;
}

.subscription-footer {
  text-align: center;
  margin-top: 16px;
}

.btn-text {
  padding: 8px 16px;
  font-size: 13px;
  color: var(--color-text-secondary);
  background: none;
  border: none;
  cursor: pointer;
  transition: color 0.2s;
}

.btn-text:hover {
  color: var(--color-text-primary);
}

/* Awaiting Payment Styles */
.icon-container.loading {
  background: var(--color-accent-lighter);
  color: var(--color-accent-primary);
}

.spinner {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.polling-status {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 13px;
  color: var(--color-text-secondary);
  margin-bottom: 20px;
}

.polling-status .dot {
  width: 8px;
  height: 8px;
  background: var(--color-accent-primary);
  border-radius: 50%;
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(0.8); }
}

.timeout-message {
  margin-top: 16px;
  padding: 12px;
  background: var(--color-warning-bg);
  border-radius: var(--radius-md);
  font-size: 13px;
  color: var(--color-text-secondary);
  line-height: 1.5;
}

.btn-link {
  background: none;
  border: none;
  padding: 0;
  font-size: inherit;
  color: var(--color-accent-primary);
  cursor: pointer;
  text-decoration: underline;
}

.btn-link:hover {
  color: var(--color-accent-hover);
}
</style>
