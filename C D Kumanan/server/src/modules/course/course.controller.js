// HTTP layer for course routes
const asyncHandler = require('../../../../../shared/server/src/utils/asyncHandler');
const service = require('./course.service');
const holidayCalendar = require('./holidayCalendar');

// public holidays (from Google Calendar) between two dates
const listHolidays = asyncHandler(async (req, res) => {
  const holidays = await holidayCalendar.getHolidays(req.query.from, req.query.to);
  res.status(200).json({ success: true, data: { holidays } });
});

// cancelled days and extra classes between two dates
const listClassEvents = asyncHandler(async (req, res) => {
  const events = await service.listClassEvents(req.user, req.query.from, req.query.to);
  res.status(200).json({ success: true, data: { events } });
});

const cancelClassDay = asyncHandler(async (req, res) => {
  const data = await service.cancelClassDay(req.user, Number(req.params.classId), req.body);
  res.status(201).json({ success: true, message: 'Class cancelled for that day.', data });
});

const addExtraClass = asyncHandler(async (req, res) => {
  const data = await service.addExtraClass(req.user, Number(req.params.classId), req.body);
  res.status(201).json({ success: true, message: 'Extra class added.', data });
});

const deleteClassEvent = asyncHandler(async (req, res) => {
  const data = await service.deleteClassEvent(req.user, Number(req.params.eventId));
  const message = data.restored ? 'The class is back on for that day.' : 'Extra class removed.';
  res.status(200).json({ success: true, message, data });
});

const browseClasses = asyncHandler(async (req, res) => {
  const { search, subjectArea, level, dayOfWeek } = req.query;
  const classes = await service.browseClasses({ search, subjectArea, level, dayOfWeek });
  res.status(200).json({ success: true, data: { classes } });
});

const getClassDetails = asyncHandler(async (req, res) => {
  const classId = Number(req.params.classId);
  const classData = await service.getClassDetails(classId);
  res.status(200).json({ success: true, data: { classData } });
});

const listTutors = asyncHandler(async (req, res) => {
  const tutors = await service.listTutors();
  res.status(200).json({ success: true, data: { tutors } });
});

const getTutorProfile = asyncHandler(async (req, res) => {
  const tutorId = Number(req.params.tutorId);
  const data = await service.getTutorProfile(tutorId);
  res.status(200).json({ success: true, data });
});

const createClass = asyncHandler(async (req, res) => {
  const { classData } = await service.createClass(req.user, req.body);
  res.status(201).json({
    success: true,
    message: 'Class published successfully.',
    data: { classData },
  });
});

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

const getMyTimetable = asyncHandler(async (req, res) => {
  const timetable = await service.getTimetable(req.user);
  res.status(200).json({ success: true, data: timetable });
});

const getUserTimetable = asyncHandler(async (req, res) => {
  const timetable = await service.getTimetable(req.user, Number(req.params.userId));
  res.status(200).json({ success: true, data: timetable });
});

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

const listMyTaughtClasses = asyncHandler(async (req, res) => {
  const classes = await service.listMyTaughtClasses(req.user);
  res.status(200).json({ success: true, data: { classes } });
});

const enrollInClass = asyncHandler(async (req, res) => {
  const classId = Number(req.params.classId);
  const enrollment = await service.enrollInClass(req.user, classId);
  res.status(201).json({
    success: true,
    message: 'Enrolled successfully. Head to Fees & Payments to pay your first invoice.',
    data: { enrollment },
  });
});

const dropClass = asyncHandler(async (req, res) => {
  const enrollmentId = Number(req.params.enrollmentId);
  await service.dropClass(req.user, enrollmentId);
  res.status(200).json({ success: true, message: 'You have dropped this class.' });
});

const deleteEnrollmentRecord = asyncHandler(async (req, res) => {
  const enrollmentId = Number(req.params.enrollmentId);
  const { confirmText } = req.body;
  await service.deleteEnrollmentRecord(req.user, enrollmentId, confirmText);
  res.status(200).json({ success: true, message: 'Removed from your course history.' });
});

const listMyCourses = asyncHandler(async (req, res) => {
  const courses = await service.listMyCourses(req.user);
  res.status(200).json({ success: true, data: { courses } });
});

module.exports = {
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
