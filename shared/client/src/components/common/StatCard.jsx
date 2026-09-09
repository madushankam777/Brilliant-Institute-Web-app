import Icon from './Icon';

// KPI tile used on dashboard-style pages ("Attendance Rate", "Pending
// Fees", ...). `tone` colours the icon box (default/warning/success/danger).
function StatCard({ icon, label, value, sub, tone = 'default' }) {
  const iconClass = tone === 'default' ? 'stat-icon-box' : `stat-icon-box ${tone}`;
  return (
    <div className="stat-card">
      <div className="stat-card-top">
        <span className="stat-card-label">{label}</span>
        <span className={iconClass}>
          <Icon name={icon} size={18} />
        </span>
      </div>
      <div className="stat-value">{value}</div>
      {sub && <div className={`stat-sub ${tone === 'default' ? 'muted' : ''}`}>{sub}</div>}
    </div>
  );
}

export default StatCard;
