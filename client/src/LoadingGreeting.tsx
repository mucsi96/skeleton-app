import styles from './LoadingGreeting.module.css';

export function LoadingGreeting() {
  return <div role="status" aria-label="Loading greeting" className={styles.skeleton}>
    <span className={styles.line} /><span className={styles.line} /><span className={styles.card} />
  </div>;
}
