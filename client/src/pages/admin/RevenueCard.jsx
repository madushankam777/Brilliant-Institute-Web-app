// Admin dashboard - revenue card and chart
import { useEffect, useRef, useState } from 'react';
import { fetchRevenueReport } from '../../api/adminApi';
import Alert from '../../../../shared/client/src/components/common/Alert';
import LoadingSpinner from '../../../../shared/client/src/components/common/LoadingSpinner';
import { parseDateKey } from '../../../../shared/client/src/utils/schedule';

const PERIODS = [
  { value: 'daily', label: 'Daily', headline: 'Today', chartTitle: 'Last 30 days' },
  { value: 'monthly', label: 'Monthly', headline: 'This month', chartTitle: 'Last 12 months' },
  { value: 'yearly', label: 'Yearly', headline: 'This year so far', chartTitle: 'Each month this year' },
  { value: 'fiveYears', label: 'Last 5 years', headline: 'Last 5 years', chartTitle: 'Each year' },
];

// the chart is drawn in real pixels, so text stays readable on a phone
const PAD = { top: 26, right: 8, bottom: 30, left: 48 };

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR' }).format(amount);
}

function formatCompact(amount) {
  return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(amount);
}

// short label under the bar + long label for the tooltip and table
function labelsFor(bucket, key) {
  if (bucket === 'day') {
    const date = parseDateKey(key);
    return {
      short: date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
      long: date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' }),
    };
  }
  if (bucket === 'month') {
    const [year, month] = key.split('-').map(Number);
    const date = new Date(year, month - 1, 1);
    return {
      short: date.toLocaleDateString('en-GB', { month: 'short' }),
      long: date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }),
    };
  }
  return { short: key, long: key };
}

// round the axis to clean steps: 0 / 5K / 10K / 15K / 20K
function niceScale(maxValue) {
  if (maxValue <= 0) return { step: 1000, top: 4000 };
  const rawStep = maxValue / 4;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const residual = rawStep / magnitude;
  let niceResidual = 10;
  if (residual <= 1) niceResidual = 1;
  else if (residual <= 2) niceResidual = 2;
  else if (residual <= 2.5) niceResidual = 2.5;
  else if (residual <= 5) niceResidual = 5;
  const step = niceResidual * magnitude;
  return { step, top: step * 4 };
}

// bar with a 4px rounded top and a square base
function barPath(x, top, width, height) {
  const radius = Math.min(4, width / 2, height);
  const bottom = top + height;
  return (
    `M${x},${bottom} V${top + radius} Q${x},${top} ${x + radius},${top} ` +
    `H${x + width - radius} Q${x + width},${top} ${x + width},${top + radius} V${bottom} Z`
  );
}

// width of an element, kept up to date as the window resizes
function useElementWidth(ref) {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!ref.current) return undefined;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

