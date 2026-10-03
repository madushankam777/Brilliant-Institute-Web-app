import { Link } from 'react-router-dom';
import Icon from './Icon';

// report btn - opens the Reports page and runs this report straight away
function ReportLink({ type, params = {}, label = 'Report', className = 'btn btn-secondary' }) {
  const query = new URLSearchParams({ type });
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') query.set(key, value);
  });
  query.set('run', '1');
  return (
    <Link to={`/admin/reports?${query.toString()}`} className={className}>
      <Icon name="barChart" size={16} /> {label}
    </Link>
  );
}

export default ReportLink;
