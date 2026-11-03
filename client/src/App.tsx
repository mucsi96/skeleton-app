import { Suspense, lazy } from 'react';
import { Header } from './Header';
import { LoadingGreeting } from './LoadingGreeting';
import styles from './App.module.css';

const Home = lazy(() => import('./Home'));

export function App() {
  return <><Header /><main className={styles.main}><Suspense fallback={<LoadingGreeting />}><Home /></Suspense></main></>;
}
