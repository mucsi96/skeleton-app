import { Suspense, lazy } from 'react';
import { Header } from './Header';
import { LoadingGreeting } from './LoadingGreeting';

const Home = lazy(() => import('./Home'));

export function App() {
  return <><Header /><main><Suspense fallback={<LoadingGreeting />}><Home /></Suspense></main></>;
}
