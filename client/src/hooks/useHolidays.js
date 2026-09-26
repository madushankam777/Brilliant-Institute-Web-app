import { useEffect, useState } from 'react';
import { fetchHolidays } from '../api/courseApi';
import { addDaysToKey, startOfWeek, todayKey } from '../../../shared/client/src/utils/schedule';

// public holidays between two dates as { date: name }
function useHolidays(fromDate, toDate) {
  const [holidays, setHolidays] = useState({});

  useEffect(() => {
    let isCurrent = true;
    fetchHolidays(fromDate, toDate)
      .then((list) => {
        if (!isCurrent) return;
        const byDate = {};
        list.forEach((holiday) => {
          byDate[holiday.date] = holiday.name;
        });
        setHolidays(byDate);
      })
      .catch(() => {
        if (isCurrent) setHolidays({});
      });
    return () => {
      isCurrent = false;
    };
  }, [fromDate, toDate]);

  return holidays;
}

// this week and the two after - enough for timetables and "next class"
export function useUpcomingHolidays() {
  const weekStart = startOfWeek(todayKey());
  return useHolidays(weekStart, addDaysToKey(weekStart, 20));
}

// the next year - for pickers where any future date can be chosen
export function useYearOfHolidays() {
  const today = todayKey();
  return useHolidays(today, addDaysToKey(today, 365));
}

export default useHolidays;
