// Reusable labeled input with validation error text
function FormField({
  id,
  label,
  type = 'text',
  value,
  onChange,
  error,
  required = false,
  autoComplete,
  placeholder,
  helpText,
  disabled = false,
}) {
  const errorId = error ? `${id}-error` : undefined;
  const helpId = helpText ? `${id}-help` : undefined;
  const describedBy = [errorId, helpId].filter(Boolean).join(' ') || undefined;

  return (
    <div className="form-field">
      <label htmlFor={id}>
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        value={value}
        onChange={onChange}
        required={required}
        autoComplete={autoComplete}
        placeholder={placeholder}
        disabled={disabled}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy}
        className={error ? 'input-error' : ''}
      />
      {helpText && (
        <p id={helpId} className="field-help">
          {helpText}
        </p>
      )}
      {error && (
        <p id={errorId} className="field-error">
          {error}
        </p>
      )}
    </div>
  );
}

export default FormField;
