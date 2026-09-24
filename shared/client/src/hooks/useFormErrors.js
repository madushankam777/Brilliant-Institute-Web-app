import { useCallback, useState } from 'react';

/**
 * Keeps per-field error messages for a form, and turns a rejected API call
 * into those same per-field messages.
 *
 * The API rejects with { message, status, details }, where details is
 * [{ field, message }] straight from express-validator. Anything that names a
 * field lands under that field; anything that doesn't (a conflict, a 500)
 * stays in formError for the banner above the form.
 *
 *   const { fieldErrors, formError, validate, captureError, clearErrors } = useFormErrors();
 *
 *   if (!validate({ fee: !form.fee && 'Enter a monthly fee.' })) return;
 *   try { await save(); } catch (error) { captureError(error); }
 */
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

  /**
   * Checks a map of field -> message-or-falsy. Returns true when everything
   * passed, so a caller can `if (!validate({...})) return;`.
   */
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
      // Nested paths ("paymentDetails.cardLast4") are kept whole and also
      // stored under the leaf, so a form can key off whichever it uses.
      if (!mapped[detail.field]) mapped[detail.field] = detail.message;
      const leaf = String(detail.field).split('.').pop();
      if (leaf && !mapped[leaf]) mapped[leaf] = detail.message;
    });

    setFieldErrors(mapped);
    // With every problem shown under its own field, the banner would just
    // repeat "Please fix the highlighted fields" - so leave it out.
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
