import { reactive, computed, watch } from 'vue';
import { DEFAULT_VIEWS, VIEW_NOTIFICATIONS_ID } from '../config/default-views';
import { getFilterById, getSorterById } from '../config/view-filters';
import type { ViewConfig, ViewId, SerializableViewConfig } from '../model/view-types';

const STORAGE_KEY = 'pr-manager-views';
const SAVE_DEBOUNCE_MS = 1000;

interface ViewStoreState {
  activeViewId: ViewId;
  views: ViewConfig[];
  customViews: SerializableViewConfig[];
  viewOrders: Record<ViewId, number>;
}

const defaultState: ViewStoreState = {
  activeViewId: VIEW_NOTIFICATIONS_ID,
  views: [...DEFAULT_VIEWS],
  customViews: [],
  viewOrders: {},
};

function loadState(): ViewStoreState {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);

      const customViews: ViewConfig[] = (parsed.customViews || []).map(deserializeView);
      const viewOrders: Record<ViewId, number> = parsed.viewOrders || {};
      const allViews = [...DEFAULT_VIEWS, ...customViews];

      allViews.forEach((view) => {
        if (viewOrders[view.id] !== undefined) {
          view.order = viewOrders[view.id];
        }
      });

      const storedActiveViewId = parsed.activeViewId;
      const activeViewExists = allViews.some((v) => v.id === storedActiveViewId);
      const validActiveViewId = activeViewExists
        ? storedActiveViewId
        : (allViews[0]?.id || defaultState.activeViewId);

      return {
        activeViewId: validActiveViewId,
        views: allViews,
        customViews: parsed.customViews || [],
        viewOrders,
      };
    }
  } catch (e) {
    console.error('Error loading view store:', e);
  }

  return { ...defaultState };
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let pendingState: ViewStoreState | null = null;

function saveState(state: ViewStoreState): void {
  pendingState = state;

  if (saveTimer) {
    return;
  }

  saveTimer = setTimeout(() => {
    saveTimer = null;
    if (pendingState) {
      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            activeViewId: pendingState.activeViewId,
            customViews: pendingState.customViews,
            viewOrders: pendingState.viewOrders,
          })
        );
      } catch (e) {
        console.error('Error saving view store:', e);
      }
      pendingState = null;
    }
  }, SAVE_DEBOUNCE_MS);
}

/**
 * Deserialize a stored view config back to ViewConfig.
 * Uses predefined filter/sorter IDs instead of executing arbitrary code for security.
 */
function deserializeView(serializable: SerializableViewConfig): ViewConfig {
  const queryBuilder = (username: string): string => {
    return serializable.queryTemplate.replace(/\{\{username\}\}/g, username);
  };

  const filterDef = serializable.filterId
    ? getFilterById(serializable.filterId)
    : undefined;

  const sorterDef = serializable.sorterId
    ? getSorterById(serializable.sorterId)
    : undefined;

  if (serializable.filterCode || serializable.sorterCode) {
    console.warn(
      `View "${serializable.id}" uses deprecated filterCode/sorterCode. ` +
      `These are ignored for security. Use filterId/sorterId instead.`
    );
  }

  return {
    id: serializable.id,
    name: serializable.name,
    icon: serializable.icon,
    queryBuilder,
    filter: filterDef?.fn,
    sorter: sorterDef?.fn,
    deduplicate: serializable.deduplicate,
    pageSize: serializable.pageSize,
    readonly: serializable.readonly || false,
    order: serializable.order,
    applyExplicitReviewerFilter: serializable.applyExplicitReviewerFilter,
  };
}

export function serializeView(view: ViewConfig, filterId?: string, sorterId?: string): SerializableViewConfig {
  let queryTemplate = 'is:pr is:open';

  try {
    const sampleQuery = view.queryBuilder('{{username}}');
    if (typeof sampleQuery === 'string') {
      queryTemplate = sampleQuery;
    }
  } catch (e) {
    console.error('Error extracting query template:', e);
  }

  return {
    id: view.id,
    name: view.name,
    icon: view.icon,
    queryTemplate,
    filterId,
    sorterId,
    deduplicate: view.deduplicate,
    pageSize: view.pageSize,
    readonly: view.readonly || false,
    order: view.order,
    applyExplicitReviewerFilter: view.applyExplicitReviewerFilter,
  };
}