function RevenueChart({ points, bucket, title }) {
  const containerRef = useRef(null);
  const width = Math.max(useElementWidth(containerRef), 280);
  const height = width < 480 ? 210 : 260;
  const [activeIndex, setActiveIndex] = useState(null);

  const plotWidth = width - PAD.left - PAD.right;
  const plotHeight = height - PAD.top - PAD.bottom;
  const maxValue = Math.max(...points.map((point) => point.total), 0);
  const { step, top } = niceScale(maxValue);
  const ticks = [0, step, step * 2, step * 3, step * 4];
  const band = plotWidth / points.length;
  const barWidth = Math.max(2, Math.min(24, band - 2));
  const yFor = (value) => PAD.top + plotHeight - (value / top) * plotHeight;
  const maxIndex = maxValue > 0 ? points.findIndex((point) => point.total === maxValue) : -1;

  // only as many labels as fit, always including the latest period
  const labelStep = Math.ceil(points.length / Math.max(2, Math.floor(plotWidth / 52)));
  const showLabel = (index) => (points.length - 1 - index) % labelStep === 0;

  const active = activeIndex === null ? null : points[activeIndex];
  const activeX = active ? PAD.left + band * activeIndex + band / 2 : 0;
  // keep the tooltip inside the card for bars near either edge
  let tooltipShift = '-50%';
  if (activeX > width * 0.8) tooltipShift = 'calc(-100% + 16px)';
  if (activeX < width * 0.2) tooltipShift = '-16px';

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Revenue, ${title}`}>
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={PAD.left}
              x2={width - PAD.right}
              y1={yFor(tick)}
              y2={yFor(tick)}
              stroke={tick === 0 ? 'var(--color-border)' : 'var(--color-border-soft)'}
              strokeWidth="1"
            />
            <text
              x={PAD.left - 8}
              y={yFor(tick) + 4}
              textAnchor="end"
              fontSize="11"
              fill="var(--color-muted)"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {formatCompact(tick)}
            </text>
          </g>
        ))}

        {points.map((point, index) => {
          const x = PAD.left + band * index + (band - barWidth) / 2;
          const barTop = yFor(point.total);
          const barHeight = PAD.top + plotHeight - barTop;
          return (
            <g key={point.key}>
              {barHeight > 0 && (
                <path
                  d={barPath(x, barTop, barWidth, barHeight)}
                  fill={index === activeIndex ? 'var(--color-primary-dark)' : 'var(--color-primary)'}
                />
              )}
              {index === maxIndex && index !== activeIndex && (
                <text x={x + barWidth / 2} y={barTop - 8} textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--color-text)">
                  {formatCompact(point.total)}
                </text>
              )}
              {showLabel(index) && (
                <text x={PAD.left + band * index + band / 2} y={height - 8} textAnchor="middle" fontSize="11" fill="var(--color-muted)">
                  {labelsFor(bucket, point.key).short}
                </text>
              )}
              {/* the whole column is the hover / tap / keyboard target */}
              <rect
                className="chart-hit"
                x={PAD.left + band * index}
                y={PAD.top}
                width={band}
                height={plotHeight}
                tabIndex={0}
                aria-label={`${labelsFor(bucket, point.key).long}: ${formatCurrency(point.total)}`}
                onMouseEnter={() => setActiveIndex(index)}
                onMouseLeave={() => setActiveIndex(null)}
                onFocus={() => setActiveIndex(index)}
                onBlur={() => setActiveIndex(null)}
              />
            </g>
          );
        })}
      </svg>

      {active && (
        <div
          className="chart-tooltip"
          style={{ left: activeX, top: yFor(active.total), transform: `translate(${tooltipShift}, calc(-100% - 8px))` }}
        >
          <strong>{formatCurrency(active.total)}</strong>
          {labelsFor(bucket, active.key).long} &middot; {active.paymentCount} payment(s)
        </div>
      )}
    </div>
  );
}

function RevenueCard() {
  const [period, setPeriod] = useState('monthly');
  const [report, setReport] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [showTable, setShowTable] = useState(false);

  useEffect(() => {
    let isCurrent = true;
    setIsLoading(true);
    setError('');
    fetchRevenueReport(period)
      .then((data) => {
        if (isCurrent) setReport(data);
      })
      .catch((loadError) => {
        if (isCurrent) setError(loadError.message);
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false);
      });
    return () => {
      isCurrent = false;
    };
  }, [period]);

  const periodInfo = PERIODS.find((item) => item.value === period);
  const hasRevenue = report && report.points.some((point) => point.total > 0);

  return (
    <div className="card">
      <div className="flex-between">
        <h2 style={{ margin: 0 }}>Revenue</h2>
        <div className="period-tabs" role="tablist" aria-label="Revenue period">
          {PERIODS.map((item) => (
            <button
              key={item.value}
              type="button"
              role="tab"
              aria-selected={period === item.value}
              className={`period-tab${period === item.value ? ' active' : ''}`}
              onClick={() => setPeriod(item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <Alert type="error" message={error} />

      {!report ? (
        isLoading && <LoadingSpinner label="Loading revenue..." />
      ) : (
        <div className={isLoading ? 'revenue-chart is-loading' : 'revenue-chart'}>
          <div className="revenue-head" style={{ marginTop: 0 }}>
            <div>
              <div className="revenue-figure">{formatCurrency(report.total)}</div>
              <p className="revenue-caption">
                {periodInfo.headline} &middot; {report.paymentCount} payment(s)
              </p>
            </div>
            {hasRevenue && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowTable((value) => !value)}>
                {showTable ? 'Show chart' : 'Show as table'}
              </button>
            )}
          </div>

          <p className="muted" style={{ margin: '16px 0 0', fontSize: '0.84rem', fontWeight: 600 }}>
            {periodInfo.chartTitle}
          </p>

          {!hasRevenue ? (
            <p className="muted" style={{ marginTop: '8px' }}>
              No payments were received in this period.
            </p>
          ) : showTable ? (
            <div className="table-scroll" style={{ marginTop: '8px' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Period</th>
                    <th style={{ textAlign: 'right' }}>Revenue</th>
                    <th style={{ textAlign: 'right' }}>Payments</th>
                  </tr>
                </thead>
                <tbody>
                  {[...report.points].reverse().map((point) => (
                    <tr key={point.key}>
                      <td>{labelsFor(report.bucket, point.key).long}</td>
                      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        {formatCurrency(point.total)}
                      </td>
                      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{point.paymentCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <RevenueChart points={report.points} bucket={report.bucket} title={periodInfo.chartTitle} />
          )}
        </div>
      )}
    </div>
  );
}

export default RevenueCard;
