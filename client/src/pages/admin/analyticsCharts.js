// ECharts settings for each Analytics chart

const NAVY = '#1e3a8a';
const BLUE = '#2563eb';
const GOLD = '#c9a961';
const GREEN = '#15803d';
const AMBER = '#d97706';
const RED = '#b91c1c';
const TEAL = '#0f766e';
const GREY = '#e2e8f0';

// tooltips are HTML, so names typed by users are escaped first
export function esc(text) {
  return String(text ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
}

export const lkr = (value) => `LKR ${Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
const compact = (value) => new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
const pct = (value) => (value === null || value === undefined ? '-' : `${Number(value).toFixed(1)}%`);

// save as image + view the numbers behind the chart
function toolbox(name, extra = {}) {
  return {
    right: 0,
    top: 0,
    itemSize: 14,
    feature: {
      ...extra,
      dataView: { readOnly: true, title: 'View data', lang: ['Data', 'Close', 'Refresh'] },
      saveAsImage: { title: 'Save as image', name, pixelRatio: 2 },
    },
  };
}

// zoom bar when there are many columns
function zoom(count) {
  return count > 16 ? [{ type: 'inside' }, { type: 'slider', height: 16, bottom: 6 }] : [];
}

function grid(count, extra = {}) {
  return { left: 8, right: 16, top: 46, bottom: count > 16 ? 46 : 8, containLabel: true, ...extra };
}

const categoryAxis = (data) => ({ type: 'category', data, axisTick: { alignWithLabel: true }, axisLabel: { hideOverlap: true } });

// money in vs money paid to tutors
export function moneyOption(a) {
  return {
    tooltip: { trigger: 'axis', valueFormatter: lkr },
    legend: { top: 4, left: 0 },
    toolbox: toolbox('fees-and-payouts', { magicType: { type: ['line', 'bar'], title: { line: 'Lines', bar: 'Bars' } } }),
    grid: grid(a.labels.length),
    xAxis: categoryAxis(a.labels),
    yAxis: { type: 'value', axisLabel: { formatter: compact } },
    dataZoom: zoom(a.labels.length),
    series: [
      { name: 'Fees collected', type: 'bar', data: a.money.collected, color: BLUE, itemStyle: { borderRadius: [3, 3, 0, 0] }, barMaxWidth: 34 },
      { name: 'Paid to tutors', type: 'bar', data: a.money.payouts, color: GOLD, itemStyle: { borderRadius: [3, 3, 0, 0] }, barMaxWidth: 34 },
    ],
  };
}

// share of fees by payment method
export function methodsOption(a) {
  return {
    tooltip: { trigger: 'item', formatter: (p) => `${esc(p.name)}<br/><b>${lkr(p.value)}</b> (${p.percent}%)` },
    legend: { bottom: 0, type: 'scroll' },
    toolbox: toolbox('payment-methods'),
    series: [
      {
        type: 'pie',
        radius: ['42%', '68%'],
        center: ['50%', '45%'],
        itemStyle: { borderColor: '#fff', borderWidth: 2 },
        label: { formatter: '{d}%' },
        data: a.methods.map((item) => ({ name: item.name, value: item.value, key: item.key })),
      },
    ],
  };
}

// attendance marks by period + attendance rate against the target
export function attendanceOption(a) {
  const { attendance } = a;
  return {
    tooltip: { trigger: 'axis' },
    legend: { top: 4, left: 0 },
    toolbox: toolbox('attendance'),
    grid: grid(a.labels.length),
    xAxis: categoryAxis(a.labels),
    yAxis: [
      { type: 'value', axisLabel: { formatter: compact } },
      { type: 'value', min: 0, max: 100, axisLabel: { formatter: '{value}%' }, splitLine: { show: false } },
    ],
    dataZoom: zoom(a.labels.length),
    series: [
      { name: 'Present', type: 'bar', stack: 'marks', data: attendance.present, color: GREEN, barMaxWidth: 34 },
      { name: 'Late', type: 'bar', stack: 'marks', data: attendance.late, color: AMBER, barMaxWidth: 34 },
      { name: 'Absent', type: 'bar', stack: 'marks', data: attendance.absent, color: RED, barMaxWidth: 34 },
      {
        name: 'Attendance rate',
        type: 'line',
        yAxisIndex: 1,
        data: attendance.rate,
        color: NAVY,
        smooth: true,
        connectNulls: true,
        symbolSize: 7,
        lineStyle: { width: 3 },
        tooltip: { valueFormatter: pct },
        markLine: {
          symbol: 'none',
          lineStyle: { color: GOLD, type: 'dashed', width: 2 },
          label: { formatter: `Target ${attendance.threshold}%`, color: '#8a6d1d', position: 'insideStartTop' },
          data: [{ yAxis: attendance.threshold }],
        },
      },
    ],
  };
}

// attendance rate for every class, week by week
export function heatmapOption(a) {
  const { heatmap } = a;
  return {
    tooltip: {
      formatter: (p) => `${esc(heatmap.classes[p.value[1]]?.name)}<br/>${esc(heatmap.weeks[p.value[0]])}: <b>${pct(p.value[2])}</b>`,
    },
    toolbox: toolbox('attendance-by-class'),
    grid: { left: 8, right: 16, top: 30, bottom: 64, containLabel: true },
    xAxis: { type: 'category', data: heatmap.weeks, splitArea: { show: true }, axisLabel: { hideOverlap: true } },
    yAxis: {
      type: 'category',
      data: heatmap.classes.map((item) => item.name),
      splitArea: { show: true },
      axisLabel: { width: 170, overflow: 'truncate' },
    },
    visualMap: {
      min: 50,
      max: 100,
      calculable: true,
      orient: 'horizontal',
      left: 'center',
      bottom: 0,
      itemHeight: 140,
      itemWidth: 12,
      formatter: '{value}%',
      inRange: { color: [RED, '#f59e0b', '#fde68a', '#86efac', GREEN] },
    },
    series: [
      {
        type: 'heatmap',
        data: heatmap.cells,
        label: { show: heatmap.cells.length <= 160, formatter: (p) => Math.round(p.value[2]), fontSize: 10 },
        itemStyle: { borderColor: '#fff', borderWidth: 2 },
        emphasis: { itemStyle: { shadowBlur: 8, shadowColor: 'rgba(15, 23, 42, 0.35)' } },
      },
    ],
  };
}

// tutors: attendance (x) vs fees collected (y), bubble size = students
export function tutorsOption(a) {
  const points = a.tutors.filter((item) => item.attendance !== null);
  return {
    tooltip: {
      formatter: (p) => {
        const t = p.data.tutor;
        return `<b>${esc(t.name)}</b><br/>Students: ${t.students}<br/>Attendance: ${pct(t.attendance)}<br/>Fees collected: ${lkr(t.collected)}<br/>Paid to tutor: ${lkr(t.paid)}`;
      },
    },
    toolbox: toolbox('tutor-performance'),
    grid: { left: 8, right: 30, top: 40, bottom: 30, containLabel: true },
    xAxis: {
      type: 'value',
      name: 'Attendance %',
      nameLocation: 'middle',
      nameGap: 26,
      min: (value) => Math.max(0, Math.floor((value.min - 5) / 5) * 5),
      max: 100,
    },
    yAxis: { type: 'value', name: 'Fees collected', axisLabel: { formatter: compact } },
    series: [
      {
        type: 'scatter',
        data: points.map((t) => ({ value: [t.attendance, t.collected, t.students], name: t.name, tutor: t })),
        symbolSize: (value) => 14 + Math.sqrt(value[2]) * 7,
        itemStyle: { color: BLUE, opacity: 0.75, borderColor: NAVY },
        label: { show: true, position: 'right', formatter: '{b}', color: '#0f172a', fontSize: 11 },
        emphasis: { focus: 'self', itemStyle: { opacity: 1 } },
      },
    ],
  };
}

// fees collected vs paid out, per tutor
export function tutorMoneyOption(a) {
  const tutors = [...a.tutors].sort((x, y) => x.collected - y.collected);
  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: lkr },
    legend: { top: 4, left: 0 },
    toolbox: toolbox('tutor-money'),
    grid: { left: 8, right: 24, top: 40, bottom: 8, containLabel: true },
    xAxis: { type: 'value', axisLabel: { formatter: compact } },
    yAxis: { type: 'category', data: tutors.map((t) => t.name), axisLabel: { width: 130, overflow: 'truncate' } },
    series: [
      { name: 'Fees collected', type: 'bar', data: tutors.map((t) => ({ value: t.collected, id: t.id })), color: BLUE, barMaxWidth: 16 },
      { name: 'Paid to tutor', type: 'bar', data: tutors.map((t) => ({ value: t.paid, id: t.id })), color: GOLD, barMaxWidth: 16 },
    ],
  };
}

// seats taken in each class
export function classesOption(a) {
  const classes = [...a.classes].sort((x, y) => x.enrolled / (x.capacity || 1) - y.enrolled / (y.capacity || 1));
  return {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (items) => {
        const c = classes[items[0].dataIndex];
        return `<b>${esc(c.name)}</b><br/>${esc(c.tutor)}<br/>Enrolled: ${c.enrolled} of ${c.capacity}` +
          `<br/>Attendance: ${pct(c.attendance)}<br/>Collected: ${lkr(c.collected)}<br/>Outstanding: ${lkr(c.owed)}`;
      },
    },
    legend: { top: 4, left: 0 },
    toolbox: toolbox('class-seats'),
    grid: { left: 8, right: 24, top: 40, bottom: 8, containLabel: true },
    xAxis: { type: 'value', minInterval: 1 },
    yAxis: { type: 'category', data: classes.map((c) => c.name), axisLabel: { width: 170, overflow: 'truncate' } },
    series: [
      { name: 'Enrolled', type: 'bar', stack: 'seats', data: classes.map((c) => ({ value: c.enrolled, id: c.id })), color: NAVY, barMaxWidth: 18 },
      {
        name: 'Free seats',
        type: 'bar',
        stack: 'seats',
        data: classes.map((c) => ({ value: Math.max(0, c.capacity - c.enrolled), id: c.id })),
        color: GREY,
        barMaxWidth: 18,
      },
    ],
  };
}

export function gradesOption(a) {
  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    toolbox: toolbox('students-by-grade'),
    grid: { left: 8, right: 16, top: 36, bottom: 8, containLabel: true },
    xAxis: categoryAxis(a.students.grades.map((g) => g.name)),
    yAxis: { type: 'value', minInterval: 1 },
    series: [
      {
        name: 'Students',
        type: 'bar',
        data: a.students.grades.map((g) => g.value),
        color: NAVY,
        barMaxWidth: 40,
        itemStyle: { borderRadius: [3, 3, 0, 0] },
        label: { show: true, position: 'top' },
      },
    ],
  };
}

export function subjectsOption(a) {
  return {
    tooltip: { trigger: 'item', formatter: (p) => `${esc(p.name)}<br/><b>${p.value}</b> enrolments (${p.percent}%)` },
    legend: { bottom: 0, type: 'scroll' },
    toolbox: toolbox('enrolments-by-subject'),
    series: [
      {
        type: 'pie',
        roseType: 'radius',
        radius: ['18%', '66%'],
        center: ['50%', '45%'],
        itemStyle: { borderColor: '#fff', borderWidth: 2, borderRadius: 4 },
        label: { formatter: '{b}\n{c}' },
        data: a.students.subjects,
      },
    ],
  };
}

// new students and new enrolments over time
export function growthOption(a) {
  return {
    tooltip: { trigger: 'axis' },
    legend: { top: 4, left: 0 },
    toolbox: toolbox('growth'),
    grid: grid(a.labels.length),
    xAxis: { ...categoryAxis(a.labels), boundaryGap: false },
    yAxis: { type: 'value', minInterval: 1 },
    dataZoom: zoom(a.labels.length),
    series: [
      { name: 'New students', type: 'line', data: a.students.newStudents, color: NAVY, smooth: true, areaStyle: { opacity: 0.12 } },
      { name: 'New enrolments', type: 'line', data: a.students.newEnrolments, color: TEAL, smooth: true, areaStyle: { opacity: 0.12 } },
    ],
  };
}

export function feedbackOption(a) {
  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    legend: { top: 4, left: 0 },
    toolbox: toolbox('feedback'),
    grid: grid(a.labels.length),
    xAxis: categoryAxis(a.labels),
    yAxis: { type: 'value', minInterval: 1 },
    dataZoom: zoom(a.labels.length),
    series: [
      { name: 'Resolved', type: 'bar', stack: 'tickets', data: a.feedback.resolved, color: GREEN, barMaxWidth: 34 },
      { name: 'In progress', type: 'bar', stack: 'tickets', data: a.feedback.inProgress, color: BLUE, barMaxWidth: 34 },
      { name: 'Waiting', type: 'bar', stack: 'tickets', data: a.feedback.pending, color: AMBER, barMaxWidth: 34 },
    ],
  };
}

// sign-ins by role - how much the site is used
export function usageOption(a) {
  return {
    tooltip: { trigger: 'axis' },
    legend: { top: 4, left: 0 },
    toolbox: toolbox('site-usage'),
    grid: grid(a.labels.length),
    xAxis: { ...categoryAxis(a.labels), boundaryGap: false },
    yAxis: { type: 'value', minInterval: 1 },
    dataZoom: zoom(a.labels.length),
    series: [
      { name: 'Students', type: 'line', stack: 'use', data: a.usage.students, color: BLUE, smooth: true, areaStyle: {}, symbol: 'none' },
      { name: 'Tutors', type: 'line', stack: 'use', data: a.usage.tutors, color: GOLD, smooth: true, areaStyle: {}, symbol: 'none' },
      { name: 'Admins', type: 'line', stack: 'use', data: a.usage.admins, color: NAVY, smooth: true, areaStyle: {}, symbol: 'none' },
    ],
  };
}
