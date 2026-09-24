// Admin: issue the one-time key a student needs to re-register for next year,
// and run the 1 January roll-over.
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchUsers,
  fetchReregistrationKeys,
  generateReregistrationKey,
  revokeReregistrationKey,
  fetchRolloverPreview,
  runYearlyRollover,
} from '../../api/adminApi';
import LoadingSpinner from '../../../../shared/client/src/components/common/LoadingSpinner';
import Alert from '../../../../shared/client/src/components/common/Alert';
import PortalShell from '../../../../shared/client/src/components/layout/PortalShell';
import { getNavItems } from '../../../../shared/client/src/components/layout/navItems';
import { GRADES } from '../../../../shared/client/src/constants/grades';
import useFormErrors from '../../../../shared/client/src/hooks/useFormErrors';
import { useAuth } from '../../context/AuthContext';

const THIS_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = [THIS_YEAR, THIS_YEAR + 1];

function nextGradeOf(grade) {
  const index = GRADES.indexOf(grade);
  if (index === -1 || index === GRADES.length - 1) return '';
  return GRADES[index + 1];
}

function formatDate(value) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString();
}

function ReregistrationPage() {
  const { user } = useAuth();
  const NAV_ITEMS = getNavItems(user.role);

  const [students, setStudents] = useState([]);
  const [keys, setKeys] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const [year, setYear] = useState(THIS_YEAR + 1);
  const [form, setForm] = useState({ studentId: '', toGrade: '' });
  const [justGeneratedKey, setJustGeneratedKey] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const { fieldErrors, formError, validate, captureError, clearErrors } = useFormErrors();

  const [preview, setPreview] = useState(null);
  const [previewError, setPreviewError] = useState('');
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  const load = useCallback(async () => {
    setIsLoading(true);
    setLoadError('');
    try {
      const [studentRows, keyRows] = await Promise.all([
        fetchUsers({ role: 'STUDENT_PARENT', status: 'ACTIVE' }),
        fetchReregistrationKeys(year),
      ]);
      setStudents(studentRows);
      setKeys(keyRows);
    } catch (error) {
      setLoadError(error.message);
    } finally {
      setIsLoading(false);
    }
  }, [year]);

  useEffect(() => {
    load();
  }, [load]);

  const selectedStudent = useMemo(
    () => students.find((s) => String(s.id) === String(form.studentId)) || null,
    [students, form.studentId]
  );

  // The grade the student moves into unless admin picks something else.
  const suggestedGrade = selectedStudent ? nextGradeOf(selectedStudent.grade) : '';
  const isFinalGradeStudent = Boolean(
    selectedStudent && selectedStudent.grade === GRADES[GRADES.length - 1]
  );

  function updateField(field, value) {
    setForm((previous) => ({ ...previous, [field]: value }));
  }

  async function handleGenerate(event) {
    event.preventDefault();
    setSuccessMessage('');
    setJustGeneratedKey(null);

    const chosenGrade = form.toGrade || suggestedGrade;
    if (
      !validate({
        studentId: !form.studentId && 'Choose the student this key is for.',
        toGrade:
          form.studentId && !chosenGrade
            ? 'This student is in the final grade - pick the grade to move them into, or they have finished.'
            : '',
      })
    ) {
      return;
    }

    setIsGenerating(true);
    try {
      const key = await generateReregistrationKey({
        studentId: Number(form.studentId),
        toGrade: chosenGrade,
        academicYear: year,
      });
      setJustGeneratedKey(key);
      setForm({ studentId: '', toGrade: '' });
      clearErrors();
      setKeys(await fetchReregistrationKeys(year));
    } catch (error) {
      captureError(error);
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleRevoke(keyId) {
    setSuccessMessage('');
    try {
      await revokeReregistrationKey(keyId);
      setSuccessMessage('Key revoked.');
      setKeys(await fetchReregistrationKeys(year));
    } catch (error) {
      setLoadError(error.message);
    }
  }

  async function handlePreview() {
    setPreviewError('');
    setIsPreviewing(true);
    try {
      setPreview(await fetchRolloverPreview(year));
    } catch (error) {
      setPreviewError(error.message);
    } finally {
      setIsPreviewing(false);
    }
  }

  async function handleRun() {
    setPreviewError('');
    if (confirmText !== 'RUN') {
      setPreviewError('Type RUN to confirm.');
      return;
    }
    setIsRunning(true);
    try {
      const result = await runYearlyRollover(year);
      setSuccessMessage(
        result.skipped
          ? `The ${year} roll-over has already been run.`
          : `Done. Promoted ${result.promotedCount}, graduated ${result.graduatedCount}, closed ${result.removedCount}.`
      );
      setConfirmText('');
      setPreview(await fetchRolloverPreview(year));
      await load();
    } catch (error) {
      setPreviewError(error.message);
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <PortalShell navItems={NAV_ITEMS}>
      <div className="page">
        <div className="page-header">
          <h1>Student Re-registration</h1>
          <p className="muted">
            Give each returning student a one-time key. They enter it under &quot;Re-register&quot; to
            confirm their place. On 1 January, everyone who used their key moves up a grade and
            everyone who did not has their account closed.
          </p>
        </div>

        <Alert type="error" message={loadError} />
        <Alert type="success" message={successMessage} />

        <div className="card">
          <div className="form-field" style={{ maxWidth: '220px' }}>
            <label htmlFor="academicYear">Academic year</label>
            <select
              id="academicYear"
              value={year}
              onChange={(e) => {
                setYear(Number(e.target.value));
                setPreview(null);
                setJustGeneratedKey(null);
              }}
            >
              {YEAR_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                  {option === THIS_YEAR + 1 ? ' (next year)' : ' (this year)'}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="card">
          <h2>Issue a key</h2>

          {justGeneratedKey && (
            <div
              className="callout"
              style={{ background: 'var(--color-success-bg)', borderColor: '#bbf7d0' }}
            >
              <span>
                <strong>
                  Key for {justGeneratedKey.studentName} - copy it now, it won&apos;t be shown again:
                </strong>
                <br />
                <code style={{ fontSize: '1.05rem', fontWeight: 700, userSelect: 'all' }}>
                  {justGeneratedKey.keyCode}
                </code>
                <br />
                <span className="muted" style={{ fontSize: '0.85rem' }}>
                  {justGeneratedKey.fromGrade || 'No grade'} &rarr; {justGeneratedKey.toGrade} for{' '}
                  {justGeneratedKey.academicYear}. Valid until{' '}
                  {formatDate(justGeneratedKey.expiresAt)}.
                </span>
              </span>
            </div>
          )}

          <Alert type="error" message={formError} />

          <form onSubmit={handleGenerate} noValidate>
            <div className="inline-form">
              <div className="form-field" style={{ flex: 1, minWidth: '240px' }}>
                <label htmlFor="studentId">Student</label>
                <select
                  id="studentId"
                  value={form.studentId}
                  onChange={(e) => updateField('studentId', e.target.value)}
                >
                  <option value="">Choose a student...</option>
                  {students.map((student) => (
                    <option key={student.id} value={student.id}>
                      {student.fullName} {student.grade ? `- ${student.grade}` : ''}
                    </option>
                  ))}
                </select>
                {fieldErrors.studentId && <p className="field-error">{fieldErrors.studentId}</p>}
              </div>

              <div className="form-field" style={{ flex: 1, minWidth: '200px' }}>
                <label htmlFor="toGrade">Moving into</label>
                <select
                  id="toGrade"
                  value={form.toGrade}
                  onChange={(e) => updateField('toGrade', e.target.value)}
                >
                  <option value="">
                    {suggestedGrade ? `Next grade up (${suggestedGrade})` : 'Choose a grade...'}
                  </option>
                  {GRADES.map((grade) => (
                    <option key={grade} value={grade}>
                      {grade}
                    </option>
                  ))}
                </select>
                <p className="field-help">
                  Leave as the default to move them up one grade. Change it if they are repeating a
                  year.
                </p>
                {fieldErrors.toGrade && <p className="field-error">{fieldErrors.toGrade}</p>}
              </div>
            </div>

            {isFinalGradeStudent && (
              <p className="muted" style={{ fontSize: '0.85rem' }}>
                {selectedStudent.fullName} is in {selectedStudent.grade} - there is no grade above
                it, so they finish at the end of this year unless you pick a grade yourself.
              </p>
            )}

            <button type="submit" className="btn btn-primary" disabled={isGenerating}>
              {isGenerating ? 'Generating...' : 'Generate key'}
            </button>
          </form>
        </div>

        <div className="card">
          <h2>Keys issued for {year}</h2>
          <p className="muted" style={{ fontSize: '0.88rem' }}>
            The code itself is shown once, when it is generated. If a student loses theirs, revoke
            the old key and issue a new one.
          </p>

          {isLoading ? (
            <LoadingSpinner label="Loading..." />
          ) : (
            <>
              <div className="table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>Moving to</th>
                      <th>Status</th>
                      <th>Expires</th>
                      <th>Used</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {keys.map((key) => (
                      <tr key={key.id}>
                        <td>
                          {key.studentName}
                          <br />
                          <span className="muted" style={{ fontSize: '0.8rem' }}>
                            {key.studentEmail}
                          </span>
                        </td>
                        <td>
                          {key.fromGrade || '-'} &rarr; {key.toGrade}
                        </td>
                        <td>
                          <span className={`badge badge-${key.status === 'USED' ? 'success' : key.status === 'REVOKED' ? 'danger' : 'warning'}`}>
                            {key.status}
                          </span>
                        </td>
                        <td>{formatDate(key.expiresAt)}</td>
                        <td>{formatDate(key.usedAt)}</td>
                        <td>
                          {key.status === 'UNUSED' && (
                            <button
                              type="button"
                              className="btn btn-sm btn-secondary"
                              onClick={() => handleRevoke(key.id)}
                            >
                              Revoke
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {keys.length === 0 && (
                <p className="muted">No keys have been issued for {year} yet.</p>
              )}
            </>
          )}
        </div>

        <div className="card">
          <h2>1 January roll-over</h2>
          <p className="muted" style={{ fontSize: '0.88rem' }}>
            This runs by itself in the first week of January, but only once keys have been issued
            for that year. Use the preview to see exactly who is affected before anything changes.
          </p>

          <Alert type="error" message={previewError} />

          <button
            type="button"
            className="btn btn-secondary"
            onClick={handlePreview}
            disabled={isPreviewing}
          >
            {isPreviewing ? 'Checking...' : `Preview the ${year} roll-over`}
          </button>

          {preview && (
            <div style={{ marginTop: '18px' }}>
              {preview.alreadyRun && (
                <p className="callout">
                  Already run on {formatDate(preview.ranAt)}. Running it again changes nothing.
                </p>
              )}
              <ul>
                <li>
                  <strong>{preview.promoteCount}</strong> student(s) move up a grade
                </li>
                <li>
                  <strong>{preview.graduateCount}</strong> finish their final grade and are closed
                  out as graduated
                </li>
                <li>
                  <strong>{preview.removeCount}</strong> did not re-register and will have their
                  account closed
                </li>
              </ul>

              {preview.remove.length > 0 && (
                <>
                  <p style={{ fontWeight: 600, marginBottom: '4px' }}>Accounts that will close:</p>
                  <p className="muted" style={{ fontSize: '0.85rem' }}>
                    {preview.remove.map((s) => `${s.name} (${s.grade || 'no grade'})`).join(', ')}
                  </p>
                </>
              )}

              {!preview.alreadyRun && (
                <div className="inline-form" style={{ marginTop: '14px' }}>
                  <div className="form-field" style={{ minWidth: '200px' }}>
                    <label htmlFor="rolloverConfirm">Type RUN to confirm</label>
                    <input
                      id="rolloverConfirm"
                      type="text"
                      placeholder="RUN"
                      value={confirmText}
                      onChange={(e) => setConfirmText(e.target.value)}
                    />
                  </div>
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={handleRun}
                    disabled={isRunning || confirmText !== 'RUN'}
                  >
                    {isRunning ? 'Running...' : `Run the ${year} roll-over now`}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </PortalShell>
  );
}

export default ReregistrationPage;
