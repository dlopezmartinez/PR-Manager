import { ref, watch, onMounted, onUnmounted } from 'vue';
import { configStore } from '../stores/configStore';

type Theme = 'light' | 'dark' | 'system';
type ResolvedTheme = 'light' | 'dark';

const currentTheme = ref<ResolvedTheme>('light');

function detectSystemTheme(): ResolvedTheme {
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
}

function resolveTheme(theme: Theme): ResolvedTheme {
  if (theme === 'system') {
    return detectSystemTheme();
  }
  return theme;
}

function applyTheme(theme: ResolvedTheme): void {
  document.documentElement.setAttribute('data-theme', theme);
  currentTheme.value = theme;
}

export function useTheme() {
  let mediaQueryList: MediaQueryList | null = null;

  const updateTheme = () => {
    const resolved = resolveTheme(configStore.theme);
    applyTheme(resolved);
  };

  onMounted(() => {
    updateTheme();

    watch(() => configStore.theme, updateTheme);

    if (window.matchMedia) {
      mediaQueryList = window.matchMedia('(prefers-color-scheme: dark)');

      const handleSystemThemeChange = () => {
        if (configStore.theme === 'system') {
          updateTheme();
        }
      };

      if (mediaQueryList.addEventListener) {
        mediaQueryList.addEventListener('change', handleSystemThemeChange);
      } else {
        mediaQueryList.addListener(handleSystemThemeChange);
      }
    }
  });

  onUnmounted(() => {
    if (mediaQueryList) {
      const handleSystemThemeChange = () => {
        if (configStore.theme === 'system') {
          updateTheme();
        }
      };

      if (mediaQueryList.removeEventListener) {
        mediaQueryList.removeEventListener('change', handleSystemThemeChange);
      } else {
        mediaQueryList.removeListener(handleSystemThemeChange);
      }
    }
  });

  return {
    currentTheme,
    updateTheme,
  };
}
