// pick one tutor from a searchable list
import { useState } from 'react';
import Avatar from './Avatar';

// tutor picker list - search by name
function TutorPicker({ tutors, value, onChange, emptyMessage = 'No tutors found.' }) {
  const [search, setSearch] = useState('');

  // tutors matching the search box
  const filtered = tutors.filter((tutor) =>
    tutor.fullName.toLowerCase().includes(search.trim().toLowerCase())
  );

  return (
    <div className="tutor-picker">
      <input
        type="text"
        placeholder="Search tutor by name..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        aria-label="Search tutors by name"
      />
      <div className="tutor-picker-list">
        {filtered.length === 0 ? (
          <p className="muted" style={{ padding: '12px', margin: 0 }}>
            {emptyMessage}
          </p>
        ) : (
          filtered.map((tutor) => (
            <button
              key={tutor.id}
              type="button"
              className={`tutor-picker-item${value === tutor.id ? ' selected' : ''}`}
              onClick={() => onChange(tutor.id)}
            >
              <Avatar name={tutor.fullName} pictureUrl={tutor.profilePictureUrl} size={28} />
              <span>
                <span className="tutor-picker-name">{tutor.fullName}</span>
                <span className="tutor-picker-email">{tutor.email}</span>
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

export default TutorPicker;
