export type TableStatus = "libre" | "occupee" | "reservee";

export type Table = {
  id: string;
  number: number;
  seats: number;
  status: TableStatus;
  /** Total of the ongoing order, in DA */
  orderTotal?: number;
  /** Time the table was occupied (ISO string) */
  occupiedSince?: string;
};

export const tables: Table[] = [
  { id: "t1",  number: 1,  seats: 2, status: "libre" },
  { id: "t2",  number: 2,  seats: 4, status: "occupee",  orderTotal: 2450, occupiedSince: new Date(Date.now() - 35 * 60000).toISOString() },
  { id: "t3",  number: 3,  seats: 4, status: "occupee",  orderTotal: 1800, occupiedSince: new Date(Date.now() - 12 * 60000).toISOString() },
  { id: "t4",  number: 4,  seats: 2, status: "libre" },
  { id: "t5",  number: 5,  seats: 6, status: "reservee" },
  { id: "t6",  number: 6,  seats: 6, status: "libre" },
  { id: "t7",  number: 7,  seats: 4, status: "occupee",  orderTotal: 3200, occupiedSince: new Date(Date.now() - 58 * 60000).toISOString() },
  { id: "t8",  number: 8,  seats: 2, status: "libre" },
  { id: "t9",  number: 9,  seats: 8, status: "reservee" },
  { id: "t10", number: 10, seats: 4, status: "libre" },
  { id: "t11", number: 11, seats: 4, status: "occupee",  orderTotal: 950,  occupiedSince: new Date(Date.now() - 8 * 60000).toISOString() },
  { id: "t12", number: 12, seats: 6, status: "libre" },
];

export function formatElapsed(since: string): string {
  const diffMs = Date.now() - new Date(since).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h${m.toString().padStart(2, "0")}` : `${h}h`;
}
