import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function make(path: JSX.Element, filled = true) {
  return function Icon({ size = 24, ...props }: IconProps) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill={filled ? 'currentColor' : 'none'}
        stroke={filled ? 'none' : 'currentColor'}
        strokeWidth={filled ? undefined : 2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
        {...props}
      >
        {path}
      </svg>
    );
  };
}

export const HomeIcon = make(<path d="M3 10.5 12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z" />);
export const SearchIcon = make(
  <>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </>,
  false,
);
export const LibraryIcon = make(
  <>
    <path d="M4 3v18M9 3v18" />
    <path d="m14 3.5 6 17" />
  </>,
  false,
);
export const SettingsIcon = make(
  <>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </>,
  false,
);
export const PlayIcon = make(<path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z" />);
export const PauseIcon = make(
  <>
    <rect x="5.5" y="4" width="4.5" height="16" rx="1.2" />
    <rect x="14" y="4" width="4.5" height="16" rx="1.2" />
  </>,
);
export const NextIcon = make(
  <>
    <path d="M5 5.2v13.6a.8.8 0 0 0 1.2.7l10.3-6.8a.8.8 0 0 0 0-1.4L6.2 4.5a.8.8 0 0 0-1.2.7z" />
    <rect x="17" y="4.5" width="2.5" height="15" rx="1" />
  </>,
);
export const PrevIcon = make(
  <>
    <path d="M19 5.2v13.6a.8.8 0 0 1-1.2.7L7.5 12.7a.8.8 0 0 1 0-1.4l10.3-6.8a.8.8 0 0 1 1.2.7z" />
    <rect x="4.5" y="4.5" width="2.5" height="15" rx="1" />
  </>,
);
export const ShuffleIcon = make(
  <>
    <path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />
  </>,
  false,
);
export const RepeatIcon = make(
  <>
    <path d="m17 2 4 4-4 4" />
    <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
    <path d="m7 22-4-4 4-4" />
    <path d="M21 13v1a4 4 0 0 1-4 4H3" />
  </>,
  false,
);
export const QueueIcon = make(<path d="M3 6h13M3 12h13M3 18h8M18 14v7M18 21l3-2" />, false);
export const ChevronDownIcon = make(<path d="m6 9 6 6 6-6" />, false);
export const ChevronLeftIcon = make(<path d="m15 18-6-6 6-6" />, false);
export const HeartIcon = make(
  <path d="M12 21s-7.5-4.6-10-9.2C.3 8.4 2.3 4 6.3 4c2.2 0 3.7 1.2 5.7 3.3C14 5.2 15.5 4 17.7 4c4 0 6 4.4 4.3 7.8C19.5 16.4 12 21 12 21z" />,
  false,
);
export const HeartFilledIcon = make(
  <path d="M12 21s-7.5-4.6-10-9.2C.3 8.4 2.3 4 6.3 4c2.2 0 3.7 1.2 5.7 3.3C14 5.2 15.5 4 17.7 4c4 0 6 4.4 4.3 7.8C19.5 16.4 12 21 12 21z" />,
);
export const DownloadIcon = make(<path d="M12 3v12m0 0-5-5m5 5 5-5M4 21h16" />, false);
export const CheckCircleIcon = make(
  <>
    <circle cx="12" cy="12" r="10" />
    <path d="m8 12 3 3 5-6" stroke="#121212" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
  </>,
);
export const MoreIcon = make(
  <>
    <circle cx="5" cy="12" r="2" />
    <circle cx="12" cy="12" r="2" />
    <circle cx="19" cy="12" r="2" />
  </>,
);
export const PlusIcon = make(<path d="M12 5v14M5 12h14" />, false);
export const TrashIcon = make(<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />, false);
export const MicIcon = make(
  <>
    <rect x="9" y="2" width="6" height="12" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0M12 18v4" />
  </>,
  false,
);
export const CloseIcon = make(<path d="M6 6l12 12M18 6 6 18" />, false);
export const MusicIcon = make(
  <>
    <path d="M9 18V5l12-2v13" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="18" cy="16" r="3" />
  </>,
  false,
);
export const UploadIcon = make(<path d="M12 21V9m0 0-5 5m5-5 5 5M4 3h16" />, false);
export const OfflineIcon = make(<path d="M2 2l20 20M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 5.2-2.8M19 13a10 10 0 0 0-2.3-1.7M2 8.8a15 15 0 0 1 4.2-2.7M22 8.8A15 15 0 0 0 10.7 5M12 20h.01" />, false);
export const UserIcon = make(
  <>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21a8 8 0 0 1 16 0" />
  </>,
  false,
);
