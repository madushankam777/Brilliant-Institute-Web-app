// loading indicator for a section of a page
function LoadingSpinner({ label = 'Loading...' }) {
  return (
    <div className="loading-spinner" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <span className="loading-label">{label}</span>
    </div>
  );
}

export default LoadingSpinner;
