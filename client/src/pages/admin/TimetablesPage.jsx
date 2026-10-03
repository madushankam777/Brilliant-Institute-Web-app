// Admin: look up the weekly timetable of any tutor or student.
import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { fetchUsers } from '../../api/adminApi';
import { fetchUserTimetable } from '../../api/courseApi';
import { useUpcomingHolidays } from '../../hooks/useHolidays';
import { useUpcomingClassEvents } from '../../hooks/useClassEvents';
import LoadingSpinner from '../../../../shared/client/src/components/common/LoadingSpinner';
import Alert from '../../../../shared/client/src/components/common/Alert';
import Avatar from '../../../../shared/client/src/components/common/Avatar';
import Icon from '../../../../shared/client/src/components/common/Icon';
import WeeklyTimetable from '../../../../shared/client/src/components/common/WeeklyTimetable';
import PortalShell from '../../../../shared/client/src/components/layout/PortalShell';
import { getNavItems } from '../../../../shared/client/src/components/layout/navItems';
import ReportLink from '../../../../shared/client/src/components/common/ReportLink';

const NAV_ITEMS = getNavItems('ADMIN');

const GROUPS = [
  { value: 'TUTOR', label: 'Tutors' },
  { value: 'STUDENT_PARENT', label: 'Students' },
];

function TimetablesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = Number(searchParams.get('user')) || null;

  const [people, setPeople] = useState({ TUTOR: [], STUDENT_PARENT: [] });
  const [group, setGroup] = useState('TUTOR');
  const [search, setSearch] = useState('');
  const [isLoadingPeople, setIsLoadingPeople] = useState(true);
  const [error, setError] = useState('');

  const [timetable, setTimetable] = useState(null);
  const [isLoadingTimetable, setIsLoadingTimetable] = useState(false);
  const timetableRef = useRef(null);
  const holidays = useUpcomingHolidays();
  const events = useUpcomingClassEvents();

  useEffect(() => {
    Promise.all([
      fetchUsers({ role: 'TUTOR', status: 'ACTIVE' }),
      fetchUsers({ role: 'STUDENT_PARENT', status: 'ACTIVE' }),
    ])
      .then(([tutors, students]) => setPeople({ TUTOR: tutors, STUDENT_PARENT: students }))
      .catch((loadError) => setError(loadError.message))
      .finally(() => setIsLoadingPeople(false));
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setTimetable(null);
      return undefined;
    }
    let isCurrent = true;
    setIsLoadingTimetable(true);
    setError('');
    fetchUserTimetable(selectedId)
      .then((data) => {
        if (!isCurrent) return;
        setTimetable(data);
        // open the matching tab when arriving from a link
        if (data.person.role === 'TUTOR' || data.person.role === 'STUDENT_PARENT') setGroup(data.person.role);
      })
      .catch((loadError) => {
        if (isCurrent) setError(loadError.message);
      })
      .finally(() => {
        if (isCurrent) setIsLoadingTimetable(false);
      });
    return () => {
      isCurrent = false;
    };
  }, [selectedId]);

  function selectPerson(personId) {
    setSearchParams({ user: String(personId) });
    // on a phone the timetable is below the list
    if (timetableRef.current && window.innerWidth < 900) {
      timetableRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  const term = search.trim().toLowerCase();
  const list = people[group].filter((person) =>
    [person.fullName, person.email, person.grade, person.studentCode]
      .filter(Boolean)
      .some((value) => value.toLowerCase().includes(term))
  );

  const person = timetable ? timetable.person : null;

  return (
    <PortalShell navItems={NAV_ITEMS}>
      <div className="page">
        <div className="flex-between page-header">
          <div>
            <h1>Timetables</h1>
            <p className="muted">See the weekly timetable of any tutor or student.</p>
          </div>
          <ReportLink type="classes" label="Timetable report" />
        </div>

        <Alert type="error" message={error} />

        <div className="split-view">
          <div className="card">
            <div className="period-tabs" role="tablist" aria-label="People" style={{ marginBottom: '12px' }}>
              {GROUPS.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  role="tab"
                  aria-selected={group === item.value}
                  className={`period-tab${group === item.value ? ' active' : ''}`}
                  onClick={() => setGroup(item.value)}
                >
                  {item.label} ({people[item.value].length})
                </button>
              ))}
            </div>

            <div className="search-input">
              <span className="input-icon">
                <Icon name="search" size={16} />
              </span>
              <input
                type="search"
                placeholder={group === 'TUTOR' ? 'Search tutors...' : 'Search by name, grade or code...'}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search people"
              />
            </div>

            {isLoadingPeople ? (
              <LoadingSpinner label="Loading..." />
            ) : list.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>No one matches your search.</p>
            ) : (
              <div className="pick-list">
                {list.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`pick-item${item.id === selectedId ? ' selected' : ''}`}
                    onClick={() => selectPerson(item.id)}
                  >
                    <Avatar name={item.fullName} pictureUrl={item.profilePictureUrl} size={30} />
                    <span className="pick-item-main">
                      <span className="pick-item-title">{item.fullName}</span>
                      <span className="pick-item-sub">
                        {group === 'TUTOR' ? item.email : [item.grade, item.studentCode].filter(Boolean).join(' · ') || item.email}
                      </span>
                    </span>
                    <Icon name="chevronRight" size={16} />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="card" ref={timetableRef} style={{ scrollMarginTop: '84px' }}>
            {!selectedId ? (
              <div className="center-text" style={{ padding: '40px 10px' }}>
                <div className="feature-icon-box" style={{ margin: '0 auto 12px' }}>
                  <Icon name="grid" size={22} />
                </div>
                <p className="muted" style={{ margin: 0 }}>Choose a tutor or student to see their week.</p>
              </div>
            ) : isLoadingTimetable || !person ? (
              <LoadingSpinner label="Loading timetable..." />
            ) : (
              <>
                <div className="flex-between" style={{ marginBottom: '14px' }}>
                  <div>
                    <h2 style={{ margin: 0 }}>{person.fullName}</h2>
                    <p className="muted" style={{ margin: 0, fontSize: '0.86rem' }}>
                      {person.role === 'TUTOR' ? 'Tutor' : `Student${person.grade ? ` · ${person.grade}` : ''}`}
                      {' · '}
                      {timetable.classes.length} class(es) a week
                    </p>
                  </div>
                  <Link to={`/admin/users/${person.id}`} className="btn btn-secondary btn-sm">
                    View profile
                  </Link>
                </div>
                <WeeklyTimetable
                  classes={timetable.classes}
                  holidays={holidays}
                  events={events}
                  showTutor={person.role !== 'TUTOR'}
                  emptyMessage={
                    person.role === 'TUTOR'
                      ? 'This tutor has no classes assigned yet.'
                      : 'This student is not enrolled in any classes yet.'
                  }
                />
              </>
            )}
          </div>
        </div>
      </div>
    </PortalShell>
  );
}

export default TimetablesPage;
