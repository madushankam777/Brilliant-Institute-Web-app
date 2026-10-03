// the grades a student can be in, in order
const GRADES = Object.freeze(['Grade 6', 'Grade 7', 'Grade 8', 'Grade 9', 'Grade 10', 'Grade 11', 'A/L']);

// next grade after this one (null = finished)
function nextGrade(currentGrade) {
  const index = GRADES.indexOf(currentGrade);
  if (index === -1 || index === GRADES.length - 1) return null;
  return GRADES[index + 1];
}

// true for the last grade (A/L)
function isFinalGrade(currentGrade) {
  return currentGrade === GRADES[GRADES.length - 1];
}

module.exports = { GRADES, nextGrade, isFinalGrade };
