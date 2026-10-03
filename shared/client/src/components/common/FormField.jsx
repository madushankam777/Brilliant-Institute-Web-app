// form field - a labelled input with an error, help text, an optional icon and a show / hide password btn
import { useState } from 'react';
import Icon from './Icon';

// form field - label, input, and its error or help text
function FormField({
  id,
  label,
  type = 'text',
  value,
  onChange,
  onFocus,
  error,
  valid = false,
  required = false,
  autoComplete,
  placeholder,
  helpText,
  disabled = false,
  icon,
}) {
  // is the password shown, and the field's css classes
  const [revealed, setRevealed] = useState(false);
  const isPassword = type === 'password';
  const resolvedType = isPassword && revealed ? 'text' : type;
  const showValidMark = valid && !error && !isPassword;

  // ids that link the input to its error and help text (for screen readers)
  const errorId = error ? `${id}-error` : undefined;
  const helpId = helpText ? `${id}-help` : undefined;
  const describedBy = [errorId, helpId].filter(Boolean).join(' ') || undefined;

  const fieldClassNames = [
    'form-field',
    icon ? 'has-icon' : '',
    isPassword || showValidMark ? 'has-toggle' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const inputClassNames = [error ? 'input-error' : '', !error && valid ? 'input-valid' : '']
    .filter(Boolean)
    .join(' ');

  // the field - label, the input with its icon and buttons, then the help or error text
  return (
    <div className={fieldClassNames}>
      <label htmlFor={id}>
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </label>
      {/* the input with its icon, show / hide password btn and valid tick */}
      <div className="input-shell">
        {icon && (
          <span className="input-icon">
            <Icon name={icon} size={17} />
          </span>
        )}
        <input
          id={id}
          name={id}
          type={resolvedType}
          value={value}
          onChange={onChange}
          onFocus={onFocus}
          required={required}
          autoComplete={autoComplete}
          placeholder={placeholder}
          disabled={disabled}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          className={inputClassNames}
        />
        {/* show / hide password btn */}
        {isPassword && (
          <button
            type="button"
            className="input-toggle"
            onClick={() => setRevealed((prev) => !prev)}
            tabIndex={-1}
            aria-label={revealed ? 'Hide password' : 'Show password'}
          >
            <Icon name={revealed ? 'eyeOff' : 'eye'} size={17} />
          </button>
        )}
        {/* green tick when the value is valid */}
        {showValidMark && (
          <span className="input-toggle" style={{ color: 'var(--color-success)' }}>
            <Icon name="checkCircle" size={17} />
          </span>
        )}
      </div>
      {/* help text */}
      {helpText && (
        <p id={helpId} className="field-help">
          {helpText}
        </p>
      )}
      {/* error text */}
      {error && (
        <p id={errorId} className="field-error">
          {error}
        </p>
      )}
    </div>
  );
}

export default FormField;
