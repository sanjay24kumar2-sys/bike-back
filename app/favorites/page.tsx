"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardBody, Input, Button, Chip } from "@heroui/react";
import { onValue, ref, set } from "firebase/database";
import { FiSearch, FiHeart } from "react-icons/fi";
import Sidebar from "@/components/Sidebar";
import { db } from "@/lib/firbase";

type SimplifiedDevice = {
  deviceId: string;
  brand: string;
  model: string;
  androidVersion: string;
  joinedAt: string;
  isFavorite: boolean;
  isOnline: boolean;
};

function formatDate(timestamp: unknown): string {
  try {
    let date: Date;
    if (typeof timestamp === "number") {
      date = new Date(timestamp);
    } else if (typeof timestamp === "string") {
      date = new Date(timestamp);
    } else {
      return "Unknown";
    }

    if (Number.isNaN(date.getTime())) {
      return "Unknown";
    }

    return date.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "Unknown";
  }
}

export default function FavoritesPage() {
  const [favorites, setFavorites] = useState<SimplifiedDevice[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const registeredDevicesRef = ref(db, "registeredDevices");

    const unsubscribe = onValue(
      registeredDevicesRef,
      (snapshot) => {
        const rawData = snapshot.val() as Record<string, any> | null;

        if (!rawData || typeof rawData !== "object") {
          setFavorites([]);
          setIsLoading(false);
          return;
        }

        const favoritesList: SimplifiedDevice[] = [];

        for (const [deviceId, deviceData] of Object.entries(rawData)) {
          if (!deviceData || typeof deviceData !== "object") {
            continue;
          }

          if (!Boolean(deviceData.isfavorite)) {
            continue;
          }

          const brand = deviceData.brand || "Unknown";
          const model = deviceData.model || "Unknown";
          const androidVersion = String(deviceData.androidVersion || "Unknown");
          const joinedAt = deviceData.joinedAt || new Date().toISOString();
          const isOnline =
            deviceData.checkOnline?.available === "Device is online";

          favoritesList.push({
            deviceId,
            brand,
            model,
            androidVersion,
            joinedAt,
            isFavorite: true,
            isOnline,
          });
        }

        setFavorites(favoritesList);
        setIsLoading(false);
      },
      () => {
        setFavorites([]);
        setIsLoading(false);
      },
    );

    return () => {
      unsubscribe();
    };
  }, []);

  const filteredFavorites = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    if (!query) {
      return favorites;
    }

    return favorites.filter(
      (device) =>
        device.deviceId.toLowerCase().includes(query) ||
        device.brand.toLowerCase().includes(query) ||
        device.model.toLowerCase().includes(query),
    );
  }, [favorites, searchQuery]);

  const toggleFavorite = async (deviceId: string) => {
    try {
      await set(ref(db, `registeredDevices/${deviceId}/isfavorite`), false);
    } catch (error) {
      console.error("Error updating favorite status:", error);
    }
  };

  const handleDeviceClick = (deviceId: string) => {
    const encoded = encodeURIComponent(deviceId);
    window.open(`/devices/${encoded}`, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="page-shell">
      <div className="page-frame">
        <Sidebar />

        <main className="page-main">
          <div className="mx-auto max-w-4xl">
            {/* Header Card */}
            <Card className="surface-card shadow-sm mb-3 sm:mb-6 border border-[var(--border)]">
              <CardBody className="p-3 sm:p-4 lg:p-6 gap-2 sm:gap-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <h1 className="text-xl sm:text-3xl lg:text-4xl font-bold text-[var(--text-main)] mb-0.5">
                      ♥ Favorites
                    </h1>
                    <p className="text-xs sm:text-sm text-[var(--text-muted)] line-clamp-1">
                      Your marked favorite devices
                    </p>
                  </div>
                  <div className="flex items-center gap-1 sm:gap-2 shrink-0">
                    <div className="text-center">
                      <p className="text-xs sm:text-sm text-[var(--text-muted)]">
                        Total
                      </p>
                      <p className="text-lg sm:text-2xl font-bold text-[var(--text-main)]">
                        {filteredFavorites.length}
                      </p>
                    </div>
                    <Button
                      isIconOnly
                      size="sm"
                      variant="solid"
                      className="bg-[var(--accent)] text-white min-w-8 h-8 sm:min-w-9 sm:h-9"
                      onPress={() => window.location.reload()}
                      title="Refresh"
                    >
                      🔄
                    </Button>
                  </div>
                </div>

                <div className="relative">
                  <FiSearch className="absolute left-2 top-1/2 transform -translate-y-1/2 text-[var(--text-muted)] text-sm" />
                  <Input
                    placeholder="Search..."
                    value={searchQuery}
                    onValueChange={setSearchQuery}
                    classNames={{
                      input:
                        "bg-white text-[var(--text-main)] placeholder:text-[var(--text-muted)] text-sm sm:text-base pl-7",
                      inputWrapper:
                        "bg-white border border-[var(--border)] shadow-sm rounded-md h-9 sm:h-10",
                    }}
                  />
                </div>

                <div className="mt-1">
                  <p className="text-xs sm:text-sm text-[var(--text-muted)]">
                    {filteredFavorites.length} favorite(s)
                  </p>
                </div>
              </CardBody>
            </Card>

            {/* Favorites List */}
            {isLoading ? (
              <Card className="surface-card border border-[var(--border)]">
                <CardBody className="p-4 sm:p-6 text-center">
                  <p className="text-[var(--text-muted)] text-sm sm:text-base">
                    Loading favorites...
                  </p>
                </CardBody>
              </Card>
            ) : filteredFavorites.length > 0 ? (
              <div className="space-y-2 sm:space-y-3">
                {filteredFavorites.map((device) => (
                  <Card
                    key={device.deviceId}
                    className="surface-card border border-[var(--border)] hover:border-[var(--accent)] transition-all shadow-sm hover:shadow-md active:shadow-sm"
                  >
                    <CardBody className="p-2 sm:p-3 gap-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <div
                          className="flex-1 min-w-0 cursor-pointer"
                          onClick={() => handleDeviceClick(device.deviceId)}
                        >
                          <div className="flex items-center gap-1.5 mb-1">
                            <h3 className="font-semibold text-[var(--text-main)] text-sm sm:text-base truncate">
                              {device.brand}
                            </h3>
                            <Chip
                              size="sm"
                              className="text-xs sm:text-sm py-0.5 px-2 h-auto"
                            >
                              {device.model}
                            </Chip>
                          </div>
                          <p className="text-xs sm:text-sm text-[var(--text-muted)] line-clamp-1 mb-1 font-mono">
                            {device.deviceId}
                          </p>
                          <div className="flex items-center gap-1 flex-wrap text-xs sm:text-sm text-[var(--text-muted)]">
                            <span>Android {device.androidVersion}</span>
                            <span>•</span>
                            <span>{formatDate(device.joinedAt)}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <Chip
                            size="sm"
                            className={`text-xs sm:text-sm py-0.5 px-2 h-auto ${
                              device.isOnline
                                ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                                : "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                            }`}
                          >
                            {device.isOnline ? "Online" : "Offline"}
                          </Chip>
                          <Button
                            isIconOnly
                            variant="light"
                            size="sm"
                            className="text-red-500 min-w-7 h-7 sm:min-w-8 sm:h-8"
                            onPress={() => toggleFavorite(device.deviceId)}
                            title="Remove from favorites"
                          >
                            <FiHeart size={16} fill="currentColor" />
                          </Button>
                        </div>
                      </div>
                    </CardBody>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="surface-card border border-[var(--border)]">
                <CardBody className="p-4 sm:p-6 text-center">
                  <p className="text-[var(--text-muted)] text-sm sm:text-base mb-3">
                    No favorite devices yet
                  </p>
                  <Button
                    size="md"
                    variant="solid"
                    className="bg-[var(--accent)] text-white text-sm sm:text-base h-10 sm:h-11"
                    onPress={() =>
                      window.open("/devices", "_blank", "noopener,noreferrer")
                    }
                  >
                    Browse Devices
                  </Button>
                </CardBody>
              </Card>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
