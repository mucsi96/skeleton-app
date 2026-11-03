export function LoadingGreeting() {
  return <div role="status" aria-label="Loading greeting" className="skeleton">
    <span className="skeleton-line" /><span className="skeleton-line" /><span className="skeleton-card" />
  </div>;
}
