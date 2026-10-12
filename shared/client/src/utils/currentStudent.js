// the logged-in student's grade - the side menu uses it to hide what does not apply (Re-register for A/L)
import { GRADES } from '../constants/grades';

let currentGrade = null;

// set by the login state whenever the user changes
export function setCurrentGrade(grade) {
  currentGrade = grade || null;
}

// A/L is the last grade - there is no next grade to re-register for
export function isInFinalGrade() {
  return currentGrade === GRADES[GRADES.length - 1];
}
