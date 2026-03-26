"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type IconProps = {
  className?: string;
};

const DashboardIcon = ({ className }: IconProps) => (
  <svg
    className={className}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      d="M4 13h7V4H4v9Zm0 7h7v-5H4v5Zm9 0h7v-9h-7v9Zm0-11h7V4h-7v5Z"
    />
  </svg>
);

const DevicesIcon = ({ className }: IconProps) => (
  <svg
    className={className}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <rect x="7" y="2.5" width="10" height="19" rx="2" strokeWidth="1.8" />
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      d="M10 5h4M11 18h2"
    />
  </svg>
);

const FormsIcon = ({ className }: IconProps) => (
  <svg
    className={className}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      d="M9 12h6m-6 4h6m2 5H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5.586a1 1 0 0 1 .707.293l5.414 5.414a1 1 0 0 1 .293.707V19a2 2 0 0 1-2 2Z"
    />
  </svg>
);

const SettingsIcon = ({ className }: IconProps) => (
  <svg
    className={className}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      d="M10.3 2.9a1 1 0 0 1 1.4-.2l.8.6a1 1 0 0 0 1.2 0l.8-.6a1 1 0 0 1 1.4.2l1.2 1.7a1 1 0 0 0 1 .4l1-.1a1 1 0 0 1 1.1.9l.3 2a1 1 0 0 0 .7.8l.9.3a1 1 0 0 1 .7 1.2l-.5 1.9a1 1 0 0 0 .3 1l.7.6a1 1 0 0 1 .1 1.4l-1.3 1.6a1 1 0 0 0-.2 1.1l.4.9a1 1 0 0 1-.5 1.3l-1.8.9a1 1 0 0 0-.5.9v1a1 1 0 0 1-1 .9l-2-.1a1 1 0 0 0-1 .6l-.5.8a1 1 0 0 1-1.4.3l-1.7-1.1a1 1 0 0 0-1.1 0l-1.7 1.1a1 1 0 0 1-1.4-.3l-.5-.8a1 1 0 0 0-1-.6l-2 .1a1 1 0 0 1-1-.9v-1a1 1 0 0 0-.5-.9l-1.8-.9a1 1 0 0 1-.5-1.3l.4-.9a1 1 0 0 0-.2-1.1L2.7 15a1 1 0 0 1 .1-1.4l.7-.6a1 1 0 0 0 .3-1L3.3 10a1 1 0 0 1 .7-1.2l.9-.3a1 1 0 0 0 .7-.8l.3-2A1 1 0 0 1 7 4.8l1 .1a1 1 0 0 0 1-.4l1.2-1.6Z"
    />
    <circle cx="12" cy="12" r="3" strokeWidth="1.8" />
  </svg>
);

const NotificationsIcon = ({ className }: IconProps) => (
  <svg
    className={className}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
    />
  </svg>
);

;

const navigationItems = [
  { label: "Home", href: "/all", Icon: DashboardIcon },
  { label: "Settings", href: "/settings", Icon: SettingsIcon },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <>
      <div className="sticky flex flex-row items-center justify-between top-0 z-40 border-b border-(--border) bg-white px-3 py-2 lg:hidden">
        <div>
          <Link href="/all" scroll={false} className="text-lg font-bold text-(--accent-strong) hover:underline focus:outline-none">
            Anonymous
          </Link>
        </div>
        <nav className="flex gap-3 overflow-x-auto text-sm">
          {navigationItems.map(({ label, href }) => {
            const isActive =
              pathname === href || pathname.startsWith(`${href}/`);

            return (
              <Link
                key={href}
                href={href}
                className={`whitespace-nowrap rounded-sm px-2 py-1 ${
                  isActive
                    ? "bg-(--accent-soft) text-(--accent-strong)"
                    : "text-(--text-main)"
                }`}
              >
                {label}
              </Link>
            );
          })}
          <button
            onClick={async () => {
              await fetch("/api/logout", { method: "POST", credentials: "include" });
              window.location.href = "/login";
            }}
            className="whitespace-nowrap rounded-sm px-2 py-1 text-(--text-main) transition hover:bg-(--accent-soft) hover:text-(--accent-strong) "
          >
            Logout
          </button>
        </nav>
      </div>
    </>
  );
}
