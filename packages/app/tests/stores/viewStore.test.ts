/**
 * Tests for viewStore.ts
 * Tests view management functionality
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// We need to reset modules before importing to get fresh state
let viewStore: typeof import('../../src/stores/viewStore');

describe('viewStore', () => {
  beforeEach(async () => {
    // Clear localStorage
    localStorage.clear();

    // Reset modules to get fresh store state
    vi.resetModules();

    // Re-import the store
    viewStore = await import('../../src/stores/viewStore');
  });

  describe('initial state', () => {
    it('should have default active view as notifications', () => {
      expect(viewStore.viewStore.activeViewId).toBe('notifications');
    });

    it('should have default views loaded', () => {
      expect(viewStore.viewStore.views.length).toBeGreaterThan(0);
      expect(viewStore.viewStore.views.some(v => v.id === 'notifications')).toBe(true);
    });

    it('should have empty custom views initially', () => {
      expect(viewStore.viewStore.customViews).toEqual([]);
    });
  });

  describe('activeView computed', () => {
    it('should return the currently active view', () => {
      const active = viewStore.activeView.value;
      expect(active.id).toBe('notifications');
    });

    it('should return first view if activeViewId is invalid', async () => {
      viewStore.viewStore.activeViewId = 'non-existent-view';
      const active = viewStore.activeView.value;
      expect(active).toBeDefined();
      expect(active.id).toBe(viewStore.viewStore.views[0].id);
    });
  });

  describe('sortedViews computed', () => {
    it('should return views sorted by order', () => {
      const sorted = viewStore.sortedViews.value;
      expect(Array.isArray(sorted)).toBe(true);

      // Check that views are sorted
      for (let i = 1; i < sorted.length; i++) {
        const prevOrder = sorted[i - 1].order ?? 999;
        const currOrder = sorted[i].order ?? 999;
        expect(prevOrder).toBeLessThanOrEqual(currOrder);
      }
    });
  });

  describe('setActiveView', () => {
    it('should change the active view', () => {
      // First ensure we have a view to switch to
      const firstView = viewStore.viewStore.views[0];
      viewStore.setActiveView(firstView.id);
      expect(viewStore.viewStore.activeViewId).toBe(firstView.id);
    });

    it('should not change if view does not exist', () => {
      const currentId = viewStore.viewStore.activeViewId;
      viewStore.setActiveView('non-existent');
      expect(viewStore.viewStore.activeViewId).toBe(currentId);
    });
  });

  describe('addCustomView', () => {
    it('should add a new custom view', () => {
      const newView = {
        id: 'custom-test',
        name: 'Custom Test View',
        icon: '🔧',
        queryBuilder: (username: string) => `is:pr author:${username}`,
        readonly: false,
        order: 10,
      };

      const initialCount = viewStore.viewStore.views.length;
      viewStore.addCustomView(newView);

      expect(viewStore.viewStore.views.length).toBe(initialCount + 1);
      expect(viewStore.viewStore.views.some(v => v.id === 'custom-test')).toBe(true);
      expect(viewStore.viewStore.customViews.some(v => v.id === 'custom-test')).toBe(true);
    });

    it('should throw error if view ID already exists', () => {
      const existingView = viewStore.viewStore.views[0];
      const duplicateView = {
        id: existingView.id,
        name: 'Duplicate',
        icon: '📝',
        queryBuilder: (username: string) => `is:pr author:${username}`,
        readonly: false,
      };

      expect(() => viewStore.addCustomView(duplicateView)).toThrow();
    });
  });

  describe('updateView', () => {
    it('should update a custom view', () => {
      // First add a custom view
      const customView = {
        id: 'update-test',
        name: 'Original Name',
        icon: '📝',
        queryBuilder: (username: string) => `is:pr author:${username}`,
        readonly: false,
        order: 10,
      };
      viewStore.addCustomView(customView);

      // Update it
      viewStore.updateView('update-test', { name: 'Updated Name' });

      const updated = viewStore.viewStore.views.find(v => v.id === 'update-test');
      expect(updated?.name).toBe('Updated Name');
    });

    it('should allow updating order of readonly views', () => {
      const readonlyView = viewStore.viewStore.views.find(v => v.readonly);
      if (readonlyView) {
        const newOrder = 99;
        viewStore.updateView(readonlyView.id, { order: newOrder });

        const updated = viewStore.viewStore.views.find(v => v.id === readonlyView.id);
        expect(updated?.order).toBe(newOrder);
      }
    });

    it('should throw error when updating non-order properties of readonly view', () => {
      const readonlyView = viewStore.viewStore.views.find(v => v.readonly);
      if (readonlyView) {
        expect(() => {
          viewStore.updateView(readonlyView.id, { name: 'New Name' });
        }).toThrow();
      }
    });

    it('should throw error if view not found', () => {
      expect(() => {
        viewStore.updateView('non-existent', { name: 'Test' });
      }).toThrow();
    });
  });

  describe('deleteView', () => {
    it('should delete a custom view', () => {
      // Add a custom view first
      const customView = {
        id: 'delete-test',
        name: 'To Delete',
        icon: '🗑️',
        queryBuilder: (username: string) => `is:pr author:${username}`,
        readonly: false,
      };
      viewStore.addCustomView(customView);
      expect(viewStore.viewStore.views.some(v => v.id === 'delete-test')).toBe(true);

      // Delete it
      viewStore.deleteView('delete-test');
      expect(viewStore.viewStore.views.some(v => v.id === 'delete-test')).toBe(false);
      expect(viewStore.viewStore.customViews.some(v => v.id === 'delete-test')).toBe(false);
    });

    it('should throw error when deleting readonly view', () => {
      const readonlyView = viewStore.viewStore.views.find(v => v.readonly);
      if (readonlyView) {
        expect(() => viewStore.deleteView(readonlyView.id)).toThrow();
      }
    });

    it('should switch to first view if deleted view was active', () => {
      // Add and select a custom view
      const customView = {
        id: 'active-delete-test',
        name: 'Active Delete Test',
        icon: '📝',
        queryBuilder: (username: string) => `is:pr author:${username}`,
        readonly: false,
      };
      viewStore.addCustomView(customView);
      viewStore.setActiveView('active-delete-test');
      expect(viewStore.viewStore.activeViewId).toBe('active-delete-test');

      // Delete it
      viewStore.deleteView('active-delete-test');

      // Should switch to another view
      expect(viewStore.viewStore.activeViewId).not.toBe('active-delete-test');
    });
  });

  describe('getView', () => {
    it('should return view by ID', () => {
      const view = viewStore.getView('notifications');
      expect(view).toBeDefined();
      expect(view?.id).toBe('notifications');
    });

    it('should return undefined for non-existent view', () => {
      const view = viewStore.getView('non-existent');
      expect(view).toBeUndefined();
    });
  });

  describe('hasView', () => {
    it('should return true for existing view', () => {
      expect(viewStore.hasView('notifications')).toBe(true);
    });

    it('should return false for non-existent view', () => {
      expect(viewStore.hasView('non-existent')).toBe(false);
    });
  });

  describe('resetToDefaults', () => {
    it('should reset to default views', () => {
      // Add a custom view
      const customView = {
        id: 'reset-test',
        name: 'Reset Test',
        icon: '📝',
        queryBuilder: (username: string) => `is:pr author:${username}`,
        readonly: false,
      };
      viewStore.addCustomView(customView);
      expect(viewStore.viewStore.customViews.length).toBeGreaterThan(0);

      // Reset
      viewStore.resetToDefaults();

      expect(viewStore.viewStore.customViews).toEqual([]);
      expect(viewStore.viewStore.activeViewId).toBe('notifications');
    });
  });

  describe('persistence', () => {
    it('should persist custom views to localStorage', async () => {
      const customView = {
        id: 'persist-test',
        name: 'Persist Test',
        icon: '💾',
        queryBuilder: (username: string) => `is:pr author:${username}`,
        readonly: false,
        order: 5,
      };
      viewStore.addCustomView(customView);

      // Wait for the debounced save to complete (1s debounce + buffer)
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Check localStorage was updated
      const stored = localStorage.getItem('pr-manager-views');
      expect(stored).toBeTruthy();
      const parsed = JSON.parse(stored!);
      expect(parsed.customViews.some((v: any) => v.id === 'persist-test')).toBe(true);
    });
  });

  describe('serializeView', () => {
    it('should serialize a view config', () => {
      const view = {
        id: 'serialize-test',
        name: 'Serialize Test',
        icon: '📦',
        queryBuilder: (username: string) => `is:pr author:${username}`,
        readonly: false,
        order: 3,
        deduplicate: true,
        pageSize: 50,
      };

      const serialized = viewStore.serializeView(view);

      expect(serialized.id).toBe('serialize-test');
      expect(serialized.name).toBe('Serialize Test');
      expect(serialized.queryTemplate).toContain('{{username}}');
      expect(serialized.deduplicate).toBe(true);
      expect(serialized.pageSize).toBe(50);
    });
  });
});
