// course API calls - browse and manage classes, enrol, timetables and class changes
import httpClient from '../../../shared/client/src/api/httpClient';

// search page - active classes matching the filters
export async function browseClasses(filters = {}) {
  const params = {};
  if (filters.search) params.search = filters.search;
  if (filters.subjectArea) params.subjectArea = filters.subjectArea;
  if (filters.level) params.level = filters.level;
  if (filters.dayOfWeek) params.dayOfWeek = filters.dayOfWeek;
  const response = await httpClient.get('/courses/classes', { params });
  return response.data.data.classes;
}

// one class with its tutor and spots left
export async function fetchClassDetails(classId) {
  const response = await httpClient.get(`/courses/classes/${classId}`);
  return response.data.data.classData;
}

// a tutor's profile and the classes they teach
export async function fetchTutorProfile(tutorId) {
  const response = await httpClient.get(`/courses/tutors/${tutorId}`);
  return response.data.data;
}

// all tutors
export async function fetchAllTutors() {
  const response = await httpClient.get('/courses/tutors');
  return response.data.data.tutors;
}

// admin - create a class
export async function createClass(payload) {
  const response = await httpClient.post('/courses/classes', payload);
  return response.data.data;
}

// save class btn - edit a class
export async function updateClass(classId, payload) {
  const response = await httpClient.put(`/courses/classes/${classId}`, payload);
  return response.data.data;
}

// cancel class btn - cancel a whole class
export async function cancelClass(classId) {
  await httpClient.delete(`/courses/classes/${classId}`);
}

// the classes I teach (all classes for an admin)
export async function fetchMyTaughtClasses() {
  const response = await httpClient.get('/courses/my-classes');
  return response.data.data.classes;
}

// enrol btn - join a class
export async function enrollInClass(classId) {
  const response = await httpClient.post(`/courses/classes/${classId}/enroll`);
  return response.data.data.enrollment;
}

// my courses - the classes I am enrolled in
export async function fetchMyCourses() {
  const response = await httpClient.get('/courses/my-courses');
  return response.data.data.courses;
}

// drop btn - leave a class
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

// delete btn - hide a dropped class from my history (the server needs DELETE typed)
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

// cancel btn - cancel one day of a class
export async function cancelClassDay(classId, payload) {
  const response = await httpClient.post(`/courses/classes/${classId}/cancel-day`, payload);
  return response.data;
}

// extra class btn - add a one-off class
export async function addExtraClass(classId, payload) {
  const response = await httpClient.post(`/courses/classes/${classId}/extra`, payload);
  return response.data;
}

// restores a cancelled day or removes an extra class
export async function deleteClassEvent(eventId) {
  const response = await httpClient.delete(`/courses/events/${eventId}`);
  return response.data;
}
