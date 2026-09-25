import { useCallback, useEffect, useState } from 'react';
import { fetchClassEvents } from '../api/courseApi';
import { addDaysToKey, startOfWeek, todayKey } from '../../../shared/client/src/utils/schedule';

// Cancelled days and extra classes between two dates.
// Returns [events, reload]; if they can't be loaded the list is empty.
function useClassEvents(fromDate, toDate) {
  const [events, setEvents] = useState([]);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let isCurrent = true;
    fetchClassEvents(fromDate, toDate)
      .then((list) => {
        if (isCurrent) setEvents(list);
      })
      .catch(() => {
        if (isCurrent) setEvents([]);
      });
    return () => {
      isCurrent = false;
    };
  }, [fromDate, toDate, version]);

  const reload = useCallback(() => setVersion((value) => value + 1), []);
  return [events, reload];
}

// this week and the two after - same range as useUpcomingHolidays
export function useUpcomingClassEvents() {
  const weekStart = startOfWeek(todayKey());
  return useClassEvents(weekStart, addDaysToKey(weekStart, 20))[0];
}

export default useClassEvents;
