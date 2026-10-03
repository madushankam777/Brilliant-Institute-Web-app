// stat card - a number with a label and an icon, used on the dashboards
import { Link } from 'react-router-dom';
import Icon from './Icon';

// dashboard stat card - pass "to" to make it a link, small for text values
function StatCard({ icon, label, value, sub, tone = 'default', to, small = false }) {
  const iconClass = tone === 'default' ? 'stat-icon-box' : `stat-icon-box ${tone}`;
  const content = (
    <>
      <div className="stat-card-top">
        <span className="stat-card-label">{label}</span>
        <span className={iconClass}>
          <Icon name={icon} size={18} />
        </span>
      </div>
      <div className={small ? 'stat-value stat-value-sm' : 'stat-value'}>{value}</div>
      {sub && <div className={`stat-sub ${tone === 'default' ? 'muted' : tone}`}>{sub}</div>}
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
