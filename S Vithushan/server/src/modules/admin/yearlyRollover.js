// The 1 January roll-over
const { nextGrade, isFinalGrade } = require('../../../../../shared/server/src/config/grades');
const { recordAuditEvent } = require('../../../../../shared/server/src/utils/auditLogger');
const ApiError = require('../../../../../shared/server/src/utils/ApiError');
const repository = require('./admin.repository');
const schema = require('../../../../../shared/server/src/utils/schemaFeatures');

// milliseconds in one day
const DAY_MS = 24 * 60 * 60 * 1000;

// sort students into promote (re-registered), graduate (last grade) and remove (did not re-register)
function classify(students, academicYear) {
  const promote = [];
  const graduate = [];
  const remove = [];

  students.forEach((student) => {
    if (isFinalGrade(student.grade)) {
      // Nothing above A/L - they have finished either way.
      graduate.push(student);
      return;
    }
    if (student.hasReregistered) {
      const moveTo = nextGrade(student.grade);
      // No grade recorded at all: leave them where they are rather than guess.
      if (moveTo) promote.push({ ...student, moveTo });
      return;
    }
    remove.push(student);
  });

  return { promote, graduate, remove, academicYear };
}

// What the roll-over would do, without touching anything.
async function previewRollover(academicYear) {
  if (!(await schema.hasReregistration())) throw schema.migrationRequired();
  const year = Number(academicYear);
  const students = await repository.listStudentsForRollover(year);
  const { promote, graduate, remove } = classify(students, year);
  const alreadyRun = await repository.findRolloverLog(year);

  return {
    academicYear: year,
    alreadyRun: Boolean(alreadyRun),
    ranAt: alreadyRun ? alreadyRun.ran_at : null,
    promoteCount: promote.length,
    graduateCount: graduate.length,
    removeCount: remove.length,
    promote: promote.map((s) => ({ id: s.id, name: s.full_name, from: s.grade, to: s.moveTo })),
    graduate: graduate.map((s) => ({ id: s.id, name: s.full_name, grade: s.grade })),
    remove: remove.map((s) => ({ id: s.id, name: s.full_name, grade: s.grade })),
  };
}

// runs once per year (the log row is the guard)
async function runYearlyRollover({ academicYear, actorId = null, force = false }) {
  if (!(await schema.hasReregistration())) throw schema.migrationRequired();
  const year = Number(academicYear);
  if (!Number.isInteger(year)) {
    throw ApiError.badRequest('Please choose a valid year.');
  }

  const existing = await repository.findRolloverLog(year);
  if (existing && !force) {
    return {
      skipped: true,
      reason: 'ALREADY_RUN',
      academicYear: year,
      ranAt: existing.ran_at,
      promotedCount: existing.promoted_count,
      removedCount: existing.removed_count,
      graduatedCount: existing.graduated_count,
    };
  }

  const students = await repository.listStudentsForRollover(year);
  const { promote, graduate, remove } = classify(students, year);

  for (const student of promote) {
    await repository.setStudentGrade(student.id, student.moveTo, year);
    await repository.logNotification({
      recipientId: student.id,
      channel: 'IN_APP',
      type: 'REREGISTRATION',
      message: `Happy new year. You are now in ${student.moveTo} for ${year}.`,
      sentBy: actorId,
    });
  }

  for (const student of graduate) {
    await repository.markStudentLeft(student.id);
    await repository.closeEnrollmentsForStudent(student.id);
    await repository.logNotification({
      recipientId: student.id,
      channel: 'IN_APP',
      type: 'ACCOUNT_CLOSED',
      message:
        `You have completed ${student.grade} at Brilliant Institute. Your account is now closed - ` +
        'contact the office if you are continuing with us.',
      sentBy: actorId,
    });
  }

  for (const student of remove) {
    await repository.markStudentLeft(student.id);
    await repository.closeEnrollmentsForStudent(student.id);
    await repository.logNotification({
      recipientId: student.id,
      channel: 'IN_APP',
      type: 'ACCOUNT_CLOSED',
      message:
        `Your place for ${year} was not re-registered, so your account has been closed. ` +
        'Contact the office if this is a mistake.',
      sentBy: actorId,
    });
  }

  await repository.recordRolloverLog({
    academicYear: year,
    promotedCount: promote.length,
    removedCount: remove.length,
    graduatedCount: graduate.length,
  });

  await recordAuditEvent({
    actorId,
    action: 'YEARLY_ROLLOVER_RUN',
    entityType: 'yearly_rollover_log',
    entityId: null,
    details: {
      academicYear: year,
      promoted: promote.length,
      removed: remove.length,
      graduated: graduate.length,
      automatic: actorId === null,
    },
  });

  return {
    skipped: false,
    academicYear: year,
    promotedCount: promote.length,
    removedCount: remove.length,
    graduatedCount: graduate.length,
  };
}

// auto run - first week of January, only if re-registration was opened
async function runIfDue() {
  const now = new Date();
  if (now.getMonth() !== 0 || now.getDate() > 7) return null;
  if (!(await schema.hasReregistration())) return null;

  const year = now.getFullYear();
  if (await repository.findRolloverLog(year)) return null;

  const keys = await repository.listReregistrationKeys(year);
  if (keys.length === 0) {
    console.warn(
      `[rollover] ${year} is due but no re-registration keys were ever issued for it - ` +
        'skipping the automatic run so no account is closed by mistake. ' +
        'An admin can run it by hand from the Re-registration page.'
    );
    return null;
  }

  const result = await runYearlyRollover({ academicYear: year, actorId: null });
  console.log(
    `[rollover] ${year}: promoted ${result.promotedCount}, graduated ${result.graduatedCount}, ` +
      `closed ${result.removedCount}`
  );
  return result;
}

// check at start-up and once a day
function startRolloverScheduler() {
  // run the roll-over if it is due, and log a failure instead of crashing
  const check = () => {
    runIfDue().catch((error) => console.error('[rollover] check failed:', error.message));
  };

  // first check 30 seconds after start, then once a day
  setTimeout(check, 30 * 1000).unref();
  const timer = setInterval(check, DAY_MS);
  timer.unref();
  return timer;
}

module.exports = { previewRollover, runYearlyRollover, runIfDue, startRolloverScheduler };
