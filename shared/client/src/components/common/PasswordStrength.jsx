// Visual 3-bar strength meter shown under the password field on
// Register/Reset password pages. Purely a UI hint - the real rule is
// still enforced by isStrongPassword()/the server, this just reflects it.
function scorePassword(password) {
  if (!password) return 0;
  let score = 0;
  if (password.length >= 8) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password) && password.length >= 10) score += 1;
  return Math.min(score, 3);
}

const LABELS = ['Too weak', 'Weak password', 'Good password', 'Strong password'];
const TONES = ['weak', 'weak', 'medium', 'strong'];

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
