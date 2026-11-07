export interface Holiday { name: string; days: string[]; }

export const HOLIDAYS_2027: Holiday[] = [
  { name: "元旦", days: ["2027-01-01", "2027-01-02", "2027-01-03"] },
  { name: "春节", days: ["2027-02-05", "2027-02-06", "2027-02-07", "2027-02-08", "2027-02-09", "2027-02-10", "2027-02-11", "2027-02-12", "2027-02-13"] },
  { name: "清明节", days: ["2027-04-03", "2027-04-04", "2027-04-05"] },
  { name: "劳动节", days: ["2027-05-01", "2027-05-02", "2027-05-03", "2027-05-04", "2027-05-05"] },
  { name: "端午节", days: ["2027-06-09"] },
  { name: "中秋节", days: ["2027-09-15"] },
  { name: "国庆节", days: ["2027-10-01", "2027-10-02", "2027-10-03", "2027-10-04", "2027-10-05", "2027-10-06", "2027-10-07"] },
];

export function holidayFor(date: string, holidays: Holiday[] = HOLIDAYS_2027): Holiday | null {
  return holidays.find((holiday) => holiday.days.includes(date)) ?? null;
}
