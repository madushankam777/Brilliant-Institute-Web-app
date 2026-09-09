import { useState } from 'react';
import Icon from './Icon';

// Reusable labeled input with validation error text. Optional `icon`
// renders a leading glyph (mail/lock/user/...) inside the input, and any
// type="password" field automatically gets a show/hide toggle - matching
// the input style used across every form in the design mockups.
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
  const [revealed, setRevealed] = useState(false);
  const isPassword = type === 'password';
  const resolvedType = isPassword && revealed ? 'text' : type;
  const showValidMark = valid && !error && !isPassword;

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

  return (
    <div className={fieldClassNames}>
      <label htmlFor={id}>
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </label>
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
        {showValidMark && (
          <span className="input-toggle" style={{ color: 'var(--color-success)' }}>
            <Icon name="checkCircle" size={17} />
          </span>
        )}
      </div>
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
