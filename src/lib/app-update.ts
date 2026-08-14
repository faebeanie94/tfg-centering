/**
 * Force the installed / browser app to load the latest deploy.
 * Does NOT touch IndexedDB — the saved card library is preserved.
 */
export async function refreshAppToLatest(): Promise<void> {
  try {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
  } catch {
    // Ignore cache API failures; still reload.
  }

  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((reg) => reg.unregister()));
    }
  } catch {
    // Ignore SW failures; still reload.
  }

  // Bust any cached HTML document, then reload from the network.
  const url = new URL(window.location.href);
  url.searchParams.set('_app', Date.now().toString());
  window.location.replace(url.toString());
}

/** Build-time stamp injected by Vite (ISO string). */
export function getAppBuildLabel(): string {
  const raw = __APP_BUILD__;
  if (!raw) return 'dev';
  try {
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return raw;
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return raw;
  }
}
