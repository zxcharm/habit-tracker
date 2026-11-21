import type { ReactNode } from 'react';

const paths = {
  logo: <><path d="M4 19h3a4 4 0 0 0 4-4v-3a4 4 0 0 1 4-4h5m-4-4 4 4-4 4"/><circle cx="4" cy="19" r="1"/></>,
  grid: <><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18m-13 5h2m4 0h2"/></>,
  chart: <><path d="M3 3v18h18M8 16v-4m5 4V8m5 8V5"/></>,
  user: <><circle cx="12" cy="8" r="3.5"/><path d="M4 21v-2a5 5 0 0 1 5-5h6a5 5 0 0 1 5 5v2"/></>,
  plus: <path d="M12 5v14M5 12h14"/>,
  spark: <><path d="M12 2l2.2 7.8L22 12l-7.8 2.2L12 22l-2.2-7.8L2 12l7.8-2.2Z"/></>,
  check: <path d="m5 12 4 4 10-10"/>,
  book: <><path d="M12 6c-2-2-5-2.5-9-2v15c4-.5 7 0 9 2 2-2 5-2.5 9-2V4c-4-.5-7 0-9 2v15"/><path d="M6 9h3m6 0h3"/></>,
  leaf: <><path d="M20 4c1 9-2 15-9 15a6 6 0 0 1-6-6C5 7 11 4 20 4Z"/><path d="M3 21 15 9"/></>,
  bolt: <path d="m13 2-9 12h7l-1 8 10-12h-7l1-8Z"/>,
  moon: <path d="M21 13.3A9 9 0 0 1 10.7 3 9 9 0 1 0 21 13.3Z"/>,
  fire: <path d="M12 22c-4 0-7-2.8-7-6.3 0-2.8 1.7-4.8 3.1-6.3.1 2 1 2.7 1.6 3.1.3-4.7 3.1-6.3 3.8-10.5 1.1 2.1 4.2 5.3 5.1 9.1 1.7 6.4-1.7 10.9-6.6 10.9Z"/>,
  edit: <path d="m14 6 4 4M4 20l4.5-1 11-11a2.8 2.8 0 1 0-4-4l-11 11L4 20Z"/>,
  close: <path d="m6 6 12 12M6 18 18 6"/>,
  left: <path d="m15 5-7 7 7 7"/>,
  right: <path d="m9 5 7 7-7 7"/>,
  arrow: <path d="M5 12h14m-5-5 5 5-5 5"/>,
  logout: <><path d="M10 4H5v16h5m4-13 5 5-5 5m-5-5h10"/></>,
  trash: <><path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 4v5m4-5v5"/></>,
  target: <><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/></>,
  tag: <><path d="M3 4h7l10 10-6 6L3 9V4Z"/><circle cx="7.5" cy="7.5" r="1"/></>,
  refresh: <><path d="M20 7v5h-5M4 17v-5h5"/><path d="M6.3 7a7 7 0 0 1 11.5-.6L20 9M4 15l2.2 2.6A7 7 0 0 0 17.7 17"/></>,
  menu: <path d="M4 6h16M4 12h16M4 18h16"/>,
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof paths;

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
