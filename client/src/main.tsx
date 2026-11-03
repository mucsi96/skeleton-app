import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { initializeFaro } from '@grafana/faro-web-sdk';
import '@mucsi96/react-ui/styles.css';
import '@fontsource/roboto/400.css';
import '@fontsource/roboto/700.css';
import './styles.css';
import { App } from './App';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });

initializeFaro({
  url: new URL('/_telemetry/collect', window.location.origin).href,
  app: { name: 'hello-client', version: '1.0.0' },
  consoleInstrumentation: { disabledLevels: [] },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
