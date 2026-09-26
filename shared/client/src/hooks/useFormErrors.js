import { useCallback, useState } from 'react';

// per-field form errors, including errors from the API
function useFormErrors() {
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState('');

  const clearErrors = useCallback(() => {
    setFieldErrors({});
    setFormError('');
  }, []);

  /** Drops one field's error - call it as the user edits that field. */
  const clearFieldError = useCallback((field) => {
    setFieldErrors((previous) => {
      if (!previous[field]) return previous;
      const next = { ...previous };
      delete next[field];
      return next;
    });
  }, []);

  // Checks a map of field -> message-or-falsy
  const validate = useCallback((checks) => {
    const found = {};
    Object.entries(checks).forEach(([field, message]) => {
      if (message) found[field] = message;
    });
    setFieldErrors(found);
    setFormError('');
    return Object.keys(found).length === 0;
  }, []);

  /** Puts a rejected API call onto the right fields. */
  const captureError = useCallback((error) => {
    const details = error && Array.isArray(error.details) ? error.details : [];
    const mapped = {};
    details.forEach((detail) => {
      if (!detail || !detail.field) return;
      // keep nested field paths and their last part
      if (!mapped[detail.field]) mapped[detail.field] = detail.message;
      const leaf = String(detail.field).split('.').pop();
      if (leaf && !mapped[leaf]) mapped[leaf] = detail.message;
    });

    setFieldErrors(mapped);
    // no banner when every error is under its field
    setFormError(Object.keys(mapped).length > 0 ? '' : (error && error.message) || 'Something went wrong.');
  }, []);

  return {
    fieldErrors,
    formError,
    setFieldErrors,
    setFormError,
    clearErrors,
    clearFieldError,
    validate,
    captureError,
  };
}

export default useFormErrors;
