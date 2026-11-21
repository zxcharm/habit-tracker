export type Category = { id: string; name: string };
export type Profile = { id: number; name: string; email: string | null; demo: boolean };
export type HabitInput = { name: string; category: string; weekdays: number[] };
export type Habit = HabitInput & {
  id: number; start_date: string; current_streak: number; best_streak: number;
  scheduled: boolean; can_mark: boolean; completed: boolean;
};
export type Totals = { scheduled: number; completed: number; percent: number };
export type Activity = Omit<Totals, 'percent'> & { date: string };
export type Dashboard = {
  today: string; selected: string; habits: Habit[]; activity: Activity[]; categories: Category[];
  week: Totals; selected_week: Totals; month: Totals;
};

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function api<T>(path: string, method = 'GET', data?: unknown): Promise<T> {
  const response = await fetch('/api' + path, {
    method,
    headers: data === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    const detail = typeof error.detail === 'string' ? error.detail : 'Проверь введённые данные.';
    throw new ApiError(response.status, response.status >= 500 ? 'Сервер временно недоступен.' : detail);
  }
  return (response.status === 204 ? undefined : await response.json()) as T;
}

export function dateKey(date = new Date()): string {
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map(part => String(part).padStart(2, '0')).join('-');
}

export function parseDate(key: string): Date {
  return new Date(key + 'T12:00:00');
}

export function shiftDay(key: string, distance: number): string {
  const date = parseDate(key);
  date.setDate(date.getDate() + distance);
  return dateKey(date);
}

export function shiftMonth(key: string, distance: number): string {
  const date = parseDate(key);
  date.setDate(1);
  date.setMonth(date.getMonth() + distance);
  return dateKey(date);
}

export function formatDate(key: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat('ru-RU', options).format(parseDate(key));
}

export const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