export const viewStore = reactive<ViewStoreState>(loadState());

watch(
  () => ({
    activeViewId: viewStore.activeViewId,
    customViews: viewStore.customViews,
    viewOrders: viewStore.viewOrders
  }),
  (newState) => {
    saveState({ ...viewStore, ...newState });
  },
  { deep: true }
);

export const activeView = computed<ViewConfig>(() => {
  return viewStore.views.find((v) => v.id === viewStore.activeViewId) || viewStore.views[0];
});

export const sortedViews = computed<ViewConfig[]>(() => {
  return [...viewStore.views].sort((a, b) => {
    const orderA = viewStore.viewOrders[a.id] ?? a.order ?? 999;
    const orderB = viewStore.viewOrders[b.id] ?? b.order ?? 999;
    return orderA - orderB;
  });
});

export function setActiveView(viewId: ViewId): void {
  const view = viewStore.views.find((v) => v.id === viewId);
  if (view) {
    viewStore.activeViewId = viewId;
  } else {
    console.warn(`View with id "${viewId}" not found`);
  }
}

export function addCustomView(view: ViewConfig): void {
  if (viewStore.views.some((v) => v.id === view.id)) {
    throw new Error(`View with id "${view.id}" already exists`);
  }

  const customView = { ...view, readonly: false };
  const serializable = serializeView(customView);
  viewStore.customViews.push(serializable);
  viewStore.views.push(customView);
}

export function updateView(viewId: ViewId, updates: Partial<ViewConfig>): void {
  const index = viewStore.views.findIndex((v) => v.id === viewId);
  if (index === -1) {
    throw new Error(`View with id "${viewId}" not found`);
  }

  const view = viewStore.views[index];
  const isOnlyOrderUpdate = Object.keys(updates).length === 1 && 'order' in updates;

  if (view.readonly && !isOnlyOrderUpdate) {
    throw new Error('Cannot modify readonly view (except order)');
  }

  Object.assign(view, updates);

  if ('order' in updates && updates.order !== undefined) {
    viewStore.viewOrders[viewId] = updates.order;
  }

  if (!view.readonly) {
    const customIndex = viewStore.customViews.findIndex((v) => v.id === viewId);
    if (customIndex !== -1) {
      viewStore.customViews[customIndex] = serializeView(view);
    }
  }
}

export function deleteView(viewId: ViewId): void {
  const view = viewStore.views.find((v) => v.id === viewId);
  if (view?.readonly) {
    throw new Error('Cannot delete readonly view');
  }

  viewStore.views = viewStore.views.filter((v) => v.id !== viewId);
  viewStore.customViews = viewStore.customViews.filter((v) => v.id !== viewId);

  if (viewStore.activeViewId === viewId) {
    viewStore.activeViewId = viewStore.views[0]?.id || VIEW_NOTIFICATIONS_ID;
  }
}

export function reorderViews(viewIds: ViewId[]): void {
  viewIds.forEach((viewId, index) => {
    const view = viewStore.views.find((v) => v.id === viewId);
    if (view && !view.readonly) {
      view.order = index;

      const customIndex = viewStore.customViews.findIndex((v) => v.id === viewId);
      if (customIndex !== -1) {
        viewStore.customViews[customIndex].order = index;
      }
    }
  });
}

export function getView(viewId: ViewId): ViewConfig | undefined {
  return viewStore.views.find((v) => v.id === viewId);
}

export function hasView(viewId: ViewId): boolean {
  return viewStore.views.some((v) => v.id === viewId);
}

export function resetToDefaults(): void {
  viewStore.views = [...DEFAULT_VIEWS];
  viewStore.customViews = [];
  viewStore.activeViewId = VIEW_NOTIFICATIONS_ID;
}
