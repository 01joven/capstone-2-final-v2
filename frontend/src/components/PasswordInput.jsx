import { useState } from 'react';

const PasswordInput = ({
  id,
  label = 'Password',
  value,
  onChange,
  autoComplete = 'new-password',
  minLength,
  maxLength,
  required = false,
  placeholder,
}) => {
  const [visible, setVisible] = useState(false);

  return (
    <div className="form-group">
      <label htmlFor={id}>{label}</label>
      <div className="password-field">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          autoComplete={autoComplete}
          value={value}
          onChange={onChange}
          minLength={minLength}
          maxLength={maxLength}
          placeholder={placeholder}
          required={required}
        />
        <button
          type="button"
          className="password-toggle"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
          title={visible ? 'Hide password' : 'Show password'}
        >
          {visible ? '🙈' : '👁️'}
        </button>
      </div>
    </div>
  );
};

export default PasswordInput;
