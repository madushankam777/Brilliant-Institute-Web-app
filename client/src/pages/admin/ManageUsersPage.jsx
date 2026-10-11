// Admin: list/filter/create/suspend/reactivate user accounts
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  fetchUsers,
  createUser,
  suspendUser,
  activateUser,
  deleteUser,
  generateTutorKey,
  fetchTutorKeys,
  revokeTutorKey,
  deleteTutorKey,
  getTutorKeyDocumentUrl,
} from '../../api/adminApi';
import LoadingSpinner from '../../../../shared/client/src/components/common/LoadingSpinner';
import Alert from '../../../../shared/client/src/components/common/Alert';
import Icon from '../../../../shared/client/src/components/common/Icon';
import Avatar from '../../../../shared/client/src/components/common/Avatar';
import PortalShell from '../../../../shared/client/src/components/layout/PortalShell';
import { getNavItems } from '../../../../shared/client/src/components/layout/navItems';
import ModalClose from '../../../../shared/client/src/components/common/ModalClose';
import ReportLink from '../../../../shared/client/src/components/common/ReportLink';

// the side menu for an admin
const NAV_ITEMS = getNavItems('ADMIN');

// a blank add user form
const emptyForm = { fullName: '', email: '', password: '', role: 'TUTOR' };
// a blank tutor key form
const emptyKeyForm = { intendedFor: '', idNumber: '', sendToEmail: '', cvFile: null, certificateFiles: [] };

// badge colour for Active, Suspended or other
function statusBadgeClass(status) {
  if (status === 'ACTIVE') return 'badge badge-success';
  if (status === 'SUSPENDED') return 'badge badge-danger';
  return 'badge badge-neutral';
}

// badge colour for a key - Unused, Used or other
function keyStatusBadgeClass(status) {
  if (status === 'UNUSED') return 'badge badge-warning';
  if (status === 'USED') return 'badge badge-success';
  return 'badge badge-neutral';
}

