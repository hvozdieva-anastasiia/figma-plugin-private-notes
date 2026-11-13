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
export const GoToIcon = () => (
  <Icon>
    <path d="M3 8h9M8.5 4.5L12 8l-3.5 3.5" />
  </Icon>
);
export const SearchIcon = () => (
  <Icon>
    <circle cx="7" cy="7" r="4" />
    <path d="M10 10l3 3" />
  </Icon>
);
export const DoneIcon = () => (
  <Icon>
    <circle cx="8" cy="8" r="5.5" />
    <path d="M5.8 8.2l1.6 1.6 2.9-3.4" />
  </Icon>
);
export const ReopenIcon = () => (
  <Icon>
    <path d="M3.5 6.5h6a3 3 0 0 1 0 6H6M6 4L3.5 6.5 6 9" />
  </Icon>
);
export const MoveIcon = () => (
  <Icon>
    <path d="M2.5 12V4a.5.5 0 0 1 .5-.5h3.2l1.5 1.5H13a.5.5 0 0 1 .5.5v6.5a.5.5 0 0 1-.5.5H3a.5.5 0 0 1-.5-.5z" />
    <path d="M6 9h4M8.5 7.5L10 9l-1.5 1.5" />
  </Icon>
);
export const CopyIcon = () => (
  <Icon>
    <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
    <path d="M10.5 5.5V4A1.5 1.5 0 0 0 9 2.5H4A1.5 1.5 0 0 0 2.5 4v5A1.5 1.5 0 0 0 4 10.5h1.5" />
  </Icon>
);
