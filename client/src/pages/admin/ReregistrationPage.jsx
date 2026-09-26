// Admin: issue one-time re-registration keys
import { useCallback, useEffect, useState } from 'react';
import {
  fetchReregistrationOptions,
  fetchReregistrationKeys,
  generateReregistrationKeys,
  revokeReregistrationKey,
  deleteReregistrationKey,
  fetchRolloverPreview,
  runYearlyRollover,
} from '../../api/adminApi';
import LoadingSpinner from '../../../../shared/client/src/components/common/LoadingSpinner';
import Alert from '../../../../shared/client/src/components/common/Alert';
import Icon from '../../../../shared/client/src/components/common/Icon';
import PortalShell from '../../../../shared/client/src/components/layout/PortalShell';
import { getNavItems } from '../../../../shared/client/src/components/layout/navItems';
import { GRADES } from '../../../../shared/client/src/constants/grades';

const NAV_ITEMS = getNavItems('ADMIN');
const THIS_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = [THIS_YEAR, THIS_YEAR + 1];

const MODES = [
  { value: 'CLASS', label: 'By class', placeholder: 'Search classes or tutors...' },
  { value: 'GRADE', label: 'By grade', placeholder: 'Search grades...' },
  { value: 'STUDENTS', label: 'By student', placeholder: 'Search by name, grade, class or student code...' },
];

const KEY_FILTERS = ['ALL', 'UNUSED', 'USED', 'REVOKED'];

