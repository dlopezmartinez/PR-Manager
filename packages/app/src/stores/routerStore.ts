import { ref, computed } from 'vue';

export type RouteType = 'loading' | 'login' | 'keychain-required' | 'subscription' | 'token' | 'app';

const currentRoute = ref<RouteType>('loading');
const previousRoute = ref<RouteType | null>(null);

const ROUTE_ORDER: RouteType[] = ['login', 'keychain-required', 'subscription', 'token', 'app'];

function getDirection(from: RouteType, to: RouteType): 'forward' | 'back' | 'none' {
  if (from === 'loading' || to === 'loading') return 'none';
  const fromIdx = ROUTE_ORDER.indexOf(from);
  const toIdx = ROUTE_ORDER.indexOf(to);
  if (fromIdx === -1 || toIdx === -1) return 'none';
  return toIdx > fromIdx ? 'forward' : 'back';
}

const transitionName = computed(() => {
  if (!previousRoute.value) return 'fade';
  const dir = getDirection(previousRoute.value, currentRoute.value);
  if (dir === 'none') return 'fade';
  return dir === 'forward' ? 'slide-left' : 'slide-right';
});

function navigate(route: RouteType) {
  if (route === currentRoute.value) return;
  previousRoute.value = currentRoute.value;
  currentRoute.value = route;
}

function replace(route: RouteType) {
  previousRoute.value = null;
  currentRoute.value = route;
}

export const routerStore = {
  currentRoute: computed(() => currentRoute.value),
  transitionName,
  navigate,
  replace,
};
