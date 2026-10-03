// HTTP layer for course routes
const asyncHandler = require('../../../../../shared/server/src/utils/asyncHandler');
const service = require('./course.service');
const holidayCalendar = require('./holidayCalendar');

// public holidays (from Google Calendar) between two dates
const listHolidays = asyncHandler(async (req, res) => {
  const holidays = await holidayCalendar.getHolidays(req.query.from, req.query.to);
  res.status(200).json({ success: true, data: { holidays } });
});

// public - About page tutor cards
const listPublicTutors = asyncHandler(async (req, res) => {
  const tutors = await service.listPublicTutors();
  res.status(200).json({ success: true, data: { tutors } });
});

// cancelled days and extra classes between two dates
const listClassEvents = asyncHandler(async (req, res) => {
  const events = await service.listClassEvents(req.user, req.query.from, req.query.to);
  res.status(200).json({ success: true, data: { events } });
});

// POST /classes/:classId/cancel-day - cancel one day of a class
const cancelClassDay = asyncHandler(async (req, res) => {
  const data = await service.cancelClassDay(req.user, Number(req.params.classId), req.body);
  res.status(201).json({ success: true, message: 'Class cancelled for that day.', data });
});

// POST /classes/:classId/extra - add a one-off class
const addExtraClass = asyncHandler(async (req, res) => {
  const data = await service.addExtraClass(req.user, Number(req.params.classId), req.body);
  res.status(201).json({ success: true, message: 'Extra class added.', data });
});

// DELETE /events/:eventId - bring back a cancelled day or remove an extra class
const deleteClassEvent = asyncHandler(async (req, res) => {
  const data = await service.deleteClassEvent(req.user, Number(req.params.eventId));
  const message = data.restored ? 'The class is back on for that day.' : 'Extra class removed.';
  res.status(200).json({ success: true, message, data });
});

// GET /classes - search and filter the active classes
const browseClasses = asyncHandler(async (req, res) => {
  const { search, subjectArea, level, dayOfWeek } = req.query;
  const classes = await service.browseClasses({ search, subjectArea, level, dayOfWeek });
  res.status(200).json({ success: true, data: { classes } });
});

// GET /classes/:classId - one class
const getClassDetails = asyncHandler(async (req, res) => {
  const classId = Number(req.params.classId);
  const classData = await service.getClassDetails(classId);
  res.status(200).json({ success: true, data: { classData } });
});

// GET /tutors - all tutors
const listTutors = asyncHandler(async (req, res) => {
  const tutors = await service.listTutors();
  res.status(200).json({ success: true, data: { tutors } });
});

// GET /tutors/:tutorId - a tutor's profile and classes
const getTutorProfile = asyncHandler(async (req, res) => {
  const tutorId = Number(req.params.tutorId);
  const data = await service.getTutorProfile(tutorId);
  res.status(200).json({ success: true, data });
});

// POST /classes - an admin creates a class
const createClass = asyncHandler(async (req, res) => {
  const { classData } = await service.createClass(req.user, req.body);
  res.status(201).json({
    success: true,
    message: 'Class published successfully.',
    data: { classData },
  });
});

// PUT /classes/:classId - edit a class, enrolled students are told what changed
const updateClass = asyncHandler(async (req, res) => {
  const classId = Number(req.params.classId);
  const { classData, notifiedCount } = await service.updateClass(req.user, classId, req.body);
  res.status(200).json({
    success: true,
    message:
      notifiedCount > 0
        ? `Class updated - ${notifiedCount} enrolled student(s) notified of the change.`
        : 'Class updated successfully.',
    data: { classData, notifiedCount },
  });
});

// GET /timetable/me - my weekly timetable
const getMyTimetable = asyncHandler(async (req, res) => {
  const timetable = await service.getTimetable(req.user);
  res.status(200).json({ success: true, data: timetable });
});

// GET /timetable/:userId - anyone's timetable (admin)
const getUserTimetable = asyncHandler(async (req, res) => {
  const timetable = await service.getTimetable(req.user, Number(req.params.userId));
  res.status(200).json({ success: true, data: timetable });
});

// DELETE /classes/:classId - cancel a class and tell the students
const cancelClass = asyncHandler(async (req, res) => {
  const classId = Number(req.params.classId);
  const { notifiedCount } = await service.cancelClass(req.user, classId);
  res.status(200).json({
    success: true,
    message:
      notifiedCount > 0
        ? `Class cancelled - ${notifiedCount} enrolled student(s) notified.`
        : 'Class cancelled successfully.',
    data: { notifiedCount },
  });
});

// GET /my-classes - the classes I teach (all of them for an admin)
const listMyTaughtClasses = asyncHandler(async (req, res) => {
  const classes = await service.listMyTaughtClasses(req.user);
  res.status(200).json({ success: true, data: { classes } });
});

// POST /classes/:classId/enroll - enrol the student
const enrollInClass = asyncHandler(async (req, res) => {
  const classId = Number(req.params.classId);
  const enrollment = await service.enrollInClass(req.user, classId);
  res.status(201).json({
    success: true,
    message: 'Enrolled successfully. Head to Fees & Payments to pay your first invoice.',
    data: { enrollment },
  });
});

// DELETE /my-courses/:enrollmentId - leave a class
const dropClass = asyncHandler(async (req, res) => {
  const enrollmentId = Number(req.params.enrollmentId);
  await service.dropClass(req.user, enrollmentId);
  res.status(200).json({ success: true, message: 'You have dropped this class.' });
});

// DELETE /my-courses/:enrollmentId/permanent - hide a dropped class from my history
const deleteEnrollmentRecord = asyncHandler(async (req, res) => {
  const enrollmentId = Number(req.params.enrollmentId);
  const { confirmText } = req.body;
  await service.deleteEnrollmentRecord(req.user, enrollmentId, confirmText);
  res.status(200).json({ success: true, message: 'Removed from your course history.' });
});

// GET /my-courses - my classes with balance and status
const listMyCourses = asyncHandler(async (req, res) => {
  const courses = await service.listMyCourses(req.user);
  res.status(200).json({ success: true, data: { courses } });
});

module.exports = {
  listPublicTutors,
  listHolidays,
  listClassEvents,
  cancelClassDay,
  addExtraClass,
  deleteClassEvent,
  getMyTimetable,
  getUserTimetable,
  browseClasses,
  listTutors,
  getTutorProfile,
  getClassDetails,
  createClass,
  updateClass,
  cancelClass,
  listMyTaughtClasses,
  enrollInClass,
  dropClass,
  deleteEnrollmentRecord,
  listMyCourses,
};
