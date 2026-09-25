import httpClient from '../../../shared/client/src/api/httpClient';

export async function browseClasses(filters = {}) {
  const params = {};
  if (filters.search) params.search = filters.search;
  if (filters.subjectArea) params.subjectArea = filters.subjectArea;
  if (filters.level) params.level = filters.level;
  if (filters.dayOfWeek) params.dayOfWeek = filters.dayOfWeek;
  const response = await httpClient.get('/courses/classes', { params });
  return response.data.data.classes;
}

export async function fetchClassDetails(classId) {
  const response = await httpClient.get(`/courses/classes/${classId}`);
  return response.data.data.classData;
}

export async function fetchTutorProfile(tutorId) {
  const response = await httpClient.get(`/courses/tutors/${tutorId}`);
  return response.data.data;
}

export async function fetchAllTutors() {
  const response = await httpClient.get('/courses/tutors');
  return response.data.data.tutors;
}

export async function createClass(payload) {
  const response = await httpClient.post('/courses/classes', payload);
  return response.data.data;
}

export async function updateClass(classId, payload) {
  const response = await httpClient.put(`/courses/classes/${classId}`, payload);
  return response.data.data;
}

export async function cancelClass(classId) {
  await httpClient.delete(`/courses/classes/${classId}`);
}

export async function fetchMyTaughtClasses() {
  const response = await httpClient.get('/courses/my-classes');
  return response.data.data.classes;
}

export async function enrollInClass(classId) {
  const response = await httpClient.post(`/courses/classes/${classId}/enroll`);
  return response.data.data.enrollment;
}

export async function fetchMyCourses() {
  const response = await httpClient.get('/courses/my-courses');
  return response.data.data.courses;
}

export async function dropCourse(enrollmentId) {
  await httpClient.delete(`/courses/my-courses/${enrollmentId}`);
}

// public holidays (Google Calendar) - [{ date: 'YYYY-MM-DD', name }]
export async function fetchHolidays(fromDate, toDate) {
  const response = await httpClient.get('/courses/holidays', { params: { from: fromDate, to: toDate } });
  return response.data.data.holidays;
}

// weekly timetable - { person, classes }
export async function fetchMyTimetable() {
  const response = await httpClient.get('/courses/timetable/me');
  return response.data.data;
}

// admin only - any tutor's or student's timetable
export async function fetchUserTimetable(userId) {
  const response = await httpClient.get(`/courses/timetable/${userId}`);
  return response.data.data;
}

export async function deleteEnrollmentRecord(enrollmentId) {
  await httpClient.delete(`/courses/my-courses/${enrollmentId}/permanent`, {
    data: { confirmText: 'DELETE' },
  });
}

// cancelled class days and extra classes between two dates
export async function fetchClassEvents(fromDate, toDate) {
  const response = await httpClient.get('/courses/events', { params: { from: fromDate, to: toDate } });
  return response.data.data.events;
}

export async function cancelClassDay(classId, payload) {
  const response = await httpClient.post(`/courses/classes/${classId}/cancel-day`, payload);
  return response.data;
}

export async function addExtraClass(classId, payload) {
  const response = await httpClient.post(`/courses/classes/${classId}/extra`, payload);
  return response.data;
}

// restores a cancelled day or removes an extra class
export async function deleteClassEvent(eventId) {
  const response = await httpClient.delete(`/courses/events/${eventId}`);
  return response.data;
}
