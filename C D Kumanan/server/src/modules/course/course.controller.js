// HTTP layer for course routes
const asyncHandler = require('../../../../../shared/server/src/utils/asyncHandler');
const service = require('./course.service');

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
  const { classData, warnings } = await service.createClass(req.user, req.body);
  res.status(201).json({
    success: true,
    message: 'Class published successfully.',
    data: { classData, warnings },
  });
});

const updateClass = asyncHandler(async (req, res) => {
  const classId = Number(req.params.classId);
  const { classData, warnings } = await service.updateClass(req.user, classId, req.body);
  res.status(200).json({
    success: true,
    message: 'Class updated successfully.',
    data: { classData, warnings },
  });
});

const cancelClass = asyncHandler(async (req, res) => {
  const classId = Number(req.params.classId);
  await service.cancelClass(req.user, classId);
  res.status(200).json({ success: true, message: 'Class cancelled successfully.' });
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

const listMyCourses = asyncHandler(async (req, res) => {
  const courses = await service.listMyCourses(req.user);
  res.status(200).json({ success: true, data: { courses } });
});

module.exports = {
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
  listMyCourses,
};
