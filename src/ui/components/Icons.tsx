// Small stroke icons, one weight (1.5), drawn as SVG. Decorative: the buttons
// that use them carry their own accessible names.

import type { ReactNode } from 'react';

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      className="icon"
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export const ChevronIcon = () => (
  <Icon>
    <path d="M6 4l4 4-4 4" />
  </Icon>
);
export const PlusIcon = () => (
  <Icon>
    <path d="M8 3v10M3 8h10" />
  </Icon>
);
export const RefreshIcon = () => (
  <Icon>
    <path d="M13 8a5 5 0 1 1-1.5-3.5M13 3v3h-3" />
  </Icon>
);
export const EditIcon = () => (
  <Icon>
    <path d="M3 13l.7-3L11 2.7a1.4 1.4 0 0 1 2 2L5.7 12 3 13z" />
  </Icon>
);
export const TrashIcon = () => (
  <Icon>
    <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.5 8.5h6l.5-8.5" />
  </Icon>
);
export const CheckIcon = () => (
  <Icon>
    <path d="M3.5 8.5l3 3 6-7" />
  </Icon>
);
export const SearchIcon = () => (
  <Icon>
    <circle cx="7" cy="7" r="4" />
    <path d="M10 10l3 3" />
  </Icon>
);
