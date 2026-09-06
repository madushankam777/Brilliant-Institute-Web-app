// Reusable success/error/info banner
function Alert({ type = 'info', message }) {
  if (!message) return null;

  return (
    <div className={`alert alert-${type}`} role={type === 'error' ? 'alert' : 'status'}>
      {message}
    </div>
  );
}

export default Alert;
