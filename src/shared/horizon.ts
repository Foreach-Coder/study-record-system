import { addDays, weekday } from "./dates";
import { holidayFor, HOLIDAYS_2027, type Holiday } from "./holidays";

export function computeHorizon(today: string, holidays: Holiday[] = HOLIDAYS_2027): string {
  const todayHoliday = holidayFor(today, holidays);
  const eveHoliday = holidayFor(addDays(today, 1), holidays);
  const holiday = todayHoliday ?? eveHoliday;
  if (holiday) return holiday.days[holiday.days.length - 1];

  const day = weekday(today);
  if (day === 5) return addDays(today, 3);
  if (day === 6) return addDays(today, 2);
  if (day === 0) return addDays(today, 1);
  return today;
}
