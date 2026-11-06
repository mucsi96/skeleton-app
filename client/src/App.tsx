import { Suspense, lazy } from 'react';
import { AppMain } from '@mucsi96/react-ui';
import { Header } from './Header';
import { LoadingGreeting } from './LoadingGreeting';
import styles from './App.module.css';

const Home = lazy(() => import('./Home'));

export function App() {
  return <div className={styles.layout}><Header /><AppMain><Suspense fallback={<LoadingGreeting />}><Home /></Suspense></AppMain></div>;
}