// manage users - find, add, suspend, reactivate and delete accounts; make and revoke tutor keys
function ManageUsersPage() {
  // the filters, the users and the page state
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  const [confirmTarget, setConfirmTarget] = useState(null); // { user, action: 'suspend' | 'activate' }
  const [isConfirming, setIsConfirming] = useState(false);
  const [confirmNameInput, setConfirmNameInput] = useState('');
  const [confirmError, setConfirmError] = useState('');

  // the add user pop-up and its form
  const [showAddUser, setShowAddUser] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [formErrors, setFormErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  // the tutor enrollment keys, the key form and their state
  const [tutorKeys, setTutorKeys] = useState([]);
  const [isLoadingKeys, setIsLoadingKeys] = useState(true);
  const [keysError, setKeysError] = useState('');
  const [keyForm, setKeyForm] = useState(emptyKeyForm);
  const [isGeneratingKey, setIsGeneratingKey] = useState(false);
  const [justGeneratedKey, setJustGeneratedKey] = useState(null);
  const [revokingKeyId, setRevokingKeyId] = useState(null);

  // load the tutor enrollment keys
  const loadTutorKeys = useCallback(async () => {
    setIsLoadingKeys(true);
    setKeysError('');
    try {
      const data = await fetchTutorKeys();
      setTutorKeys(data);
    } catch (error) {
      setKeysError(error.message);
    } finally {
      setIsLoadingKeys(false);
    }
  }, []);

  // load them when the page opens
  useEffect(() => {
    loadTutorKeys();
  }, [loadTutorKeys]);

  // generate key btn - ask the server for a one-time tutor key (shown once)
  async function handleGenerateKey(event) {
    event.preventDefault();
    setKeysError('');
    setJustGeneratedKey(null);
    const sendTo = keyForm.sendToEmail.trim();
    if (!/^[A-Za-z][A-Za-z .'-]{1,119}$/.test(keyForm.intendedFor.trim())) {
      setKeysError("Please enter the tutor's name (letters, spaces, apostrophes, periods and hyphens only).");
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(sendTo)) {
      setKeysError("Please enter the tutor's email address - the key is sent there.");
      return;
    }
    setIsGeneratingKey(true);
    try {
      const key = await generateTutorKey({
        intendedFor: keyForm.intendedFor.trim(),
        idNumber: keyForm.idNumber.trim() || undefined,
        sendToEmail: sendTo,
        cvFile: keyForm.cvFile,
        certificateFiles: keyForm.certificateFiles,
      });
      setJustGeneratedKey(key);
      setKeyForm(emptyKeyForm);
    } catch (error) {
      setKeysError(error.message);
    } finally {
      setIsGeneratingKey(false);
      await loadTutorKeys();
    }
  }

  // revoke btn - cancel an unused key
  async function handleRevokeKey(keyId) {
    setKeysError('');
    setRevokingKeyId(keyId);
    try {
      await revokeTutorKey(keyId);
      await loadTutorKeys();
    } catch (error) {
      setKeysError(error.message);
    } finally {
      setRevokingKeyId(null);
    }
  }

  // load the users that match the filters
  const load = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage('');
    try {
      const data = await fetchUsers({ search, role, status });
      setUsers(data);
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setIsLoading(false);
    }
  }, [search, role, status]);

  // reload when a filter changes (typing waits 250 ms)
  useEffect(() => {
    const timeoutId = setTimeout(load, 250);
    return () => clearTimeout(timeoutId);
  }, [load]);

  // close the confirm pop-up and clear it
  function closeConfirmModal() {
    setConfirmTarget(null);
    setConfirmNameInput('');
    setConfirmError('');
  }

  // confirm btn - suspend (the name must be typed), reactivate, or delete a user or a key
  async function handleConfirm() {
    if (!confirmTarget) return;
    setIsConfirming(true);
    setConfirmError('');
    try {
      if (confirmTarget.action === 'suspend') {
        await suspendUser(confirmTarget.user.id, confirmNameInput);
        await load();
      } else if (confirmTarget.action === 'activate') {
        await activateUser(confirmTarget.user.id);
        await load();
      } else if (confirmTarget.action === 'deleteUser') {
        await deleteUser(confirmTarget.user.id);
        await load();
      } else if (confirmTarget.action === 'deleteKey') {
        await deleteTutorKey(confirmTarget.key.id);
        await loadTutorKeys();
      }
      closeConfirmModal();
    } catch (error) {
      setConfirmError(error.message);
    } finally {
      setIsConfirming(false);
    }
  }

  // change one field of the add user form
  function updateField(field, value) {
    setForm((previous) => ({ ...previous, [field]: value }));
  }

  // create account btn - check the form, then create a tutor or admin account
  async function handleCreateUser(event) {
    event.preventDefault();
    setFormError('');

    const errors = {};
    if (form.fullName.trim().length < 2) errors.fullName = 'Please enter a full name.';
    if (!/^\S+@\S+\.\S+$/.test(form.email)) errors.email = 'Please enter a valid email.';
    if (form.password.length < 8) errors.password = 'Password must be at least 8 characters.';
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setIsCreating(true);
    try {
      await createUser(form);
      setShowAddUser(false);
      setForm(emptyForm);
      await load();
    } catch (error) {
      setFormError(error.message);
      if (error.details) {
        const mapped = {};
        error.details.forEach((detail) => {
          mapped[detail.field] = detail.message;
        });
        setFormErrors(mapped);
      }
    } finally {
      setIsCreating(false);
    }
  }

  // the page - title, user filters and table, tutor keys, and the two pop-ups
  return (
    <PortalShell navItems={NAV_ITEMS}>
      <div className="page">
        <div className="flex-between page-header">
          <div>
            <h1>Manage Users</h1>
            <p className="muted">Verify identities, grant permissions, and suspend profiles.</p>
          </div>
          {/* report, generate tutor key and add user btns */}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <ReportLink type="users" label="Accounts report" />
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() =>
                document.getElementById('tutor-enrollment-keys')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }
            >
              <Icon name="lock" size={16} /> Generate Tutor Key
            </button>
            <button type="button" className="btn btn-primary" onClick={() => setShowAddUser(true)}>
              <Icon name="plus" size={16} /> Add User
            </button>
          </div>
        </div>

        {/* filters - search, role and status */}
        <div className="card">
          <div className="inline-form">
            <div style={{ flex: 2, minWidth: '200px' }}>
              <label htmlFor="search">Search</label>
              <input
                id="search"
                type="text"
                placeholder="Search name, registration no. or email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ width: '100%' }}
              />
            </div>
            <div>
              <label htmlFor="role">Role</label>
              <select id="role" value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="">All</option>
                <option value="STUDENT_PARENT">Student / Parent</option>
                <option value="TUTOR">Tutor</option>
                <option value="ADMIN">Admin</option>
              </select>
            </div>
            <div>
              <label htmlFor="status">Status</label>
              <select id="status" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">All</option>
                <option value="ACTIVE">Active</option>
                <option value="SUSPENDED">Suspended</option>
              </select>
            </div>
          </div>
        </div>

        <Alert type="error" message={errorMessage} />

        {/* a spinner, or the users table */}
        {isLoading ? (
          <LoadingSpinner label="Loading users..." />
        ) : (
          <div className="card">
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Joined</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Avatar name={user.fullName} pictureUrl={user.profilePictureUrl} size={28} />
                          <span>
                            {user.fullName}
                            {user.studentCode && (
                              <>
                                <br />
                                <span className="reg-no">{user.studentCode}</span>
                              </>
                            )}
                          </span>
                        </div>
                      </td>
                      <td>{user.email}</td>
                      <td>
                        <span className="badge badge-neutral">{user.role.replace('_', ' / ')}</span>
                      </td>
                      <td>
                        <span className={statusBadgeClass(user.status)}>{user.status}</span>
                      </td>
                      <td>{user.createdAt}</td>
                      <td>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <Link to={`/admin/users/${user.id}`} className="btn btn-secondary btn-sm">
                            View
                          </Link>
                          {/* suspend btn for an active user; reactivate and delete btns for the others */}
                          {user.status === 'ACTIVE' ? (
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={() => {
                                setConfirmTarget({ user, action: 'suspend' });
                                setConfirmNameInput('');
                                setConfirmError('');
                              }}
                            >
                              Suspend
                            </button>
                          ) : (
                            <>
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                onClick={() => {
                                  setConfirmTarget({ user, action: 'activate' });
                                  setConfirmNameInput('');
                                  setConfirmError('');
                                }}
                              >
                                Reactivate
                              </button>
                              <button
                                type="button"
                                className="btn btn-danger btn-sm"
                                onClick={() => {
                                  setConfirmTarget({ user, action: 'deleteUser' });
                                  setConfirmNameInput('');
                                  setConfirmError('');
                                }}
                              >
                                Delete
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {users.length === 0 && <p className="muted">No users match these filters.</p>}
          </div>
        )}

        {/* tutor enrollment keys - a tutor needs a one-time key to register */}
        <div className="card" id="tutor-enrollment-keys">
          <h2>Tutor Enrollment Keys</h2>
          <p className="muted" style={{ fontSize: '0.88rem' }}>
            A tutor can only self-register after you verify them (phone/email/in person) and generate
            a one-time key here. The key is emailed to the tutor, and shown here only once in case you need
            to give it in person.
          </p>

          <Alert type="error" message={keysError} />

          {/* the new key - shown only once */}
          {justGeneratedKey && (
            <div className="callout" style={{ background: 'var(--color-success-bg)', borderColor: '#bbf7d0' }}>
              <span>
                <strong>New key - copy it now, it won&apos;t be shown again:</strong>
                <br />
                <code style={{ fontSize: '1.05rem', fontWeight: 700, userSelect: 'all' }}>
                  {justGeneratedKey.keyCode}
                </code>
                {justGeneratedKey.emailedTo && (
                  <>
                    <br />
                    Emailed to <strong>{justGeneratedKey.emailedTo}</strong> with a link to the sign-up page.
                  </>
                )}
              </span>
            </div>
          )}
          {justGeneratedKey && justGeneratedKey.emailError && <Alert type="error" message={justGeneratedKey.emailError} />}

          {/* new key form - who it is for, ID number, CV and certificates */}
          <form onSubmit={handleGenerateKey} style={{ marginBottom: '18px' }}>
            <div className="inline-form">
              <div style={{ flex: 1, minWidth: '220px' }}>
                <label htmlFor="intendedFor">
                  Tutor name <span aria-hidden="true">*</span>
                </label>
                <input
                  id="intendedFor"
                  type="text"
                  placeholder="e.g. Kasun Perera"
                  required
                  value={keyForm.intendedFor}
                  onChange={(e) => setKeyForm((prev) => ({ ...prev, intendedFor: e.target.value }))}
                  style={{ width: '100%' }}
                />
              </div>
              <div style={{ flex: 1, minWidth: '180px' }}>
                <label htmlFor="idNumber">National ID / Passport number</label>
                <input
                  id="idNumber"
                  type="text"
                  placeholder="e.g. 200145678912"
                  value={keyForm.idNumber}
                  onChange={(e) => setKeyForm((prev) => ({ ...prev, idNumber: e.target.value }))}
                  style={{ width: '100%' }}
                />
              </div>
            </div>
            <div className="inline-form">
              <div style={{ flex: 1, minWidth: '220px' }}>
                <label htmlFor="sendToEmail">
                  Tutor email <span aria-hidden="true">*</span>
                </label>
                <input
                  id="sendToEmail"
                  type="email"
                  placeholder="tutor@gmail.com"
                  required
                  value={keyForm.sendToEmail}
                  onChange={(e) => setKeyForm((prev) => ({ ...prev, sendToEmail: e.target.value }))}
                  style={{ width: '100%' }}
                />
                <p className="field-help">
                  The key is emailed here with a button to the sign-up page. The tutor must register with this email.
                </p>
              </div>
            </div>
            <div className="inline-form">
              <div style={{ flex: 1, minWidth: '220px' }}>
                <label htmlFor="cvFile">CV (PDF, JPG, or PNG)</label>
                <input
                  id="cvFile"
                  type="file"
                  accept=".pdf,image/jpeg,image/png,image/webp"
                  onChange={(e) => setKeyForm((prev) => ({ ...prev, cvFile: e.target.files[0] || null }))}
                />
              </div>
              <div style={{ flex: 1, minWidth: '220px' }}>
                <label htmlFor="certificateFiles">Certificates (images, up to 5)</label>
                <input
                  id="certificateFiles"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  onChange={(e) =>
                    setKeyForm((prev) => ({ ...prev, certificateFiles: Array.from(e.target.files || []) }))
                  }
                />
              </div>
            </div>
            <p className="field-help">
              Verify the applicant&apos;s identity and qualifications offline first - these documents are stored
              for your records and are only ever visible to Admin accounts.
            </p>
            <button type="submit" className="btn btn-primary" disabled={isGeneratingKey}>
              {isGeneratingKey ? 'Generating...' : 'Generate and Email Key'}
            </button>
          </form>

          {/* a spinner, an empty message, or the keys table */}
          {isLoadingKeys ? (
            <LoadingSpinner label="Loading enrollment keys..." />
          ) : tutorKeys.length === 0 ? (
            <p className="muted">No enrollment keys generated yet.</p>
          ) : (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Tutor</th>
                    <th>ID Number</th>
                    <th>Documents</th>
                    <th>Status</th>
                    <th>Generated By</th>
                    <th>Redeemed By</th>
                    <th>Created</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {tutorKeys.map((key) => (
                    <tr key={key.id}>
                      <td>{key.intendedFor || '-'}</td>
                      <td>{key.idNumber || '-'}</td>
                      <td>
                        {!key.hasCv && key.certificateCount === 0 ? (
                          '-'
                        ) : (
                          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            {key.hasCv && (
                              <a
                                href={getTutorKeyDocumentUrl(key.id, 'cv')}
                                target="_blank"
                                rel="noreferrer"
                                className="btn btn-ghost btn-sm"
                              >
                                CV
                              </a>
                            )}
                            {Array.from({ length: key.certificateCount }).map((_, index) => (
                              <a
                                key={index}
                                href={getTutorKeyDocumentUrl(key.id, `certificate-${index}`)}
                                target="_blank"
                                rel="noreferrer"
                                className="btn btn-ghost btn-sm"
                              >
                                Cert {index + 1}
                              </a>
                            ))}
                          </div>
                        )}
                      </td>
                      <td>
                        <span className={keyStatusBadgeClass(key.status)}>{key.status}</span>
                      </td>
                      <td>{key.createdByName}</td>
                      <td>{key.usedByName || '-'}</td>
                      <td>{key.createdAt}</td>
                      <td>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          {/* revoke btn - only for an unused key */}
                          {key.status === 'UNUSED' && (
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              disabled={revokingKeyId === key.id}
                              onClick={() => handleRevokeKey(key.id)}
                            >
                              {revokingKeyId === key.id ? 'Revoking...' : 'Revoke'}
                            </button>
                          )}
                          {/* delete key btn - asks to confirm */}
                          <button
                            type="button"
                            className="btn btn-danger btn-sm"
                            onClick={() => {
                              setConfirmTarget({ key, action: 'deleteKey' });
                              setConfirmNameInput('');
                              setConfirmError('');
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* confirm pop-up - a suspension needs the name typed in capitals */}
      {confirmTarget && (
        <div className="modal-overlay" onClick={() => !isConfirming && closeConfirmModal()}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <ModalClose onClose={closeConfirmModal} disabled={isConfirming} />
            <h2>
              {confirmTarget.action === 'suspend'
                ? 'Confirm Suspension'
                : confirmTarget.action === 'activate'
                ? 'Confirm Reactivation'
                : 'Confirm Deletion'}
            </h2>
            <p className="muted">
              {confirmTarget.action === 'deleteKey' ? (
                <>
                  Are you sure you want to permanently delete this enrollment key
                  {confirmTarget.key.intendedFor ? (
                    <>
                      {' '}
                      for <strong>{confirmTarget.key.intendedFor}</strong>
                    </>
                  ) : (
                    ''
                  )}
                  ? This cannot be undone.
                </>
              ) : confirmTarget.action === 'deleteUser' ? (
                <>
                  Are you sure you want to permanently delete <strong>{confirmTarget.user.fullName}</strong>&apos;s
                  account? Their history (classes, payments, attendance) is kept for records, but they will
                  disappear from every list here and can never log in again. This cannot be undone.
                </>
              ) : (
                <>
                  Are you sure you want to {confirmTarget.action} <strong>{confirmTarget.user.fullName}</strong>?
                  {confirmTarget.action === 'suspend' &&
                    ' They will lose access to all classes, dashboards, and portal features instantly.'}
                </>
              )}
            </p>

            <Alert type="error" message={confirmError} />

            {/* name check - only for a suspension */}
            {confirmTarget.action === 'suspend' && (
              <div className="form-field">
                <label htmlFor="confirmSuspendName">
                  Type <strong>{confirmTarget.user.fullName.toUpperCase()}</strong> in capital letters to confirm
                </label>
                <input
                  id="confirmSuspendName"
                  type="text"
                  autoComplete="off"
                  placeholder={confirmTarget.user.fullName.toUpperCase()}
                  value={confirmNameInput}
                  onChange={(e) => setConfirmNameInput(e.target.value)}
                />
              </div>
            )}

            <div className="flex-between" style={{ marginTop: '18px' }}>
              <button type="button" className="btn btn-secondary" disabled={isConfirming} onClick={closeConfirmModal}>
                Cancel
              </button>
              <button
                type="button"
                className={
                  confirmTarget.action === 'suspend' ||
                  confirmTarget.action === 'deleteKey' ||
                  confirmTarget.action === 'deleteUser'
                    ? 'btn btn-danger'
                    : 'btn btn-primary'
                }
                disabled={
                  isConfirming ||
                  (confirmTarget.action === 'suspend' &&
                    confirmNameInput.trim() !== confirmTarget.user.fullName.toUpperCase())
                }
                onClick={handleConfirm}
              >
                {isConfirming
                  ? 'Please wait...'
                  : confirmTarget.action === 'suspend'
                  ? 'Confirm Suspend'
                  : confirmTarget.action === 'activate'
                  ? 'Confirm Reactivate'
                  : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* add user pop-up - a tutor or admin account (students register themselves) */}
      {showAddUser && (
        <div className="modal-overlay" onClick={() => !isCreating && setShowAddUser(false)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <ModalClose onClose={() => setShowAddUser(false)} disabled={isCreating} />
            <h2>Add User</h2>
            <p className="muted">Directly create a Tutor or Admin account (Students/Parents self-register).</p>
            <Alert type="error" message={formError} />
            <form onSubmit={handleCreateUser} noValidate>
              <div className="form-field">
                <label htmlFor="newFullName">Full Name</label>
                <input id="newFullName" type="text" value={form.fullName} onChange={(e) => updateField('fullName', e.target.value)} />
                {formErrors.fullName && <p className="field-error">{formErrors.fullName}</p>}
              </div>
              <div className="form-field">
                <label htmlFor="newEmail">Email Address</label>
                <input id="newEmail" type="email" value={form.email} onChange={(e) => updateField('email', e.target.value)} />
                {formErrors.email && <p className="field-error">{formErrors.email}</p>}
              </div>
              <div className="form-field">
                <label htmlFor="newRole">Role</label>
                <select id="newRole" value={form.role} onChange={(e) => updateField('role', e.target.value)}>
                  <option value="TUTOR">Tutor</option>
                  <option value="ADMIN">Admin</option>
                </select>
              </div>
              <div className="form-field">
                <label htmlFor="newPassword">Temporary Password</label>
                <input id="newPassword" type="password" placeholder="Set a temporary password" value={form.password} onChange={(e) => updateField('password', e.target.value)} />
                {formErrors.password && <p className="field-error">{formErrors.password}</p>}
                <p className="field-help">At least 8 characters, with an uppercase letter, lowercase letter, and a number.</p>
              </div>
              <div className="flex-between">
                <button type="button" className="btn btn-secondary" disabled={isCreating} onClick={() => setShowAddUser(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={isCreating}>
                  {isCreating ? 'Creating...' : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </PortalShell>
  );
}

export default ManageUsersPage;
