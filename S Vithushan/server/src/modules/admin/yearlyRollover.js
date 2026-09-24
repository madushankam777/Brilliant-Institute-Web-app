// The 1 January roll-over.
//
// Students who confirmed their place with a re-registration key move up a
// grade. Students who did not are closed out: status LEFT, which blocks login
// and hides them from rosters, while keeping their payment and attendance
// history for the institute's records. A/L students have finished, so they are
// closed out as graduated rather than as leavers.
const { nextGrade, isFinalGrade } = require('../../../../../shared/server/src/config/grades');
const { recordAuditEvent } = require('../../../../../shared/server/src/utils/auditLogger');
const ApiError = require('../../../../../shared/server/src/utils/ApiError');
const repository = require('./admin.repository');

const DAY_MS = 24 * 60 * 60 * 1000;

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

// Idempotent per year: the log row is the guard, so a restart on 1 January
// cannot run it twice.
async function runYearlyRollover({ academicYear, actorId = null, force = false }) {
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

// The automatic run only fires in the first week of January, and only if
// re-registration was actually opened for that year. Without that guard, a
// server first started in January would close every account on the system
// because nobody had been given a key yet.
async function runIfDue() {
  const now = new Date();
  if (now.getMonth() !== 0 || now.getDate() > 7) return null;

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

// Checked once at boot and once a day after that, so the server does not have
// to be running at the exact moment midnight passes on 31 December.
function startRolloverScheduler() {
  const check = () => {
    runIfDue().catch((error) => console.error('[rollover] check failed:', error.message));
  };

  setTimeout(check, 30 * 1000).unref();
  const timer = setInterval(check, DAY_MS);
  timer.unref();
  return timer;
}

module.exports = { previewRollover, runYearlyRollover, runIfDue, startRolloverScheduler };
