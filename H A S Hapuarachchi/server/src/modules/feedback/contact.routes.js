// /api/contact - the public Contact Us form and the Admin inbox for it
const express = require('express');
const { body, param, query } = require('express-validator');
const { contactLimiter } = require('../../../../../shared/server/src/middleware/rateLimiters');
const authenticate = require('../../../../../shared/server/src/middleware/authenticate');
const authorize = require('../../../../../shared/server/src/middleware/authorize');
const validateRequest = require('../../../../../shared/server/src/middleware/validateRequest');
const asyncHandler = require('../../../../../shared/server/src/utils/asyncHandler');
const { ROLES } = require('../../../../../shared/server/src/config/roles');
const service = require('./contact.service');

const TOPICS = ['ADMISSIONS', 'CLASSES', 'FEES', 'TECHNICAL', 'OTHER'];
const STATUSES = ['NEW', 'HANDLED'];

const sendRules = [
  body('fullName').trim().isLength({ min: 2, max: 120 }).withMessage('Please enter your name.'),
  body('email').trim().isEmail().isLength({ max: 190 }).withMessage('Please enter a valid email address.'),
  body('phone')
    .optional({ checkFalsy: true })
    .trim()
    .matches(/^[0-9+\-\s()]{7,20}$/)
    .withMessage('Please enter a valid phone number.'),
  body('topic').isIn(TOPICS).withMessage('Please choose what your message is about.'),
  body('message').trim().isLength({ min: 10, max: 2000 }).withMessage('Please write at least 10 characters (up to 2000).'),
  // hidden field that only bots fill in
  body('website').optional().isEmpty().withMessage('Message could not be sent.'),
];

const router = express.Router();

router.post(
  '/',
  contactLimiter,
  sendRules,
  validateRequest,
  asyncHandler(async (req, res) => {
    const { fullName, email, phone, topic, message } = req.body;
    await service.sendMessage({ fullName, email, phone, topic, message });
    res.status(201).json({
      success: true,
      message: 'Thank you - your message has been sent. Our office will reply by email or phone soon.',
    });
  })
);

router.get(
  '/',
  authenticate,
  authorize(ROLES.ADMIN),
  query('status').optional({ checkFalsy: true }).isIn(STATUSES),
  validateRequest,
  asyncHandler(async (req, res) => {
    const data = await service.listMessages(req.query.status || null);
    res.status(200).json({ success: true, data });
  })
);

router.patch(
  '/:messageId/status',
  authenticate,
  authorize(ROLES.ADMIN),
  param('messageId').isInt({ min: 1 }),
  body('status').isIn(STATUSES).withMessage('Invalid status.'),
  validateRequest,
  asyncHandler(async (req, res) => {
    await service.setMessageStatus(req.user, Number(req.params.messageId), req.body.status);
    res.status(200).json({ success: true, message: 'Message updated.' });
  })
);

module.exports = router;
