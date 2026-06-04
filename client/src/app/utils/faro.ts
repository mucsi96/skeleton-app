import { faro, initializeFaro, LogLevel } from '@grafana/faro-web-sdk';

export function initFaro(clientLogUrl: string, clientAppName: string): void {
  if (!clientLogUrl) {
    return;
  }

  initializeFaro({
    url: clientLogUrl,
    app: {
      name: clientAppName,
      version: '1.0.0',
    },
    // Faro filters out console.log/debug/trace by default; capture every level
    // so the auth/token-renewal traces and any third-party console output land
    // in the backend logs.
    consoleInstrumentation: {
      disabledLevels: [],
    },
    // The "about to redirect to Entra" log fires synchronously right before
    // AuthService.login() hands off to UserManager.signinRedirect (which
    // navigates away). Faro's default 250 ms batch timer can miss that window,
    // so collapse it - each log
    // still batches across the same synchronous tick (multiple sync logs
    // share one request), but the request actually flights before the
    // cross-origin navigation begins. Combined with FetchTransport's
    // keepalive: true default, the request survives the redirect.
    batching: {
      sendTimeout: 0,
    },
  });

  installFlushOnHide();
}

/**
 * Belt-and-suspenders flush on page lifecycle transitions. Faro's batch
 * executor already listens to pagehide internally, but on iOS PWA the
 * pagehide event is not always delivered before window.location is
 * reassigned by `oidc.authorize()`. visibilitychange=hidden fires earlier
 * and more reliably, so triggering a Faro API call here forces the next
 * macrotask to drain the queue while the page is still alive.
 */
function installFlushOnHide(): void {
  const flush = (reason: 'pagehide' | 'visibilitychange'): void => {
    // pushLog enqueues an event that the batch executor will send on the
    // next macrotask (sendTimeout: 0 above). The event itself is useful as
    // a marker showing whether the hide hook fired before the redirect.
    faro?.api?.pushLog([`[faro] flush on ${reason}`], { level: LogLevel.INFO });
  };

  window.addEventListener('pagehide', () => flush('pagehide'));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      flush('visibilitychange');
    }
  });
}

/**
 * Enqueues a marker log right before we hand control to a full-page redirect
 * (signinRedirect/signoutRedirect). With sendTimeout: 0 the queued logs flight
 * on the next macrotask - before the asynchronous discovery call inside the
 * redirect resolves and navigates away - so the pre-redirect trace survives.
 */
export function flushFaro(): void {
  faro?.api?.pushLog(['[faro] flush before redirect'], {
    level: LogLevel.INFO,
  });
}
