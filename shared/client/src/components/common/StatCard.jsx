import { Link } from 'react-router-dom';
import Icon from './Icon';

// KPI tile used on dashboard-style pages ("Attendance Rate", "Pending
// Fees", ...). `tone` colours the icon box (default/warning/success/danger).
// Pass `to` to make the whole tile a link to the page it summarises (e.g.
// "Total Users" -> Manage Users) - omit it for a plain, non-clickable tile.
function StatCard({ icon, label, value, sub, tone = 'default', to }) {
  const iconClass = tone === 'default' ? 'stat-icon-box' : `stat-icon-box ${tone}`;
  const content = (
    <>
      <div className="stat-card-top">
        <span className="stat-card-label">{label}</span>
        <span className={iconClass}>
          <Icon name={icon} size={18} />
        </span>
      </div>
      <div className="stat-value">{value}</div>
      {sub && <div className={`stat-sub ${tone === 'default' ? 'muted' : ''}`}>{sub}</div>}
    </>
  );

  if (to) {
    return (
      <Link to={to} className="stat-card stat-card-link">
        {content}
      </Link>
    );
  }

  return <div className="stat-card">{content}</div>;
}

export default StatCard;
