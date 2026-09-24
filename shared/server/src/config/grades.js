const GRADES = Object.freeze(['Grade 6', 'Grade 7', 'Grade 8', 'Grade 9', 'Grade 10', 'Grade 11', 'A/L']);

// The grade a student moves into at the start of the next academic year.
// A/L is the last one here, so an A/L student has finished: null means
// "nothing above this", and the caller treats that as graduating.
function nextGrade(currentGrade) {
  const index = GRADES.indexOf(currentGrade);
  if (index === -1 || index === GRADES.length - 1) return null;
  return GRADES[index + 1];
}

function isFinalGrade(currentGrade) {
  return currentGrade === GRADES[GRADES.length - 1];
}

module.exports = { GRADES, nextGrade, isFinalGrade };
