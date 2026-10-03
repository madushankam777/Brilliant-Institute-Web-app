// Admin: reports - pick a report, set the filters, view it and download it as PDF
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  fetchReportCatalog,
  fetchReportOptions,
  fetchReportHistory,
  generateReport,
  downloadReportPdf,
  downloadReportExcel,
  downloadReportZip,
} from '../../api/reportsApi';
import Alert from '../../../../shared/client/src/components/common/Alert';
import Icon from '../../../../shared/client/src/components/common/Icon';
import LoadingSpinner from '../../../../shared/client/src/components/common/LoadingSpinner';
import PortalShell from '../../../../shared/client/src/components/layout/PortalShell';
import { getNavItems } from '../../../../shared/client/src/components/layout/navItems';
import useFormErrors from '../../../../shared/client/src/hooks/useFormErrors';
import ReportView from './ReportView';
import { PRESETS, presetRange } from './reportPeriods';

const NAV_ITEMS = getNavItems('ADMIN');
const GROUPS = ['Overview', 'People', 'Teaching', 'Finance', 'Support', 'Administration'];
const FILTER_KEYS = ['studentId', 'tutorId', 'classId', 'userId', 'grade', 'role', 'status', 'academicYear', 'detail'];

// reports that can be split into one PDF per person
const PEOPLE_REPORTS = { tutors: 'tutorId', students: 'studentId' };

const DETAIL_OPTIONS = [
  { value: 'full', label: 'Each person in full' },
  { value: 'summary', label: 'Summary only' },
];

const ROLE_NAMES = { ADMIN: 'Admin', TUTOR: 'Tutor', STUDENT_PARENT: 'Student' };

const ROLE_OPTIONS = [
  { value: 'STUDENT_PARENT', label: 'Students' },
  { value: 'TUTOR', label: 'Tutors' },
  { value: 'ADMIN', label: 'Admins' },
];

const STATUS_OPTIONS = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'SUSPENDED', label: 'Suspended' },
  { value: 'LEFT', label: 'Left the institute' },
  { value: 'DELETED', label: 'Deleted' },
];

