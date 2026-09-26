// Profile page: two separate forms
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  updateMyProfile,
  uploadMyProfilePicture,
  removeMyProfilePicture,
  changeMyPassword,
} from '../../api/authApi';
import { fetchMyBankDetails, updateMyBankDetails } from '../../api/paymentApi';
import FormField from '../../../../shared/client/src/components/common/FormField';
import Alert from '../../../../shared/client/src/components/common/Alert';
import LoadingSpinner from '../../../../shared/client/src/components/common/LoadingSpinner';
import Avatar from '../../../../shared/client/src/components/common/Avatar';
import PasswordStrength from '../../../../shared/client/src/components/common/PasswordStrength';
import PortalShell from '../../../../shared/client/src/components/layout/PortalShell';
import { getNavItems } from '../../../../shared/client/src/components/layout/navItems';

const MAX_PICTURE_BYTES = 3 * 1024 * 1024;

const PASSWORD_RULE_MESSAGE =
  'New password must be at least 8 characters long and include an uppercase letter, ' +
  'a lowercase letter, and a number.';

function isStrongPassword(password) {
  return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,72}$/.test(password);
}

function ProfilePage() {
  const { user, refreshProfile } = useAuth();
  const NAV_ITEMS = getNavItems(user.role);

  const [fullName, setFullName] = useState(user.fullName);
  const [phone, setPhone] = useState(user.phone || '');
  const [bio, setBio] = useState(user.bio || '');
  const [profileFieldErrors, setProfileFieldErrors] = useState({});
  const [profileMessage, setProfileMessage] = useState('');
  const [profileError, setProfileError] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  const pictureInputRef = useRef(null);
  const [pictureError, setPictureError] = useState('');
  const [isUploadingPicture, setIsUploadingPicture] = useState(false);
  const [isRemovingPicture, setIsRemovingPicture] = useState(false);

  // delete btn - remove the current photo, back to the initials avatar
  async function handleRemovePicture() {
    setPictureError('');
    setIsRemovingPicture(true);
    try {
      await removeMyProfilePicture();
      await refreshProfile();
    } catch (error) {
      setPictureError(error.message);
    } finally {
      setIsRemovingPicture(false);
    }
  }

  async function handlePictureSelected(event) {
    const file = event.target.files && event.target.files[0];
    event.target.value = ''; // let the same file be picked again if they retry
    if (!file) return;

    setPictureError('');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setPictureError('Please choose a JPG, PNG, or WEBP image.');
      return;
    }
    if (file.size > MAX_PICTURE_BYTES) {
      setPictureError('Image is too large - please choose one under 3MB.');
      return;
    }

    setIsUploadingPicture(true);
    try {
      await uploadMyProfilePicture(file);
      await refreshProfile();
    } catch (error) {
      setPictureError(error.message);
    } finally {
      setIsUploadingPicture(false);
    }
  }

  useEffect(() => {
    setFullName(user.fullName);
    setPhone(user.phone || '');
    setBio(user.bio || '');
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
      await updateMyProfile({ fullName, phone, bio });
      await refreshProfile();
      setProfileMessage('Profile updated successfully.');
    } catch (error) {
      const details = Array.isArray(error.details) ? error.details : [];
      if (details.length > 0) {
        const mapped = {};
        details.forEach((d) => { if (d.field && !mapped[d.field]) mapped[d.field] = d.message; });
        setProfileFieldErrors(mapped);
        setProfileError('');
      } else {
        setProfileError(error.message);
      }
    } finally {
      setIsSavingProfile(false);
    }
  }

  const isTutor = user.role === 'TUTOR';
  const [bankForm, setBankForm] = useState({ bankName: '', accountHolder: '', accountNumber: '', branch: '' });
  const [isLoadingBank, setIsLoadingBank] = useState(isTutor);
  const [bankMessage, setBankMessage] = useState('');
  const [bankError, setBankError] = useState('');
  const [bankFieldErrors, setBankFieldErrors] = useState({});
  const [isSavingBank, setIsSavingBank] = useState(false);

  useEffect(() => {
    if (!isTutor) return;
    let isMounted = true;
    fetchMyBankDetails()
      .then((details) => {
        if (!isMounted) return;
        setBankForm({
          bankName: details.bankName || '',
          accountHolder: details.accountHolder || '',
          accountNumber: details.accountNumber || '',
          branch: details.branch || '',
        });
      })
      .catch((error) => {
        if (isMounted) setBankError(error.message);
      })
      .finally(() => {
        if (isMounted) setIsLoadingBank(false);
      });
    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleBankSubmit(event) {
    event.preventDefault();
    setBankError('');
    setBankFieldErrors({});
    setBankMessage('');
    setIsSavingBank(true);
    try {
      await updateMyBankDetails(bankForm);
      setBankMessage('Banking information saved.');
    } catch (error) {
      const details = Array.isArray(error.details) ? error.details : [];
      if (details.length > 0) {
        const mapped = {};
        details.forEach((d) => { if (d.field && !mapped[d.field]) mapped[d.field] = d.message; });
        setBankFieldErrors(mapped);
        setBankError('');
      } else {
        setBankError(error.message);
      }
    } finally {
      setIsSavingBank(false);
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
      const details = Array.isArray(error.details) ? error.details : [];
      if (details.length > 0) {
        const mapped = {};
        details.forEach((d) => { if (d.field && !mapped[d.field]) mapped[d.field] = d.message; });
        setPasswordFieldErrors(mapped);
        setPasswordError('');
      } else {
        setPasswordError(error.message);
      }
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
          <h2>Profile picture</h2>
          <Alert type="error" message={pictureError} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <Avatar name={user.fullName} pictureUrl={user.profilePictureUrl} size={72} />
            <div>
              <input
                ref={pictureInputRef}
                type="file"
                aria-label="Choose a profile photo"
                accept="image/jpeg,image/png,image/webp"
                style={{ display: 'none' }}
                onChange={handlePictureSelected}
              />
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={isUploadingPicture || isRemovingPicture}
                  onClick={() => pictureInputRef.current && pictureInputRef.current.click()}
                >
                  {isUploadingPicture
                    ? 'Uploading...'
                    : user.profilePictureUrl
                    ? 'Edit photo'
                    : 'Change photo'}
                </button>
                {user.profilePictureUrl && (
                  <button
                    type="button"
                    className="btn btn-danger"
                    disabled={isUploadingPicture || isRemovingPicture}
                    onClick={handleRemovePicture}
                  >
                    {isRemovingPicture ? 'Removing...' : 'Delete photo'}
                  </button>
                )}
              </div>
              <p className="field-help" style={{ marginTop: '8px' }}>
                JPG, PNG, or WEBP, up to 3MB. Shown next to your name across the site.
              </p>
            </div>
          </div>
        </div>

        <div className="card">
          <h2>Account details</h2>
          <Alert type="success" message={profileMessage} />
          <Alert type="error" message={profileError} />

          <form onSubmit={handleProfileSubmit} noValidate>
            {user.studentCode && (
              <FormField
                id="studentCode"
                label="Registration number"
                icon="user"
                value={user.studentCode}
                onChange={() => {}}
                disabled
              />
            )}
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

            {user.role === 'TUTOR' && (
              <div className="form-field">
                <label htmlFor="bio">About you</label>
                <textarea
                  id="bio"
                  placeholder="A short bio students and parents will see on your tutor profile - your subjects, experience, teaching style..."
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  maxLength={1000}
                  style={{ minHeight: '110px' }}
                />
                <p className="field-help">Shown on your public tutor profile. {bio.length}/1000</p>
              </div>
            )}

            <button type="submit" className="btn btn-primary" disabled={isSavingProfile}>
              {isSavingProfile ? 'Saving...' : 'Save changes'}
            </button>
          </form>
        </div>

        {isTutor && (
          <div className="card">
            <h2>Banking information</h2>
            <p className="muted" style={{ marginTop: '-8px' }}>
              Used by Admin to send your payouts. Your account number is never shown in full to
              anyone but you - Admin only sees the last 4 digits, to confirm it&apos;s the right account.
            </p>
            <Alert type="success" message={bankMessage} />
            <Alert type="error" message={bankError} />

            {isLoadingBank ? (
              <LoadingSpinner label="Loading your banking details..." />
            ) : (
              <form onSubmit={handleBankSubmit} noValidate>
                <FormField
                  id="bankName"
                  label="Bank name"
                  placeholder="e.g. People's Bank"
                  value={bankForm.bankName}
                  onChange={(e) => setBankForm((prev) => ({ ...prev, bankName: e.target.value }))}
                  error={bankFieldErrors.bankName}
                />
                <FormField
                  id="accountHolder"
                  label="Account holder name"
                  placeholder="Name exactly as it appears on the account"
                  value={bankForm.accountHolder}
                  onChange={(e) => setBankForm((prev) => ({ ...prev, accountHolder: e.target.value }))}
                  error={bankFieldErrors.accountHolder}
                />
                <FormField
                  id="accountNumber"
                  label="Account number"
                  placeholder="e.g. 8001234567"
                  value={bankForm.accountNumber}
                  onChange={(e) => setBankForm((prev) => ({ ...prev, accountNumber: e.target.value }))}
                  error={bankFieldErrors.accountNumber}
                />
                <FormField
                  id="branch"
                  label="Branch"
                  placeholder="e.g. Colombo 07"
                  value={bankForm.branch}
                  onChange={(e) => setBankForm((prev) => ({ ...prev, branch: e.target.value }))}
                  error={bankFieldErrors.branch}
                />

                <button type="submit" className="btn btn-primary" disabled={isSavingBank}>
                  {isSavingBank ? 'Saving...' : 'Save banking information'}
                </button>
              </form>
            )}
          </div>
        )}

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
              placeholder="Enter your current password"
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
              placeholder="Create a new password"
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
              placeholder="Re-enter new password"
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
