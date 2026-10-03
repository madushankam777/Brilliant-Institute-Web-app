// Admin: Analytics - interactive charts (Apache ECharts) for the whole institute
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { fetchAnalytics, downloadReportPdf, downloadReportExcel } from '../../api/reportsApi';
import Alert from '../../../../shared/client/src/components/common/Alert';
import Icon from '../../../../shared/client/src/components/common/Icon';
import LoadingSpinner from '../../../../shared/client/src/components/common/LoadingSpinner';
import StatCard from '../../../../shared/client/src/components/common/StatCard';
import PortalShell from '../../../../shared/client/src/components/layout/PortalShell';
import { getNavItems } from '../../../../shared/client/src/components/layout/navItems';
import EChart from './EChart';
import { PRESETS, presetRange } from './reportPeriods';
import * as charts from './analyticsCharts';

const NAV_ITEMS = getNavItems('ADMIN');
const KPI_ICONS = ['users', 'wallet', 'bank', 'card', 'checkCircle', 'chat'];
const PERIOD_WORD = { day: 'day', week: 'week', month: 'month' };

// true when every number in the lists is zero
function allZero(...lists) {
  return lists.every((list) => list.every((value) => !value));
}

// one chart card with a title, a short explanation and a link to the full report
function ChartCard({ title, hint, report, wide, empty, children }) {
  return (
    <section className={`card analytics-card${wide ? ' analytics-wide' : ''}`}>
      <div className="analytics-card-head">
        <div>
          <h2>{title}</h2>
          {hint && <p className="muted">{hint}</p>}
        </div>
        {report && (
          <Link to={report} className="btn btn-ghost btn-sm">
            Full report <Icon name="arrowRight" size={14} />
          </Link>
        )}
      </div>
      {empty ? <p className="muted analytics-empty">{empty}</p> : children}
    </section>
  );
}

