import { ref, computed } from 'vue';

export type RouteType = 'loading' | 'login' | 'keychain-required' | 'subscription' | 'token' | 'app';

const _currentRoute = ref<RouteType>('loading');
const _previousRoute = ref<RouteType | null>(null);

const ROUTE_ORDER: RouteType[] = ['login', 'keychain-required', 'subscription', 'token', 'app'];

function getDirection(from: RouteType, to: RouteType): 'forward' | 'back' | 'none' {
  if (from === 'loading' || to === 'loading') return 'none';
  const fromIdx = ROUTE_ORDER.indexOf(from);
  const toIdx = ROUTE_ORDER.indexOf(to);
  if (fromIdx === -1 || toIdx === -1) return 'none';
  return toIdx > fromIdx ? 'forward' : 'back';
}

const _transitionName = computed(() => {
  if (!_previousRoute.value) return 'fade';
  const dir = getDirection(_previousRoute.value, _currentRoute.value);
  if (dir === 'none') return 'fade';
  return dir === 'forward' ? 'slide-left' : 'slide-right';
});

function navigate(route: RouteType) {
  if (route === _currentRoute.value) return;
  _previousRoute.value = _currentRoute.value;
  _currentRoute.value = route;
}

function replace(route: RouteType) {
  _previousRoute.value = null;
  _currentRoute.value = route;
}

// Export refs directly for proper reactivity
export const routerStore = {
  currentRoute: _currentRoute,
  transitionName: _transitionName,
  navigate,
  replace,
};
