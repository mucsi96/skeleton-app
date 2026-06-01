import { initializeFaro } from '@grafana/faro-web-sdk';

export function initFaro(clientLogUrl: string): void {
  if (!clientLogUrl) {
    return;
  }

  initializeFaro({
    url: clientLogUrl,
    app: {
      name: 'skeleton-app',
      version: '1.0.0',
    },
    // Faro filters out console.log/debug/trace by default; capture every level
    // so the auth/token-renewal traces and any third-party console output land
    // in the backend logs.
    consoleInstrumentation: {
      disabledLevels: [],
    },
  });
}
