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
  });
}