function formatDate(value) {
  if (!value) return '-';
  return new Date(String(value).replace(' ', 'T')).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function matches(term, values) {
  return values.filter(Boolean).some((value) => String(value).toLowerCase().includes(term));
}

function csvCell(value) {
  const text = String(value === null || value === undefined ? '' : value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function downloadKeysCsv(keys) {
  const header = ['Student', 'Student code', 'From grade', 'To grade', 'Academic year', 'Key', 'Valid until'];
  const rows = keys.map((key) => [
    key.studentName,
    key.studentCode,
    key.fromGrade,
    key.toGrade,
    key.academicYear,
    key.keyCode,
    formatDate(key.expiresAt),
  ]);
  const csv = [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `reregistration-keys-${keys[0].academicYear}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function ReregistrationPage() {
  const [year, setYear] = useState(THIS_YEAR + 1);
  const [options, setOptions] = useState({ students: [], classes: [], grades: [] });
  const [keys, setKeys] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  // who the keys are for
  const [mode, setMode] = useState('CLASS');
  const [search, setSearch] = useState('');
  const [classId, setClassId] = useState(null);
  const [grade, setGrade] = useState(null);
  const [studentIds, setStudentIds] = useState([]);
  const [toGrade, setToGrade] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState('');
  const [result, setResult] = useState(null);
  const [copied, setCopied] = useState(false);

  const [keySearch, setKeySearch] = useState('');
  const [keyFilter, setKeyFilter] = useState('ALL');
  const [listMessage, setListMessage] = useState(null); // { type, text }
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const [preview, setPreview] = useState(null);
  const [previewError, setPreviewError] = useState('');
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  const loadKeys = useCallback(async () => {
    setKeys(await fetchReregistrationKeys(year));
  }, [year]);

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    setLoadError('');
    Promise.allSettled([fetchReregistrationOptions(), fetchReregistrationKeys(year)]).then(([optionResult, keyResult]) => {
      if (!isMounted) return;
      if (optionResult.status === 'fulfilled') setOptions(optionResult.value);
      if (keyResult.status === 'fulfilled') setKeys(keyResult.value);
      const failed = [optionResult, keyResult].find((item) => item.status === 'rejected');
      if (failed) setLoadError(failed.reason.message);
      setIsLoading(false);
    });
    return () => {
      isMounted = false;
    };
  }, [year]);

  function changeMode(nextMode) {
    setMode(nextMode);
    setSearch('');
    setGenerateError('');
  }

  const term = search.trim().toLowerCase();
  const visibleClasses = options.classes.filter((item) => matches(term, [item.subject, item.level, item.tutorName]));
  const visibleGrades = options.grades.filter((item) => matches(term, [item.grade]));
  const visibleStudents = options.students.filter((item) =>
    matches(term, [item.fullName, item.email, item.studentCode, item.grade, item.classNames])
  );

  const chosenClass = options.classes.find((item) => item.id === classId);
  const chosenGrade = options.grades.find((item) => item.grade === grade);
  let chosenCount = studentIds.length;
  if (mode === 'CLASS') chosenCount = chosenClass ? chosenClass.studentCount : 0;
  if (mode === 'GRADE') chosenCount = chosenGrade ? chosenGrade.studentCount : 0;

  function toggleStudent(studentId) {
    setStudentIds((previous) =>
      previous.includes(studentId) ? previous.filter((id) => id !== studentId) : [...previous, studentId]
    );
  }

  function selectAllShown() {
    setStudentIds((previous) => [...new Set([...previous, ...visibleStudents.map((item) => item.id)])]);
  }

  async function handleGenerate() {
    setGenerateError('');
    setResult(null);
    setCopied(false);
    if (chosenCount === 0) {
      setGenerateError(
        mode === 'CLASS'
          ? 'Choose a class that has students.'
          : mode === 'GRADE'
            ? 'Choose a grade that has students.'
            : 'Choose at least one student.'
      );
      return;
    }

    setIsGenerating(true);
    try {
      const data = await generateReregistrationKeys({
        mode,
        classId: mode === 'CLASS' ? classId : undefined,
        grade: mode === 'GRADE' ? grade : undefined,
        studentIds: mode === 'STUDENTS' ? studentIds : undefined,
        toGrade: toGrade || undefined,
        academicYear: year,
      });
      setResult(data);
      setStudentIds([]);
      await loadKeys();
    } catch (error) {
      setGenerateError(error.message);
    } finally {
      setIsGenerating(false);
    }
  }

  async function copyAllKeys() {
    const text = result.issued.map((key) => `${key.studentName} (${key.toGrade}): ${key.keyCode}`).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  async function handleDelete(keyId) {
    setListMessage(null);
    setDeletingId(keyId);
    try {
      await deleteReregistrationKey(keyId);
      setConfirmDeleteId(null);
      setListMessage({ type: 'success', text: 'Key deleted.' });
      await loadKeys();
    } catch (error) {
      setListMessage({ type: 'error', text: error.message });
    } finally {
      setDeletingId(null);
    }
  }

  async function handleRevoke(keyId) {
    setListMessage(null);
    try {
      await revokeReregistrationKey(keyId);
      setListMessage({ type: 'success', text: 'Key revoked. You can now issue the student a new one.' });
      await loadKeys();
    } catch (error) {
      setListMessage({ type: 'error', text: error.message });
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
    setIsRunning(true);
    try {
      const outcome = await runYearlyRollover(year);
      setListMessage({
        type: 'success',
        text: outcome.skipped
          ? `The ${year} roll-over has already been run.`
          : `Done. Promoted ${outcome.promotedCount}, graduated ${outcome.graduatedCount}, closed ${outcome.removedCount}.`,
      });
      setConfirmText('');
      setPreview(await fetchRolloverPreview(year));
    } catch (error) {
      setPreviewError(error.message);
    } finally {
      setIsRunning(false);
    }
  }

  const keyTerm = keySearch.trim().toLowerCase();
  const visibleKeys = keys.filter(
    (key) =>
      (keyFilter === 'ALL' || key.status === keyFilter) &&
      matches(keyTerm, [key.studentName, key.studentEmail, key.studentCode, key.fromGrade, key.toGrade, key.classNames])
  );
  const modeInfo = MODES.find((item) => item.value === mode);

  return (
    <PortalShell navItems={NAV_ITEMS}>
      <div className="page">
        <div className="page-header">
          <h1>Student Re-registration</h1>
          <p className="muted">
            Give returning students a one-time key. They enter it under &quot;Re-register&quot; to confirm
            their place. On 1 January, everyone who used their key moves up a grade and everyone who
            did not has their account closed.
          </p>
        </div>

        <Alert type="error" message={loadError} />

        <div className="card">
          <div className="form-field" style={{ maxWidth: '240px', marginBottom: 0 }}>
            <label htmlFor="academicYear">Academic year</label>
            <select
              id="academicYear"
              value={year}
              onChange={(e) => {
                setYear(Number(e.target.value));
                setPreview(null);
                setResult(null);
              }}
            >
              {YEAR_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option} {option === THIS_YEAR + 1 ? '(next year)' : '(this year)'}
                </option>
              ))}
            </select>
          </div>
        </div>

        {isLoading ? (
          <LoadingSpinner label="Loading students..." />
        ) : (
          <>
            <div className="card">
              <h2>Issue keys</h2>

              <div className="form-field">
                <label>Choose students</label>
                <div className="period-tabs" role="tablist" aria-label="Choose students">
                  {MODES.map((item) => (
                    <button
                      key={item.value}
                      type="button"
                      role="tab"
                      aria-selected={mode === item.value}
                      className={`period-tab${mode === item.value ? ' active' : ''}`}
                      onClick={() => changeMode(item.value)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="search-input">
                <span className="input-icon">
                  <Icon name="search" size={16} />
                </span>
                <input
                  type="search"
                  placeholder={modeInfo.placeholder}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  aria-label={modeInfo.placeholder}
                />
              </div>

              {mode === 'STUDENTS' && (
                <div className="pick-toolbar">
                  <span>{studentIds.length} selected</span>
                  <span style={{ display: 'flex', gap: '6px' }}>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={selectAllShown}>
                      Select all shown
                    </button>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setStudentIds([])}>
                      Clear
                    </button>
                  </span>
                </div>
              )}

              <div className="pick-list">
                {mode === 'CLASS' &&
                  (visibleClasses.length === 0 ? (
                    <p className="muted" style={{ padding: '12px 14px', margin: 0 }}>No classes match.</p>
                  ) : (
                    visibleClasses.map((item) => (
                      <label key={item.id} className={`pick-item${classId === item.id ? ' selected' : ''}`}>
                        <input type="radio" name="rereg-class" checked={classId === item.id} onChange={() => setClassId(item.id)} />
                        <span className="pick-item-main">
                          <span className="pick-item-title">{item.subject}</span>
                          <span className="pick-item-sub">
                            {[item.level, item.tutorName].filter(Boolean).join(' · ')}
                          </span>
                        </span>
                        <span className="pick-item-count">{item.studentCount} student(s)</span>
                      </label>
                    ))
                  ))}

                {mode === 'GRADE' &&
                  (visibleGrades.length === 0 ? (
                    <p className="muted" style={{ padding: '12px 14px', margin: 0 }}>No grades match.</p>
                  ) : (
                    visibleGrades.map((item) => (
                      <label key={item.grade} className={`pick-item${grade === item.grade ? ' selected' : ''}`}>
                        <input type="radio" name="rereg-grade" checked={grade === item.grade} onChange={() => setGrade(item.grade)} />
                        <span className="pick-item-main">
                          <span className="pick-item-title">{item.grade}</span>
                        </span>
                        <span className="pick-item-count">{item.studentCount} student(s)</span>
                      </label>
                    ))
                  ))}

                {mode === 'STUDENTS' &&
                  (visibleStudents.length === 0 ? (
                    <p className="muted" style={{ padding: '12px 14px', margin: 0 }}>No students match.</p>
                  ) : (
                    visibleStudents.map((item) => (
                      <label key={item.id} className={`pick-item${studentIds.includes(item.id) ? ' selected' : ''}`}>
                        <input type="checkbox" checked={studentIds.includes(item.id)} onChange={() => toggleStudent(item.id)} />
                        <span className="pick-item-main">
                          <span className="pick-item-title">{item.fullName}</span>
                          <span className="pick-item-sub">
                            {[item.grade || 'No grade', item.studentCode, item.classNames].filter(Boolean).join(' · ')}
                          </span>
                        </span>
                      </label>
                    ))
                  ))}
              </div>

              <div className="inline-form" style={{ marginTop: '16px' }}>
                <div className="form-field" style={{ flex: 1, minWidth: '220px', marginBottom: 0 }}>
                  <label htmlFor="toGrade">Moving into</label>
                  <select id="toGrade" value={toGrade} onChange={(e) => setToGrade(e.target.value)}>
                    <option value="">Next grade up (automatic)</option>
                    {GRADES.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </div>
                <button type="button" className="btn btn-primary" onClick={handleGenerate} disabled={isGenerating}>
                  {isGenerating
                    ? 'Generating...'
                    : `Generate ${chosenCount > 0 ? `${chosenCount} ` : ''}key${chosenCount === 1 ? '' : 's'}`}
                </button>
              </div>
              <p className="field-help">
                Students who already have a key for {year} are skipped. A/L students finish unless you
                choose a grade for them.
              </p>

              <Alert type="error" message={generateError} />
            </div>

            {result && (
              <div className="card">
                <div className="flex-between" style={{ marginBottom: '8px' }}>
                  <h2 style={{ margin: 0 }}>
                    {result.issued.length} new key(s) for {result.academicYear}
                  </h2>
                  {result.issued.length > 0 && (
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={copyAllKeys}>
                        <Icon name={copied ? 'checkCircle' : 'copy'} size={14} /> {copied ? 'Copied' : 'Copy all'}
                      </button>
                      <button type="button" className="btn btn-primary btn-sm" onClick={() => downloadKeysCsv(result.issued)}>
                        <Icon name="download" size={14} /> Download list
                      </button>
                    </div>
                  )}
                </div>

                {result.issued.length > 0 && (
                  <>
                    <Alert type="warning" message="Copy or download these keys now - they will not be shown again." />
                    <div className="table-scroll">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Student</th>
                            <th>Moving</th>
                            <th>Key</th>
                          </tr>
                        </thead>
                        <tbody>
                          {result.issued.map((key) => (
                            <tr key={key.id}>
                              <td>
                                {key.studentName}
                                {key.studentCode && <div className="order-line-sub">{key.studentCode}</div>}
                              </td>
                              <td>
                                {key.fromGrade || '-'} &rarr; {key.toGrade}
                              </td>
                              <td>
                                <code style={{ fontWeight: 700, userSelect: 'all' }}>{key.keyCode}</code>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}

                {result.skipped.length > 0 && (
                  <div style={{ marginTop: '12px' }}>
                    <p style={{ fontWeight: 600, marginBottom: '4px' }}>Skipped ({result.skipped.length})</p>
                    <ul className="muted" style={{ margin: 0, paddingLeft: '18px', fontSize: '0.86rem' }}>
                      {result.skipped.map((item) => (
                        <li key={item.studentId}>
                          {item.studentName} - {item.reason}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            <div className="card">
              <div className="flex-between" style={{ marginBottom: '12px' }}>
                <h2 style={{ margin: 0 }}>Keys issued for {year}</h2>
                <div className="period-tabs" role="tablist" aria-label="Filter keys">
                  {KEY_FILTERS.map((item) => (
                    <button
                      key={item}
                      type="button"
                      role="tab"
                      aria-selected={keyFilter === item}
                      className={`period-tab${keyFilter === item ? ' active' : ''}`}
                      onClick={() => setKeyFilter(item)}
                    >
                      {item === 'ALL' ? 'All' : item.charAt(0) + item.slice(1).toLowerCase()}
                    </button>
                  ))}
                </div>
              </div>

              <div className="search-input">
                <span className="input-icon">
                  <Icon name="search" size={16} />
                </span>
                <input
                  type="search"
                  placeholder="Search by student, grade, class or student code..."
                  value={keySearch}
                  onChange={(e) => setKeySearch(e.target.value)}
                  aria-label="Search keys"
                />
              </div>

              {listMessage && <Alert type={listMessage.type} message={listMessage.text} />}

              {visibleKeys.length === 0 ? (
                <p className="muted" style={{ margin: 0 }}>
                  {keys.length === 0 ? `No keys have been issued for ${year} yet.` : 'No keys match your search.'}
                </p>
              ) : (
                <div className="table-scroll">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Student</th>
                        <th>Moving</th>
                        <th>Status</th>
                        <th>Valid until</th>
                        <th>Used</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {visibleKeys.map((key) => (
                        <tr key={key.id}>
                          <td>
                            {key.studentName}
                            <div className="order-line-sub">{key.classNames || key.studentEmail}</div>
                          </td>
                          <td>
                            {key.fromGrade || '-'} &rarr; {key.toGrade}
                          </td>
                          <td>
                            <span
                              className={`badge badge-${key.status === 'USED' ? 'success' : key.status === 'REVOKED' ? 'danger' : 'warning'}`}
                            >
                              {key.status.charAt(0) + key.status.slice(1).toLowerCase()}
                            </span>
                          </td>
                          <td>{formatDate(key.expiresAt)}</td>
                          <td>{formatDate(key.usedAt)}</td>
                          <td style={{ textAlign: 'right' }}>
                            <div className="row-actions">
                              {confirmDeleteId === key.id ? (
                                <>
                                  <button
                                    type="button"
                                    className="btn btn-sm btn-danger"
                                    disabled={deletingId === key.id}
                                    onClick={() => handleDelete(key.id)}
                                  >
                                    {deletingId === key.id ? 'Deleting...' : 'Confirm delete'}
                                  </button>
                                  <button type="button" className="btn btn-sm btn-secondary" onClick={() => setConfirmDeleteId(null)}>
                                    Keep
                                  </button>
                                </>
                              ) : (
                                <>
                                  {key.status === 'UNUSED' && (
                                    <button type="button" className="btn btn-sm btn-secondary" onClick={() => handleRevoke(key.id)}>
                                      Revoke
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    className="btn btn-sm btn-secondary"
                                    aria-label={`Delete key for ${key.studentName}`}
                                    onClick={() => setConfirmDeleteId(key.id)}
                                  >
                                    <Icon name="trash" size={14} /> Delete
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
              )}
            </div>

            <div className="card">
              <h2>1 January roll-over</h2>
              <p className="muted" style={{ fontSize: '0.88rem' }}>
                This runs by itself in the first week of January, once keys have been issued for that
                year. Preview it to see exactly who is affected before anything changes.
              </p>

              <Alert type="error" message={previewError} />

              <button type="button" className="btn btn-secondary" onClick={handlePreview} disabled={isPreviewing}>
                {isPreviewing ? 'Checking...' : `Preview the ${year} roll-over`}
              </button>

              {preview && (
                <div style={{ marginTop: '18px' }}>
                  {preview.alreadyRun && (
                    <p className="callout">Already run on {formatDate(preview.ranAt)}. Running it again changes nothing.</p>
                  )}
                  <ul>
                    <li>
                      <strong>{preview.promoteCount}</strong> student(s) move up a grade
                    </li>
                    <li>
                      <strong>{preview.graduateCount}</strong> finish their final grade and are closed out as graduated
                    </li>
                    <li>
                      <strong>{preview.removeCount}</strong> did not re-register and will have their account closed
                    </li>
                  </ul>

                  {preview.remove.length > 0 && (
                    <>
                      <p style={{ fontWeight: 600, marginBottom: '4px' }}>Accounts that will close:</p>
                      <p className="muted" style={{ fontSize: '0.85rem' }}>
                        {preview.remove.map((student) => `${student.name} (${student.grade || 'no grade'})`).join(', ')}
                      </p>
                    </>
                  )}

                  {!preview.alreadyRun && (
                    <div className="inline-form" style={{ marginTop: '14px' }}>
                      <div className="form-field" style={{ minWidth: '200px', marginBottom: 0 }}>
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
          </>
        )}
      </div>
    </PortalShell>
  );
}

export default ReregistrationPage;
