// Any role: browse/search/filter classes (CRS-01)
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { browseClasses } from '../../api/courseApi';
import LoadingSpinner from '../../../../../shared/client/src/components/common/LoadingSpinner';
import Alert from '../../../../../shared/client/src/components/common/Alert';
import Icon from '../../../../../shared/client/src/components/common/Icon';
import Avatar from '../../../../../shared/client/src/components/common/Avatar';
import PortalShell from '../../../../../shared/client/src/components/layout/PortalShell';
import { getNavItems } from '../../../../../shared/client/src/components/layout/navItems';
import { GRADES } from '../../../../../shared/client/src/constants/grades';
import { useAuth } from '../../context/AuthContext';

// subject areas for the filter
const SUBJECT_AREAS = ['Mathematics', 'Science', 'Physics', 'Chemistry', 'Biology', 'English', 'Other'];
// days for the filter
const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// a number as LKR money
function formatCurrency(amount) {
  return new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR' }).format(amount);
}

// browse classes - search and filter the active classes, then open one
function BrowseClassesPage() {
  const { user } = useAuth();
  const NAV_ITEMS = getNavItems(user.role);

  const [search, setSearch] = useState('');
  const [subjectArea, setSubjectArea] = useState('');
  const [level, setLevel] = useState(user.grade || '');
  const [dayOfWeek, setDayOfWeek] = useState('');
  const [classes, setClasses] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  // load the classes that match the filters
  const loadClasses = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage('');
    try {
      const data = await browseClasses({ search, subjectArea, level, dayOfWeek });
      setClasses(data);
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setIsLoading(false);
    }
  }, [search, subjectArea, level, dayOfWeek]);

  // reload when a filter changes (typing waits 250 ms)
  useEffect(() => {
    const timeoutId = setTimeout(loadClasses, 250); // debounce free-text search
    return () => clearTimeout(timeoutId);
  }, [loadClasses]);

  return (
    <PortalShell navItems={NAV_ITEMS}>
      <div className="page">
        <div className="page-header">
          <h1>Browse Available Classes</h1>
          <p className="muted">Explore high-quality tuition programs designed to build confidence and deliver performance.</p>
        </div>

        {/* filters - search, subject area, grade and day */}
        <div className="card">
          <div className="form-field has-icon" style={{ marginBottom: '16px' }}>
            <div className="input-shell">
              <span className="input-icon">
                <Icon name="search" size={16} />
              </span>
              <input
                type="search"
                placeholder="Search classes by keyword or tutor..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="flex-between" style={{ marginBottom: '16px', gap: '8px' }}>
            <button
              type="button"
              className={`badge ${subjectArea === '' ? '' : 'badge-neutral'}`}
              style={{ border: 'none', cursor: 'pointer', padding: '7px 16px' }}
              onClick={() => setSubjectArea('')}
            >
              All Subjects
            </button>
            {SUBJECT_AREAS.map((area) => (
              <button
                key={area}
                type="button"
                className={`badge ${subjectArea === area ? '' : 'badge-neutral'}`}
                style={{ border: 'none', cursor: 'pointer', padding: '7px 16px' }}
                onClick={() => setSubjectArea(area === subjectArea ? '' : area)}
              >
                {area}
              </button>
            ))}
          </div>

          <div className="inline-form">
            <div>
              <label htmlFor="level">Grade / Level</label>
              <select id="level" value={level} onChange={(e) => setLevel(e.target.value)}>
                <option value="">All Grades</option>
                {GRADES.map((grade) => (
                  <option key={grade} value={grade}>
                    {grade}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="dayOfWeek">Day of Week</label>
              <select id="dayOfWeek" value={dayOfWeek} onChange={(e) => setDayOfWeek(e.target.value)}>
                <option value="">Any Day</option>
                {DAYS_OF_WEEK.map((day) => (
                  <option key={day} value={day}>
                    {day}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {user.grade && level && level !== user.grade && (
            <p className="field-help" style={{ marginTop: '10px' }}>
              Showing {level} classes, not just your own grade ({user.grade}).
            </p>
          )}
          {user.grade && !level && (
            <p className="field-help" style={{ marginTop: '10px' }}>
              Showing classes for every grade.{' '}
              <button
                type="button"
                onClick={() => setLevel(user.grade)}
                style={{ background: 'none', border: 'none', color: 'var(--color-primary)', cursor: 'pointer', padding: 0, fontWeight: 600 }}
              >
                Show only my grade ({user.grade})
              </button>
            </p>
          )}
        </div>

        <Alert type="error" message={errorMessage} />

        {/* the results - a message while loading, else one card per class */}
        {isLoading ? (
          <LoadingSpinner label="Loading classes..." />
        ) : classes.length === 0 ? (
          <p className="muted">No classes match your filters right now. Try a different search.</p>
        ) : (
          <>
            <div className="feature-grid">
              {classes.map((classItem) => (
                <div key={classItem.id} className="card" style={{ marginBottom: 0 }}>
                  <div className="flex-between" style={{ marginBottom: '10px' }}>
                    <span className="badge badge-neutral">{classItem.subjectArea}</span>
                    <span
                      className={`badge ${classItem.spotsLeft <= 5 ? 'badge-warning' : 'badge-success'}`}
                    >
                      {classItem.spotsLeft} spots left
                    </span>
                  </div>
                  <h3 style={{ marginBottom: '4px' }}>{classItem.subject}</h3>
                  {classItem.level && <p className="muted" style={{ fontSize: '0.82rem', marginBottom: '10px' }}>{classItem.level}</p>}

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                    <Avatar name={classItem.tutorName} pictureUrl={classItem.tutorProfilePictureUrl} size={28} />
                    <span style={{ fontSize: '0.88rem' }}>{classItem.tutorName}</span>
                  </div>

                  <p className="muted" style={{ fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                    <Icon name="calendar" size={14} /> {classItem.dayOfWeek}, {classItem.startTime}
                    {' - '}
                    {classItem.endTime}
                  </p>
                  <p className="muted" style={{ fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '14px' }}>
                    <Icon name="home" size={14} /> {classItem.venue}
                  </p>

                  <div className="flex-between">
                    <div>
                      <div className="order-line-sub">Tuition Fee</div>
                      <div style={{ fontWeight: 700 }}>{formatCurrency(classItem.fee)}/month</div>
                    </div>
                    <Link to={`/courses/classes/${classItem.id}`} className="btn btn-secondary btn-sm">
                      View Details
                    </Link>
                  </div>
                </div>
              ))}
            </div>
            <p className="muted center-text" style={{ marginTop: '20px' }}>
              Showing {classes.length} class{classes.length === 1 ? '' : 'es'}
            </p>
          </>
        )}
      </div>
    </PortalShell>
  );
}

export default BrowseClassesPage;
