import type { SVGProps } from "react";

/**
 * Claro's own icon set (no stock library). One style, from the marketing site:
 * 24 viewBox, 1.75 stroke, round caps and joins, currentColor. Only icons in use live here.
 */
export type IconProps = SVGProps<SVGSVGElement> & { size?: number | string };
export type Icon = (props: IconProps) => React.ReactElement;

function icon(name: string, paths: React.ReactNode): Icon {
  function Glyph({ size = 24, ...props }: IconProps) {
    return (
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
        data-icon={name}
        {...props}
      >
        {paths}
      </svg>
    );
  }
  Glyph.displayName = name;
  return Glyph;
}
const dot = (x: number, y: number) => `M${x} ${y}h.01`;

// Navigation
export const Dashboard = icon(
  "dashboard",
  <>
    <rect x="3.5" y="3.5" width="7" height="9" rx="1.5" />
    <rect x="13.5" y="3.5" width="7" height="5" rx="1.5" />
    <rect x="13.5" y="11.5" width="7" height="9" rx="1.5" />
    <rect x="3.5" y="15.5" width="7" height="5" rx="1.5" />
  </>,
);
export const Sprint = icon(
  "sprint",
  <path d="M13 2.5 4.5 13.5H11l-1 8 8.5-11H12l1-8Z" />,
);
export const Cards = icon(
  "cards",
  <>
    <rect x="3" y="7.5" width="14" height="13" rx="2" />
    <path d="M7 4.5h11a3 3 0 0 1 3 3v10" />
  </>,
);
export const History = icon(
  "history",
  <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1L3.5 8.5M3.5 3.5v5h5M12 7.5V12l3 2" />,
);
export const Users = icon(
  "users",
  <>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5M16 4.5a3.5 3.5 0 0 1 0 7M18.5 14.8c1.6.8 2.6 2.6 3 5.2" />
  </>,
);
export const User = icon(
  "user",
  <>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c1-4 4.2-6 8-6s7 2 8 6" />
  </>,
);
export const QuestionFile = icon(
  "question-file",
  <path
    d={`M14 3H6v18h13V8l-5-5Zm0 0v5h5M10 11.5a2.2 2.2 0 1 1 3 2c-.6.3-1 .8-1 1.5v.3${dot(12, 18)}`}
  />,
);
export const Pen = icon(
  "pen",
  <path d="m14 5 5 5M4 20l5-1L20 8a2.8 2.8 0 0 0-4-4L5 15l-1 5ZM14 20h6" />,
);
export const Wallet = icon(
  "wallet",
  <path
    d={`M20 8H5a2 2 0 0 1-2-2 2 2 0 0 1 2-2h12v4m3 0v12H5a2 2 0 0 1-2-2V6${dot(16, 14)}`}
  />,
);
export const SignOut = icon(
  "sign-out",
  <path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4M15 8l4 4-4 4M19 12H9" />,
);
export const PanelLeft = icon(
  "panel-left",
  <>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M9 4v16" />
  </>,
);

// Actions and controls
export const Close = icon("close", <path d="m6 6 12 12M18 6 6 18" />);
export const Check = icon("check", <path d="m5 12 4 4L19 6" />);
export const ChevronDown = icon("chevron-down", <path d="m6 9 6 6 6-6" />);
export const ChevronUp = icon("chevron-up", <path d="m6 15 6-6 6 6" />);
export const Minus = icon("minus", <path d="M5 12h14" />);
export const Plus = icon("plus", <path d="M5 12h14M12 5v14" />);
export const ArrowUp = icon("arrow-up", <path d="M12 19V5m-6 6 6-6 6 6" />);
export const ArrowDown = icon("arrow-down", <path d="M12 5v14m-6-6 6 6 6-6" />);
export const ArrowUpRight = icon(
  "arrow-up-right",
  <path d="M7 17 17 7M8 7h9v9" />,
);
export const Flag = icon("flag", <path d="M5 21V4h11l-2 4 2 4H5" />);
export const ImagePlus = icon(
  "image-plus",
  <path
    d={`M21 12v7a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h8M3 16l5-5 5 5 2-2 6 6M18 3v6M15 6h6${dot(8.5, 8)}`}
  />,
);
export const Message = icon(
  "message",
  <path d="M20 4H4a1 1 0 0 0-1 1v15l4-3h13a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1ZM8 9h8M8 12.5h5" />,
);
export const Book = icon(
  "book",
  <path d="M12 5v16M12 5C8 2 4 3 2 4v15c3-1 6-1 10 2 4-3 7-3 10-2V4c-2-1-6-2-10 1ZM5 7h3M16 7h3" />,
);
export const Calculator = icon(
  "calculator",
  <>
    <rect x="5" y="3" width="14" height="18" rx="2" />
    <path
      d={`M8.5 7h7v3h-7z${dot(8.5, 14)}${dot(12, 14)}${dot(15.5, 14)}${dot(8.5, 17.5)}${dot(12, 17.5)}${dot(15.5, 17.5)}`}
    />
  </>,
);
export const SearchOff = icon(
  "search-off",
  <>
    <circle cx="10.5" cy="10.5" r="6.5" />
    <path d="m20 20-4.8-4.8M8.5 8.5l4 4m0-4-4 4" />
  </>,
);
export const Target = icon(
  "target",
  <>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="5" />
    <path d="m12 12 9-9M17 3h4v4" />
  </>,
);

// Status
export const Alert = icon(
  "alert",
  <>
    <circle cx="12" cy="12" r="9" />
    <path d={`M12 7.5V13${dot(12, 16.5)}`} />
  </>,
);
export const CheckCircle = icon(
  "check-circle",
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="m8 12.5 2.8 2.8L16 9.5" />
  </>,
);
export const Pending = icon(
  "pending",
  <circle cx="12" cy="12" r="9" strokeDasharray="3.2 3.2" />,
);
export const Dot = icon(
  "dot",
  <>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="2.5" fill="currentColor" />
  </>,
);
export const Help = icon(
  "help",
  <>
    <circle cx="12" cy="12" r="9" />
    <path
      d={`M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.4${dot(12, 17)}`}
    />
  </>,
);
export const Clock = icon(
  "clock",
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </>,
);
export const EyeOff = icon(
  "eye-off",
  <path d="m3 3 18 18M10.6 5.1Q11.3 5 12 5c5 0 9 4.5 10 7a13 13 0 0 1-2.6 3.6M6.6 6.6A13 13 0 0 0 2 12c1 2.5 5 7 10 7a9.8 9.8 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2" />,
);
export const Spinner = icon("spinner", <path d="M12 3a9 9 0 1 0 9 9" />);
export const Shield = icon(
  "shield",
  <path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Zm-4 9 3 3 5-6" />,
);
