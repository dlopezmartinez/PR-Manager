/**
 * Tests for ErrorBoundary.vue component
 * Tests error catching and display functionality
 */

import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent, h, onMounted } from 'vue';
import ErrorBoundary from '../../src/components/ErrorBoundary.vue';

// Component that throws an error
const ErrorComponent = defineComponent({
  name: 'ErrorComponent',
  setup() {
    onMounted(() => {
      throw new Error('Test error message');
    });
    return () => h('div', 'Should not render');
  },
});

// Component that renders normally
const NormalComponent = defineComponent({
  name: 'NormalComponent',
  setup() {
    return () => h('div', { class: 'normal-content' }, 'Normal content');
  },
});

describe('ErrorBoundary', () => {
  describe('when no error occurs', () => {
    it('should render slot content normally', () => {
      const wrapper = mount(ErrorBoundary, {
        slots: {
          default: () => h(NormalComponent),
        },
      });

      expect(wrapper.find('.normal-content').exists()).toBe(true);
      expect(wrapper.find('.error-boundary').exists()).toBe(false);
    });

    it('should not show error UI', () => {
      const wrapper = mount(ErrorBoundary, {
        slots: {
          default: () => h('div', 'Test content'),
        },
      });

      expect(wrapper.find('.error-content').exists()).toBe(false);
      expect(wrapper.find('.retry-button').exists()).toBe(false);
    });
  });

  describe('when error occurs', () => {
    it('should catch errors from child components', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => { /* noop */ });

      const wrapper = mount(ErrorBoundary, {
        slots: {
          default: () => h(ErrorComponent),
        },
      });

      // Wait for the error to be caught
      await wrapper.vm.$nextTick();

      expect(wrapper.find('.error-boundary').exists()).toBe(true);
      expect(wrapper.find('.error-message').text()).toContain('Test error message');

      errorSpy.mockRestore();
    });

    it('should display fallback message', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => { /* noop */ });

      const wrapper = mount(ErrorBoundary, {
        props: {
          fallbackMessage: 'Custom error message',
        },
        slots: {
          default: () => h(ErrorComponent),
        },
      });

      await wrapper.vm.$nextTick();

      expect(wrapper.find('.error-title').text()).toBe('Custom error message');

      errorSpy.mockRestore();
    });

    it('should use default fallback message when not provided', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => { /* noop */ });

      const wrapper = mount(ErrorBoundary, {
        slots: {
          default: () => h(ErrorComponent),
        },
      });

      await wrapper.vm.$nextTick();

      expect(wrapper.find('.error-title').text()).toBe('Something went wrong');

      errorSpy.mockRestore();
    });

    it('should show retry button', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => { /* noop */ });

      const wrapper = mount(ErrorBoundary, {
        slots: {
          default: () => h(ErrorComponent),
        },
      });

      await wrapper.vm.$nextTick();

      const retryButton = wrapper.find('.retry-button');
      expect(retryButton.exists()).toBe(true);
      expect(retryButton.text()).toBe('Try Again');

      errorSpy.mockRestore();
    });

    it('should show technical details section', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => { /* noop */ });

      const wrapper = mount(ErrorBoundary, {
        slots: {
          default: () => h(ErrorComponent),
        },
      });

      await wrapper.vm.$nextTick();

      expect(wrapper.find('.error-details').exists()).toBe(true);
      expect(wrapper.find('details summary').text()).toBe('Technical Details');

      errorSpy.mockRestore();
    });

    it('should emit error event when error occurs', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => { /* noop */ });

      const wrapper = mount(ErrorBoundary, {
        slots: {
          default: () => h(ErrorComponent),
        },
      });

      await wrapper.vm.$nextTick();

      const emitted = wrapper.emitted('error');
      expect(emitted).toBeTruthy();
      expect(emitted![0][0]).toBeInstanceOf(Error);
      expect((emitted![0][0] as Error).message).toBe('Test error message');

      errorSpy.mockRestore();
    });
  });

  describe('retry functionality', () => {
    it('should have clickable retry button', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => { /* noop */ });

      const wrapper = mount(ErrorBoundary, {
        slots: {
          default: () => h(ErrorComponent),
        },
      });

      await wrapper.vm.$nextTick();

      // Verify error state
      expect(wrapper.find('.error-boundary').exists()).toBe(true);

      // Verify retry button exists and is clickable
      const retryButton = wrapper.find('.retry-button');
      expect(retryButton.exists()).toBe(true);
      expect(retryButton.element.tagName).toBe('BUTTON');

      // Verify component emitted error event
      expect(wrapper.emitted('error')).toBeTruthy();

      errorSpy.mockRestore();
    });
  });

  describe('error details', () => {
    it('should display error stack trace', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => { /* noop */ });

      const wrapper = mount(ErrorBoundary, {
        slots: {
          default: () => h(ErrorComponent),
        },
      });

      await wrapper.vm.$nextTick();

      const pre = wrapper.find('.error-details pre');
      expect(pre.exists()).toBe(true);
      // Stack trace should contain error information
      expect(pre.text()).toContain('Error');

      errorSpy.mockRestore();
    });
  });
});
