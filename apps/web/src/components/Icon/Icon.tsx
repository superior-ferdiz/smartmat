import type { SVGProps } from 'react';

/*
 * Hand-drawn 24×24 line icons (no icon library – fewer dependencies and no licence questions).
 * Icons are decorative: the text next to them carries the meaning, so they are hidden from screen readers.
 */
const paths = {
  overview: (
    <>
      <path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z" />
    </>
  ),
  inventory: (
    <>
      <rect x="4" y="3.5" width="16" height="17" rx="2" />
      <path d="M4 10h16M4 15.5h16M10 6.75h4" />
    </>
  ),
  camera: (
    <>
      <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2.3l1.4-2h5.6l1.4 2h2.3A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z" />
      <circle cx="12" cy="13" r="3.5" />
    </>
  ),
  receipt: (
    <>
      <path d="M6 3.5h12v17l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5-2 1.5z" />
      <path d="M9 8h6M9 11.5h6M9 15h3.5" />
    </>
  ),
  scan: (
    <>
      <path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16" />
      <path d="M8 8.5v7M11 8.5v7M13.5 8.5v7M16 8.5v7" />
    </>
  ),
  recipes: (
    <>
      <path d="M4 11h16v2.5A6.5 6.5 0 0 1 13.5 20h-3A6.5 6.5 0 0 1 4 13.5z" />
      <path d="M9 7.5c0-1.2 1-1.5 1-2.75M13 7.5c0-1.2 1-1.5 1-2.75M2.5 11h19" />
    </>
  ),
  shoppingList: (
    <>
      <path d="M9 6.5h11M9 12h11M9 17.5h11" />
      <path d="m3.5 6.5 1.25 1.25L7 5.25M3.5 12l1.25 1.25L7 10.75" />
      <circle cx="5" cy="17.5" r="1.25" />
    </>
  ),
  budget: (
    <>
      <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18v3" />
      <path d="M4 7.5V17a2 2 0 0 0 2 2h14V8H6.5A2.5 2.5 0 0 1 4 7.5z" />
      <circle cx="16" cy="13.5" r="1.25" />
    </>
  ),
  mealPlan: (
    <>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M4 10h16M8.5 3v4M15.5 3v4M8 14h2M14 14h2M8 17h2" />
    </>
  ),
  household: (
    <>
      <circle cx="9" cy="8.5" r="3" />
      <path d="M3.5 19.5a5.5 5.5 0 0 1 11 0" />
      <circle cx="16.5" cy="9.5" r="2.25" />
      <path d="M15.5 14.6a4.5 4.5 0 0 1 5 4.9" />
    </>
  ),
  settings: (
    <>
      <path d="M4 7h9M17 7h3M4 12h3M11 12h9M4 17h11M19 17h1" />
      <circle cx="15" cy="7" r="2" />
      <circle cx="9" cy="12" r="2" />
      <circle cx="17" cy="17" r="2" />
    </>
  ),
  more: (
    <>
      <circle cx="6" cy="12" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="18" cy="12" r="1.5" />
    </>
  ),
  chevronRight: <path d="m9.5 6 6 6-6 6" />,
  chevronLeft: <path d="m14.5 6-6 6 6 6" />,
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5.5M12 7.75v.5" />
    </>
  ),
  success: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m8.25 12.25 2.5 2.5 5-5" />
    </>
  ),
  warning: (
    <>
      <path d="M10.3 4.6a2 2 0 0 1 3.4 0l7 12A2 2 0 0 1 19 19.5H5a2 2 0 0 1-1.7-2.9z" />
      <path d="M12 9.5v4M12 16.25v.5" />
    </>
  ),
  error: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5v5.5M12 15.75v.5" />
    </>
  ),
  close: <path d="m6.5 6.5 11 11M17.5 6.5l-11 11" />,
  plus: <path d="M12 5v14M5 12h14" />,
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="m15 15 5 5" />
    </>
  ),
  undo: (
    <>
      <path d="M9 7 4.5 11.5 9 16" />
      <path d="M4.5 11.5H14a5.5 5.5 0 0 1 0 11h-2" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  leaf: (
    <>
      <path d="M5 19c0-8 5-13 14-14-.5 9-6 14-14 14z" />
      <path d="M5 19 13 11" />
    </>
  ),
  edit: (
    <>
      <path d="M4.5 19.5h4l10-10a2.83 2.83 0 0 0-4-4l-10 10v4z" />
      <path d="m13 7 4 4" />
    </>
  ),
  trash: (
    <>
      <path d="M4.5 7h15M10 4.5h4M6.5 7l1 12.5h9l1-12.5" />
      <path d="M10 11v5M14 11v5" />
    </>
  ),
} as const;

export type IconName = keyof typeof paths;

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName;
  size?: number;
}

export function Icon({ name, size = 24, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {paths[name]}
    </svg>
  );
}
