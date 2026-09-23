// Road safety: crashes and casualties reported to the Uganda Police Force (build time).
import roadJson from '../data/road_safety.json';

interface Src { title: string; url: string; updated: string | null }
interface Named { name: string; values: (number | null)[] }

const raw = roadJson as unknown as {
  sources: Record<'crashes' | 'casualties' | 'vehicles' | 'time' | 'road_users' | 'regions', Src>;
  years: number[];
  crashes: { fatal: number[]; serious: number[]; minor: number[]; total: number[] };
  casualties: { killed: number[]; seriously_injured: number[]; slightly_injured: number[]; total: number[] };
  severity_index: number[];
  road_users: Named[];
  vehicles: Named[];
  time_of_day: { slot: string; crashes: number }[];
  regions: { name: string; fatal: number; total: number }[];
  notes: string[];
};

export const { sources, years, crashes, casualties, road_users: roadUsers, vehicles, notes } = raw;
export const severity = raw.severity_index;
export const timeOfDay = raw.time_of_day;

const L = years.length - 1;
export const year = years[L];
export const killed = casualties.killed[L];
export const killedFirst = casualties.killed[0];
export const perDay = killed / 365;
export const minutesBetweenDeaths = (365 * 24 * 60) / killed;

/** Road users killed or injured in the latest year, largest first, with shares. */
export const usersLatest = roadUsers
  .filter((u) => u.values[L] != null)
  .map((u) => ({ name: u.name === 'Motor cyclists' ? 'Motorcyclists' : u.name, value: u.values[L]!, share: (100 * u.values[L]!) / casualties.total[L] }))
  .sort((a, b) => b.value - a.value);

export const vehiclesLatest = vehicles
  .map((v) => ({ name: v.name, value: v.values[L] ?? 0 }))
  .sort((a, b) => b.value - a.value);

/** Police regions: how deadly is a crash there? (% of crashes that were fatal) */
export const regionDeadliness = raw.regions
  .filter((r) => r.total >= 200) // tiny regions swing too much to rank fairly
  .map((r) => ({ name: r.name, fatalShare: (100 * r.fatal) / r.total, fatal: r.fatal, total: r.total }))
  .sort((a, b) => b.fatalShare - a.fatalShare);

export const peakSlot = [...timeOfDay].sort((a, b) => b.crashes - a.crashes)[0];

/** "18:00-19:59" -> "6pm–8pm" */
const fmtSlot = (s: string) => {
  const hour = (n: number) => `${n % 12 === 0 ? 12 : n % 12}${n < 12 ? 'am' : 'pm'}`;
  const [a, b] = s.split('-');
  const startH = Number(a.slice(0, 2));
  const endH = (Number(b.slice(0, 2)) + 1) % 24; // slots end at :59
  return `${hour(startH)}–${hour(endH)}`;
};
export const slotLabel = fmtSlot;

export function facts() {
  const moto = usersLatest.find((u) => u.name === 'Motorcyclists');
  const ped = usersLatest.find((u) => u.name === 'Pedestrians');
  const deadliest = regionDeadliness[0];
  const safest = regionDeadliness[regionDeadliness.length - 1];
  const motoCrashes = vehiclesLatest.find((v) => v.name === 'Motorcycles');
  return [
    `${killed.toLocaleString()} people were killed on Uganda’s roads in ${year}: about ${Math.round(perDay)} every day, or one every ${Math.round(minutesBetweenDeaths)} minutes.`,
    `Road deaths rose ${Math.round(((killed / killedFirst) - 1) * 100)}% between ${years[0]} and ${year}.`,
    ...(moto ? [`Motorcyclists were ${Math.round(moto.share)}% of everyone killed or injured on the roads in ${year} (${moto.value.toLocaleString()} people).`] : []),
    ...(ped ? [`${ped.value.toLocaleString()} pedestrians were killed or injured in ${year}.`] : []),
    ...(motoCrashes ? [`Motorcycles were involved in more crashes than any other vehicle: ${motoCrashes.value.toLocaleString()} in ${year}.`] : []),
    `Crashes peak at ${fmtSlot(peakSlot.slot)}, the evening rush.`,
    `How deadly a crash is depends on where it happens: in ${deadliest.name}, ${Math.round(deadliest.fatalShare)}% of crashes killed someone; in ${safest.name}, ${Math.round(safest.fatalShare)}%.`,
  ];
}
