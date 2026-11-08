import { Suspense, lazy } from 'react';
import { AppMain, LoadingArea } from '@mucsi96/react-ui';
import { Header } from './Header';
import styles from './App.module.css';

const Home = lazy(() => import('./Home'));

export function App() {
  return <div className={styles.layout}><Header /><AppMain className={styles.main}><Suspense fallback={<LoadingArea label="Opening page" fill />}><Home /></Suspense></AppMain></div>;
}