function AnalyticsPage() {
  const navigate = useNavigate();
  const [preset, setPreset] = useState('last90');
  const [range, setRange] = useState(presetRange('last90'));
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyFile, setBusyFile] = useState('');

  const load = useCallback(async (period) => {
    setIsLoading(true);
    setError('');
    try {
      setData(await fetchAnalytics(period));
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load(presetRange('last90'));
  }, [load]);

  function changePreset(value) {
    setPreset(value);
    if (value !== 'custom') {
      const next = presetRange(value);
      setRange(next);
      load(next);
    }
  }

  // apply btn for custom dates
  function applyDates(event) {
    event.preventDefault();
    if (!range.from || !range.to || range.to < range.from) {
      setError('Choose a start date and an end date on or after it.');
      return;
    }
    load(range);
  }

  // report link for the same period
  const reportLink = useCallback(
    (type, extra = {}) => {
      const query = new URLSearchParams({ type, from: range.from, to: range.to, run: '1', ...extra });
      return `/admin/reports?${query.toString()}`;
    },
    [range]
  );

  // summary report as PDF / Excel for this period
  async function download(kind) {
    setBusyFile(kind);
    setError('');
    try {
      const params = { from: range.from, to: range.to };
      if (kind === 'pdf') await downloadReportPdf('overview', params);
      else await downloadReportExcel('overview', params);
    } catch (downloadError) {
      setError(downloadError.message);
    } finally {
      setBusyFile('');
    }
  }

  // chart settings only change when the data does
  const options = useMemo(() => {
    if (!data) return null;
    return {
      money: charts.moneyOption(data),
      methods: charts.methodsOption(data),
      attendance: charts.attendanceOption(data),
      heatmap: charts.heatmapOption(data),
      tutors: charts.tutorsOption(data),
      tutorMoney: charts.tutorMoneyOption(data),
      classes: charts.classesOption(data),
      grades: charts.gradesOption(data),
      subjects: charts.subjectsOption(data),
      growth: charts.growthOption(data),
      feedback: charts.feedbackOption(data),
      usage: charts.usageOption(data),
    };
  }, [data]);

  const step = data ? PERIOD_WORD[data.period.granularity] : 'week';
  const hiddenTutors = data ? data.tutors.filter((item) => item.attendance === null).length : 0;

  return (
    <PortalShell navItems={NAV_ITEMS}>
      <div className="page page-analytics">
        <div className="flex-between page-header">
          <div>
            <h1>Analytics</h1>
            <p className="muted">
              Interactive charts for fees, attendance, classes, tutors and site use. Hover for details, drag to zoom and click a
              tutor or class to open its full report.
            </p>
          </div>
          <div className="analytics-downloads">
            <button type="button" className="btn btn-secondary" disabled={Boolean(busyFile)} onClick={() => download('pdf')}>
              <Icon name="download" size={16} /> {busyFile === 'pdf' ? 'Preparing...' : 'Summary PDF'}
            </button>
            <button type="button" className="btn btn-secondary" disabled={Boolean(busyFile)} onClick={() => download('xlsx')}>
              <Icon name="grid" size={16} /> {busyFile === 'xlsx' ? 'Preparing...' : 'Summary Excel'}
            </button>
          </div>
        </div>

        <form className="card analytics-filters" onSubmit={applyDates}>
          <div className="form-field">
            <label htmlFor="analytics-preset">Period</label>
            <select id="analytics-preset" value={preset} onChange={(e) => changePreset(e.target.value)}>
              {PRESETS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label htmlFor="analytics-from">From</label>
            <input
              id="analytics-from"
              type="date"
              value={range.from}
              max={range.to || undefined}
              onChange={(e) => {
                setPreset('custom');
                setRange((previous) => ({ ...previous, from: e.target.value }));
              }}
            />
          </div>
          <div className="form-field">
            <label htmlFor="analytics-to">To</label>
            <input
              id="analytics-to"
              type="date"
              value={range.to}
              min={range.from || undefined}
              onChange={(e) => {
                setPreset('custom');
                setRange((previous) => ({ ...previous, to: e.target.value }));
              }}
            />
          </div>
          <button type="submit" className="btn btn-primary" disabled={isLoading}>
            <Icon name="refresh" size={16} /> {isLoading ? 'Loading...' : 'Update'}
          </button>
        </form>

        <Alert type="error" message={error} />

        {!data && isLoading && <LoadingSpinner label="Loading analytics..." />}

        {data && options && (
          <div className={isLoading ? 'analytics-body is-loading' : 'analytics-body'}>
            <p className="muted analytics-period">
              {data.period.label} · one point per {step}
            </p>
            <div className="stat-grid stat-grid-3">
              {data.kpis.map((item, index) => (
                <StatCard
                  key={item.label}
                  icon={KPI_ICONS[index] || 'barChart'}
                  label={item.label}
                  value={item.value}
                  sub={item.note}
                  tone={item.tone === 'default' ? 'default' : item.tone}
                  small={String(item.value).length > 9}
                />
              ))}
            </div>

            <div className="analytics-grid">
              <ChartCard
                wide
                title="Fees collected and tutor payouts"
                empty={allZero(data.money.collected, data.money.payouts) && 'No fees or payouts in this period.'}
                hint={`Money received from students and paid to tutors each ${step}.`}
                report={reportLink('finance')}
              >
                <EChart option={options.money} height={340} label="Fees collected and tutor payouts" />
              </ChartCard>

              <ChartCard
                title="Payment methods"
                empty={data.methods.length === 0 && 'No fees were collected in this period.'}
                hint="Share of fees by how students paid."
                report={reportLink('finance')}
              >
                <EChart option={options.methods} height={320} label="Payment methods" onClick={() => navigate(reportLink('finance'))} />
              </ChartCard>

              <ChartCard
                title="Students by grade"
                empty={data.students.grades.length === 0 && 'There are no active students yet.'}
                hint="Active students today."
                report={reportLink('students')}
              >
                <EChart
                  option={options.grades}
                  height={320}
                  label="Students by grade"
                  onClick={(p) => navigate(reportLink('students', { grade: p.name }))}
                />
              </ChartCard>

              <ChartCard
                wide
                title="Attendance"
                empty={allZero(data.attendance.present, data.attendance.late, data.attendance.absent) && 'No attendance was marked in this period.'}
                hint={`Present, late and absent marks each ${step}, with the attendance rate against the target.`}
                report={reportLink('attendance')}
              >
                <EChart option={options.attendance} height={340} label="Attendance" />
              </ChartCard>

              <ChartCard
                wide
                title="Attendance by class"
                hint="Each square is one class in one week - red is low, green is high. Click a class to open its report."
                report={reportLink('attendance')}
              >
                {data.heatmap.cells.length === 0 ? (
                  <p className="muted">No attendance was marked in this period.</p>
                ) : (
                  <EChart
                    option={options.heatmap}
                    height={Math.max(260, 90 + data.heatmap.classes.length * 34)}
                    label="Attendance by class and week"
                    onClick={(p) => {
                      const cls = data.heatmap.classes[p.value[1]];
                      if (cls) navigate(reportLink('classes', { classId: cls.id }));
                    }}
                  />
                )}
              </ChartCard>

              <ChartCard
                title="Tutor performance"
                empty={hiddenTutors === data.tutors.length && 'No attendance has been marked for any tutor in this period.'}
                hint={`Attendance against fees collected; bigger circles teach more students.${hiddenTutors ? ` ${hiddenTutors} tutor(s) with no attendance yet are not shown.` : ''}`}
                report={reportLink('tutors')}
              >
                <EChart
                  option={options.tutors}
                  height={340}
                  label="Tutor performance"
                  onClick={(p) => p.data?.tutor && navigate(reportLink('tutors', { tutorId: p.data.tutor.id }))}
                />
              </ChartCard>

              <ChartCard
                title="Fees and payouts by tutor"
                empty={allZero(data.tutors.map((t) => t.collected), data.tutors.map((t) => t.paid)) && 'No fees or payouts in this period.'}
                hint="Collected from each tutor's classes, and paid to them."
                report={reportLink('payouts')}
              >
                <EChart
                  option={options.tutorMoney}
                  height={340}
                  label="Fees and payouts by tutor"
                  onClick={(p) => p.data?.id && navigate(reportLink('tutors', { tutorId: p.data.id }))}
                />
              </ChartCard>

              <ChartCard wide title="Class seats"
                empty={data.classes.length === 0 && 'There are no active classes.'}
                hint="Seats taken in every active class. Click a class to open its report."
                report={reportLink('classes')}
              >
                <EChart
                  option={options.classes}
                  height={Math.max(260, 70 + data.classes.length * 30)}
                  label="Class seats"
                  onClick={(p) => p.data?.id && navigate(reportLink('classes', { classId: p.data.id }))}
                />
              </ChartCard>

              <ChartCard
                title="Enrolments by subject"
                empty={data.students.subjects.length === 0 && 'There are no active enrolments.'}
                hint="Active enrolments in each subject area."
              >
                <EChart option={options.subjects} height={320} label="Enrolments by subject" />
              </ChartCard>

              <ChartCard
                title="Growth"
                empty={allZero(data.students.newStudents, data.students.newEnrolments) && 'No new students or enrolments in this period.'}
                hint={`New students and new enrolments each ${step}.`}
                report={reportLink('students')}
              >
                <EChart option={options.growth} height={320} label="Growth" />
              </ChartCard>

              <ChartCard
                title="Feedback and complaints"
                empty={allZero(data.feedback.pending, data.feedback.inProgress, data.feedback.resolved) && 'No feedback was received in this period.'}
                hint={`Tickets received each ${step}, by where they stand now.`}
                report={reportLink('feedback')}
              >
                <EChart option={options.feedback} height={320} label="Feedback and complaints" />
              </ChartCard>

              <ChartCard
                title="Site use"
                empty={allZero(data.usage.students, data.usage.tutors, data.usage.admins) && 'No sign-ins in this period.'}
                hint={`Sign-ins each ${step}, by role.`}
                report={reportLink('audit')}
              >
                <EChart option={options.usage} height={320} label="Site use" />
              </ChartCard>
            </div>
            <p className="muted analytics-credit">Charts by Apache ECharts</p>
          </div>
        )}
      </div>
    </PortalShell>
  );
}

export default AnalyticsPage;