function formatWhen(value) {
  if (!value) return '-';
  return new Date(String(value).replace(' ', 'T')).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function ReportsPage() {
  const [searchParams] = useSearchParams();
  const [catalog, setCatalog] = useState([]);
  const [options, setOptions] = useState(null);
  const [history, setHistory] = useState([]);
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const [type, setType] = useState('');
  const [preset, setPreset] = useState('last30');
  const [range, setRange] = useState(presetRange('last30'));
  const [filters, setFilters] = useState({});

  const [report, setReport] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isZipping, setIsZipping] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [notice, setNotice] = useState('');
  const { fieldErrors, formError, clearErrors, setFieldErrors, captureError } = useFormErrors();
  const reportRef = useRef(null);
  const autoRunDone = useRef(false);

  const selected = catalog.find((item) => item.type === type) || null;
  const usesPeriod = Boolean(selected && selected.params.includes('period'));

  const loadHistory = useCallback(async () => {
    try {
      setHistory(await fetchReportHistory());
    } catch {
      setHistory([]);
    }
  }, []);

  // first load - report list, form choices and recent reports
  useEffect(() => {
    let isMounted = true;
    Promise.all([fetchReportCatalog(), fetchReportOptions()])
      .then(([reports, choices]) => {
        if (!isMounted) return;
        setCatalog(reports);
        setOptions(choices);
        const wanted = searchParams.get('type');
        const first = reports.find((item) => item.type === wanted) || reports[0];
        if (first) chooseReport(first, choices, searchParams);
      })
      .catch((error) => {
        if (isMounted) setLoadError(error.message);
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });
    loadHistory();
    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // pick a report - resets the filters to its defaults (or to the link's values)
  function chooseReport(entry, choices = options, params = null) {
    setType(entry.type);
    setReport(null);
    setNotice('');
    clearErrors();
    const nextPreset = entry.preset || 'last30';
    setPreset(nextPreset);
    setRange(presetRange(nextPreset));
    const next = {};
    if (entry.params.includes('academicYear') && choices) next.academicYear = String(choices.defaultYear);
    if (entry.params.includes('detail')) next.detail = 'full';
    if (params) {
      FILTER_KEYS.forEach((key) => {
        if (params.get(key) && entry.params.includes(key)) next[key] = params.get(key);
      });
      if (params.get('from') && params.get('to')) {
        setPreset('custom');
        setRange({ from: params.get('from'), to: params.get('to') });
      }
    }
    setFilters(next);
  }

  // auto-run when opened from a "Report" button on another page
  useEffect(() => {
    if (autoRunDone.current || !selected || searchParams.get('run') !== '1') return;
    autoRunDone.current = true;
    runReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  function buildParams(source = null) {
    if (source) return source;
    const params = {};
    if (usesPeriod) {
      params.from = range.from;
      params.to = range.to;
    }
    FILTER_KEYS.forEach((key) => {
      if (filters[key] && selected.params.includes(key)) params[key] = filters[key];
    });
    return params;
  }

  // checks the dates before asking the server
  function checkForm() {
    if (!usesPeriod) return true;
    const found = {};
    if (!range.from) found.from = 'Choose a start date.';
    if (!range.to) found.to = 'Choose an end date.';
    if (range.from && range.to && range.to < range.from) found.to = 'The end date must be on or after the start date.';
    setFieldErrors(found);
    return Object.keys(found).length === 0;
  }

  // generate report btn
  async function runReport(event, source = null, sourceType = null) {
    if (event) event.preventDefault();
    setNotice('');
    clearErrors();
    if (!source && !checkForm()) return;
    setIsGenerating(true);
    try {
      const result = await generateReport(sourceType || type, buildParams(source));
      setReport(result);
      loadHistory();
      setTimeout(() => reportRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    } catch (error) {
      captureError(error);
    } finally {
      setIsGenerating(false);
    }
  }

  // download pdf btn
  async function downloadPdf(source = null, sourceType = null) {
    setNotice('');
    clearErrors();
    if (!source && !checkForm()) return;
    setIsDownloading(true);
    try {
      const filename = await downloadReportPdf(sourceType || type, buildParams(source));
      setNotice(`${filename} downloaded.`);
      loadHistory();
    } catch (error) {
      captureError(error);
    } finally {
      setIsDownloading(false);
    }
  }

  // download excel btn
  async function downloadExcel(source = null, sourceType = null) {
    setNotice('');
    clearErrors();
    if (!source && !checkForm()) return;
    setIsExporting(true);
    try {
      const filename = await downloadReportExcel(sourceType || type, buildParams(source));
      setNotice(`${filename} downloaded.`);
      loadHistory();
    } catch (error) {
      captureError(error);
    } finally {
      setIsExporting(false);
    }
  }

  // one pdf per person btn - a ZIP with a separate PDF for every tutor or student
  async function downloadZip(source = null, sourceType = null) {
    setNotice('');
    clearErrors();
    if (!source && !checkForm()) return;
    setIsZipping(true);
    try {
      const result = await downloadReportZip(sourceType || type, buildParams(source));
      setNotice(`${result.filename} downloaded - ${result.count} PDF file${result.count === 1 ? '' : 's'}.`);
      loadHistory();
    } catch (error) {
      captureError(error);
    } finally {
      setIsZipping(false);
    }
  }

  // open btn in recent reports - same report and filters, today's data
  function reopen(entry) {
    const item = catalog.find((report) => report.type === entry.type);
    if (!item) return;
    setType(item.type);
    const query = entry.query || {};
    if (query.from && query.to) {
      setPreset('custom');
      setRange({ from: query.from, to: query.to });
    }
    const next = {};
    FILTER_KEYS.forEach((key) => {
      if (query[key]) next[key] = String(query[key]);
    });
    setFilters(next);
    runReport(null, query, item.type);
  }

  function changePreset(value) {
    setPreset(value);
    if (value !== 'custom') setRange(presetRange(value));
  }

  function changeDate(key, value) {
    setPreset('custom');
    setRange((previous) => ({ ...previous, [key]: value }));
  }

  function changeFilter(key, value) {
    setFilters((previous) => ({ ...previous, [key]: value }));
  }

  const busy = isGenerating || isDownloading || isZipping || isExporting;
  // "all tutors" / "all students" - can be split into one file each
  const personKey = selected ? PEOPLE_REPORTS[selected.type] : null;
  const canSplit = Boolean(personKey && !filters[personKey]);

  return (
    <PortalShell navItems={NAV_ITEMS}>
      <div className="page page-reports">
        <div className="page-header">
          <h1>Reports</h1>
          <p className="muted">
            Professional reports for every part of the institute. Choose a report, set the period and filters, then view it here
            or download it as a PDF.
          </p>
        </div>

        <Alert type="error" message={loadError} />

        {isLoading ? (
          <LoadingSpinner label="Loading reports..." />
        ) : (
          <div className="reports-layout">
            <aside className="card reports-catalog" aria-label="Reports">
              {GROUPS.map((group) => {
                const items = catalog.filter((item) => item.group === group);
                if (items.length === 0) return null;
                return (
                  <div key={group} className="reports-group">
                    <span className="reports-group-title">{group}</span>
                    {items.map((item) => (
                      <button
                        key={item.type}
                        type="button"
                        className={`report-pick${item.type === type ? ' active' : ''}`}
                        onClick={() => chooseReport(item)}
                        aria-pressed={item.type === type}
                      >
                        <Icon name={item.icon} size={18} />
                        <span>{item.title}</span>
                      </button>
                    ))}
                  </div>
                );
              })}
            </aside>

            <div className="reports-main">
              {selected && (
                <div className="card report-form-card">
                  <div className="form-field reports-mobile-pick">
                    <label htmlFor="report-type">Report</label>
                    <select id="report-type" value={type} onChange={(e) => chooseReport(catalog.find((item) => item.type === e.target.value))}>
                      {GROUPS.map((group) => (
                        <optgroup key={group} label={group}>
                          {catalog
                            .filter((item) => item.group === group)
                            .map((item) => (
                              <option key={item.type} value={item.type}>
                                {item.title}
                              </option>
                            ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>

                  <div className="report-form-head">
                    <span className="report-form-icon">
                      <Icon name={selected.icon} size={22} />
                    </span>
                    <div>
                      <h2>{selected.title}</h2>
                      <p className="muted">{selected.description}</p>
                    </div>
                  </div>

                  <Alert type="error" message={formError} />
                  <Alert type="success" message={notice} />

                  <form onSubmit={runReport} noValidate>
                    <div className="report-filters">
                      {usesPeriod && (
                        <>
                          <div className="form-field">
                            <label htmlFor="report-preset">Period</label>
                            <select id="report-preset" value={preset} onChange={(e) => changePreset(e.target.value)}>
                              {PRESETS.map((item) => (
                                <option key={item.value} value={item.value}>
                                  {item.label}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="form-field">
                            <label htmlFor="report-from">From</label>
                            <input
                              id="report-from"
                              type="date"
                              value={range.from}
                              max={range.to || undefined}
                              onChange={(e) => changeDate('from', e.target.value)}
                              aria-invalid={Boolean(fieldErrors.from)}
                              aria-describedby={fieldErrors.from ? 'report-from-error' : undefined}
                            />
                            {fieldErrors.from && <p className="field-error" id="report-from-error">{fieldErrors.from}</p>}
                          </div>
                          <div className="form-field">
                            <label htmlFor="report-to">To</label>
                            <input
                              id="report-to"
                              type="date"
                              value={range.to}
                              min={range.from || undefined}
                              onChange={(e) => changeDate('to', e.target.value)}
                              aria-invalid={Boolean(fieldErrors.to)}
                              aria-describedby={fieldErrors.to ? 'report-to-error' : undefined}
                            />
                            {fieldErrors.to && <p className="field-error" id="report-to-error">{fieldErrors.to}</p>}
                          </div>
                        </>
                      )}

                      {selected.params.includes('tutorId') && (
                        <FilterSelect
                          id="tutorId"
                          label="Tutor"
                          value={filters.tutorId}
                          error={fieldErrors.tutorId}
                          onChange={changeFilter}
                          allLabel="All tutors"
                          options={(options?.tutors || []).map((item) => ({ value: item.id, label: item.name }))}
                        />
                      )}
                      {selected.params.includes('studentId') && (
                        <FilterSelect
                          id="studentId"
                          label="Student"
                          value={filters.studentId}
                          error={fieldErrors.studentId}
                          onChange={changeFilter}
                          allLabel="All students"
                          options={(options?.students || []).map((item) => ({
                            value: item.id,
                            label: `${item.name}${item.code ? ` (${item.code})` : ''}`,
                          }))}
                        />
                      )}
                      {selected.params.includes('userId') && (
                        <FilterSelect
                          id="userId"
                          label="Person"
                          value={filters.userId}
                          error={fieldErrors.userId}
                          onChange={changeFilter}
                          allLabel="Everyone"
                          options={(options?.people || []).map((item) => ({
                            value: item.id,
                            label: `${item.name} (${ROLE_NAMES[item.role] || item.role})`,
                          }))}
                        />
                      )}
                      {selected.params.includes('detail') && canSplit && (
                        <FilterSelect
                          id="detail"
                          label="Include"
                          value={filters.detail}
                          error={fieldErrors.detail}
                          onChange={changeFilter}
                          options={DETAIL_OPTIONS}
                        />
                      )}
                      {selected.params.includes('grade') && !filters.studentId && (
                        <FilterSelect
                          id="grade"
                          label="Grade"
                          value={filters.grade}
                          error={fieldErrors.grade}
                          onChange={changeFilter}
                          allLabel="All grades"
                          options={(options?.grades || []).map((grade) => ({ value: grade, label: grade }))}
                        />
                      )}
                      {selected.params.includes('classId') && (
                        <FilterSelect
                          id="classId"
                          label="Class"
                          value={filters.classId}
                          error={fieldErrors.classId}
                          onChange={changeFilter}
                          allLabel="All classes"
                          options={(options?.classes || []).map((item) => ({
                            value: item.id,
                            label: `${item.subject}${item.status !== 'ACTIVE' ? ' (cancelled)' : ''}`,
                          }))}
                        />
                      )}
                      {selected.params.includes('role') && (
                        <FilterSelect id="role" label="Role" value={filters.role} error={fieldErrors.role} onChange={changeFilter} allLabel="All roles" options={ROLE_OPTIONS} />
                      )}
                      {selected.params.includes('status') && (
                        <FilterSelect
                          id="status"
                          label="Account status"
                          value={filters.status}
                          error={fieldErrors.status}
                          onChange={changeFilter}
                          allLabel="All except deleted"
                          options={STATUS_OPTIONS}
                        />
                      )}
                      {selected.params.includes('academicYear') && (
                        <FilterSelect
                          id="academicYear"
                          label="Academic year"
                          value={filters.academicYear}
                          error={fieldErrors.academicYear}
                          onChange={changeFilter}
                          options={(options?.years || []).map((year) => ({ value: year, label: String(year) }))}
                        />
                      )}
                    </div>

                    <div className="report-actions">
                      <button type="submit" className="btn btn-primary" disabled={busy}>
                        <Icon name="barChart" size={16} /> {isGenerating ? 'Generating...' : 'Generate report'}
                      </button>
                      <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => downloadPdf()}>
                        <Icon name="download" size={16} /> {isDownloading ? 'Preparing PDF...' : 'Download PDF'}
                      </button>
                      <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => downloadExcel()}>
                        <Icon name="grid" size={16} /> {isExporting ? 'Preparing Excel...' : 'Download Excel'}
                      </button>
                      {canSplit && (
                        <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => downloadZip()}>
                          <Icon name="copy" size={16} /> {isZipping ? 'Preparing files...' : 'One PDF per person (ZIP)'}
                        </button>
                      )}
                    </div>
                  </form>
                </div>
              )}

              <div ref={reportRef}>
                {isGenerating && <LoadingSpinner label="Building your report..." />}
                {!isGenerating && report && (
                  <div className="report-preview">
                    <div className="report-preview-bar">
                      <span className="muted">Preview - the PDF has the same content, laid out for printing.</span>
                      <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => downloadPdf(report.query, report.type)}>
                        <Icon name="download" size={15} /> {isDownloading ? 'Preparing...' : 'Download PDF'}
                      </button>
                      <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => downloadExcel(report.query, report.type)}>
                        <Icon name="grid" size={15} /> {isExporting ? 'Preparing...' : 'Excel'}
                      </button>
                    </div>
                    <ReportView report={report} />
                  </div>
                )}
              </div>

              <div className="card">
                <div className="flex-between">
                  <h2 style={{ margin: 0 }}>Recent reports</h2>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={loadHistory}>
                    <Icon name="refresh" size={15} /> Refresh
                  </button>
                </div>
                {history.length === 0 ? (
                  <p className="muted" style={{ marginTop: '12px' }}>No reports have been generated yet.</p>
                ) : (
                  <div className="table-scroll" style={{ marginTop: '12px' }}>
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Report</th>
                          <th>Period</th>
                          <th>By</th>
                          <th>When</th>
                          <th>Type</th>
                          <th aria-label="Actions" />
                        </tr>
                      </thead>
                      <tbody>
                        {(showAllHistory ? history : history.slice(0, 8)).map((entry) => (
                          <tr key={entry.id}>
                            <td>
                              {entry.title}
                              <div className="order-line-sub">
                                {entry.filters.map((item) => `${item.label}: ${item.value}`).join(' · ') || entry.reportNumber}
                              </div>
                            </td>
                            <td>{entry.periodLabel}</td>
                            <td>{entry.generatedBy}</td>
                            <td className="nowrap">{formatWhen(entry.createdAt)}</td>
                            <td>
                              <span className={`badge ${entry.format === 'view' ? 'badge-neutral' : 'badge-success'}`}>
                                {{ zip: 'ZIP', pdf: 'PDF', xlsx: 'Excel' }[entry.format] || 'Viewed'}
                              </span>
                            </td>
                            <td>
                              {catalog.some((item) => item.type === entry.type) && (
                                <div className="report-history-actions">
                                  <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => reopen(entry)}>
                                    Open
                                  </button>
                                  {entry.format === 'zip' && (
                                    <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => downloadZip(entry.query, entry.type)}>
                                      ZIP
                                    </button>
                                  )}
                                  {entry.format === 'xlsx' && (
                                    <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => downloadExcel(entry.query, entry.type)}>
                                      Excel
                                    </button>
                                  )}
                                  {entry.format !== 'zip' && entry.format !== 'xlsx' && (
                                    <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => downloadPdf(entry.query, entry.type)}>
                                      PDF
                                    </button>
                                  )}
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {history.length > 8 && (
                  <button type="button" className="btn btn-link" onClick={() => setShowAllHistory((value) => !value)}>
                    {showAllHistory ? 'Show fewer' : `Show all ${history.length}`}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </PortalShell>
  );
}

// dropdown filter with an "all" choice
function FilterSelect({ id, label, value, error, onChange, options, allLabel }) {
  return (
    <div className="form-field">
      <label htmlFor={`report-${id}`}>{label}</label>
      <select
        id={`report-${id}`}
        value={value || ''}
        onChange={(e) => onChange(id, e.target.value)}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `report-${id}-error` : undefined}
      >
        {allLabel && <option value="">{allLabel}</option>}
        {options.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </select>
      {error && <p className="field-error" id={`report-${id}-error`}>{error}</p>}
    </div>
  );
}

export default ReportsPage;
