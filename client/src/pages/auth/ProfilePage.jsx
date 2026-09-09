/**
 * ProfilePage.jsx
 * -----------------------------------------------------------------------
 * REG-07: view and edit your own profile, and change your password.
 * Two independent forms, two independent CRUD "UPDATE" operations.
 * -----------------------------------------------------------------------
 */

import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { updateMyProfile, changeMyPassword } from '../../api/authApi';
import FormField from '../../../../shared/client/src/components/common/FormField';
import Alert from '../../../../shared/client/src/components/common/Alert';
import PasswordStrength from '../../../../shared/client/src/components/common/PasswordStrength';
import PortalShell from '../../../../shared/client/src/components/layout/PortalShell';
import { getNavItems } from '../../../../shared/client/src/components/layout/navItems';

const PASSWORD_RULE_MESSAGE =
  'New password must be at least 8 characters long and include an uppercase letter, ' +
  'a lowercase letter, and a number.';

function isStrongPassword(password) {
  return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(password);
}

function ProfilePage() {
  const { user, refreshProfile } = useAuth();
  const NAV_ITEMS = getNavItems(user.role);

  const [fullName, setFullName] = useState(user.fullName);
  const [phone, setPhone] = useState(user.phone || '');
  const [profileFieldErrors, setProfileFieldErrors] = useState({});
  const [profileMessage, setProfileMessage] = useState('');
  const [profileError, setProfileError] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  useEffect(() => {
    setFullName(user.fullName);
    setPhone(user.phone || '');
  }, [user]);

  async function handleProfileSubmit(event) {
    event.preventDefault();
    setProfileError('');
    setProfileMessage('');

    const errors = {};
    if (fullName.trim().length < 2) {
      errors.fullName = 'Please enter your full name.';
    }
    setProfileFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setIsSavingProfile(true);
    try {
      await updateMyProfile({ fullName, phone });
      await refreshProfile();
      setProfileMessage('Profile updated successfully.');
    } catch (error) {
      setProfileError(error.message);
    } finally {
      setIsSavingProfile(false);
    }
  }

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [passwordFieldErrors, setPasswordFieldErrors] = useState({});
  const [passwordMessage, setPasswordMessage] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [isSavingPassword, setIsSavingPassword] = useState(false);

  async function handlePasswordSubmit(event) {
    event.preventDefault();
    setPasswordError('');
    setPasswordMessage('');

    const errors = {};
    if (!currentPassword) errors.currentPassword = 'Current password is required.';
    if (!isStrongPassword(newPassword)) errors.newPassword = PASSWORD_RULE_MESSAGE;
    if (newPassword !== confirmNewPassword) errors.confirmNewPassword = 'Passwords do not match.';
    setPasswordFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setIsSavingPassword(true);
    try {
      await changeMyPassword({ currentPassword, newPassword });
      setPasswordMessage('Password changed successfully.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
    } catch (error) {
      setPasswordError(error.message);
    } finally {
      setIsSavingPassword(false);
    }
  }

  return (
    <PortalShell navItems={NAV_ITEMS}>
      <div className="page">
        <div className="page-header">
          <h1>My Profile</h1>
          <p className="muted">Update your account details or change your password.</p>
        </div>

        <div className="card">
          <h2>Account details</h2>
          <Alert type="success" message={profileMessage} />
          <Alert type="error" message={profileError} />

          <form onSubmit={handleProfileSubmit} noValidate>
            <FormField id="email" label="Email address" icon="mail" value={user.email} onChange={() => {}} disabled />
            <p className="field-help" style={{ marginTop: '-12px' }}>
              Your email address cannot be changed here.
            </p>

            <FormField
              id="fullName"
              label="Full name"
              icon="user"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              error={profileFieldErrors.fullName}
              required
            />
            <FormField
              id="phone"
              label="Phone number"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />

            <button type="submit" className="btn btn-primary" disabled={isSavingProfile}>
              {isSavingProfile ? 'Saving...' : 'Save changes'}
            </button>
          </form>
        </div>

        <div className="card">
          <h2>Change password</h2>
          <Alert type="success" message={passwordMessage} />
          <Alert type="error" message={passwordError} />

          <form onSubmit={handlePasswordSubmit} noValidate>
            <FormField
              id="currentPassword"
              label="Current password"
              type="password"
              icon="lock"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              error={passwordFieldErrors.currentPassword}
              autoComplete="current-password"
              required
            />
            <FormField
              id="newPassword"
              label="New password"
              type="password"
              icon="lock"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              error={passwordFieldErrors.newPassword}
              autoComplete="new-password"
              required
            />
            <PasswordStrength password={newPassword} />
            <FormField
              id="confirmNewPassword"
              label="Confirm new password"
              type="password"
              icon="lock"
              value={confirmNewPassword}
              onChange={(e) => setConfirmNewPassword(e.target.value)}
              error={passwordFieldErrors.confirmNewPassword}
              autoComplete="new-password"
              required
            />

            <button type="submit" className="btn btn-primary" disabled={isSavingPassword}>
              {isSavingPassword ? 'Updating...' : 'Change password'}
            </button>
          </form>
        </div>
      </div>
    </PortalShell>
  );
}

export default ProfilePage;
