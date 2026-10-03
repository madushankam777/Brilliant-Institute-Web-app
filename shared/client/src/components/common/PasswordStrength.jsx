// score a password 0 to 3 - length, mixed case, a number, and a symbol with 10+ characters
function scorePassword(password) {
  if (!password) return 0;
  let score = 0;
  if (password.length >= 8) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password) && password.length >= 10) score += 1;
  return Math.min(score, 3);
}

// the words shown for each score
const LABELS = ['Too weak', 'Weak password', 'Good password', 'Strong password'];
// the colour for each score
const TONES = ['weak', 'weak', 'medium', 'strong'];

// password strength meter - three bars and a word under the password box
function PasswordStrength({ password }) {
  if (!password) return null;
  const score = scorePassword(password);
  const tone = TONES[score];

  return (
    <div>
      <div className="password-strength">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={`password-strength-bar ${i < score ? `filled-${tone}` : ''}`}
          />
        ))}
      </div>
      <p className={`password-strength-label ${tone}`}>{LABELS[score]}</p>
    </div>
  );
}

export default PasswordStrength;
