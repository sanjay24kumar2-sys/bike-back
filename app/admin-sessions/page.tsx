"use client";

import { useState } from "react";
import { Card, CardBody, Button, Chip } from "@heroui/react";
import Sidebar from "@/components/Sidebar";
import {
  getActiveDevicesCount,
  getTotalSessionsCount,
  getAdminSessions,
  logoutSession,
  logoutAllSessions,
} from "@/data/mockAdminSessions";

export default function AdminSessionsPage() {
  const [sessions, setSessions] = useState(getAdminSessions());
  const activeDevices = getActiveDevicesCount();
  const totalSessions = getTotalSessionsCount();

  const handleLogout = (sessionId: string) => {
    logoutSession(sessionId);
    setSessions([...getAdminSessions()]);
  };

  const handleLogoutAll = () => {
    logoutAllSessions();
    setSessions([...getAdminSessions()]);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  return (
    <div className="page-shell">
      <div className="page-frame">
        <Sidebar />

        <main className="page-main">
          <div className="mx-auto max-w-2xl">
            <Card className="surface-card shadow-lg mb-6">
              <CardBody className="p-6">
                <div className="flex items-start justify-between mb-6">
                  <div>
                    <h1 className="text-2xl font-bold text-[var(--text-main)] mb-1">
                      Admin Sessions
                    </h1>
                    <p className="text-sm text-[var(--text-muted)]">
                      Active admin sessions connected to devices
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="bordered"
                      className="border-slate-600 text-[var(--text-muted)]"
                      onPress={() => window.location.reload()}
                    >
                      Refresh
                    </Button>
                    <Button
                      size="sm"
                      className="bg-rose-500 text-[var(--text-main)] hover:bg-rose-600"
                      onPress={handleLogoutAll}
                    >
                      Logout All
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-[var(--surface-muted)] p-4 rounded-lg border border-[var(--border)]">
                    <p className="text-xs text-[var(--text-muted)] mb-1">
                      Active devices
                    </p>
                    <p className="text-3xl font-bold text-[var(--text-main)]">
                      {activeDevices}
                    </p>
                  </div>
                  <div className="bg-[var(--surface-muted)] p-4 rounded-lg border border-[var(--border)]">
                    <p className="text-xs text-[var(--text-muted)] mb-1">
                      Total sessions
                    </p>
                    <p className="text-3xl font-bold text-[var(--text-main)]">
                      {totalSessions}
                    </p>
                  </div>
                </div>
              </CardBody>
            </Card>

            { }
            <div className="space-y-4">
              {sessions.map((session) => (
                <Card
                  key={session.id}
                  className="surface-card shadow-lg"
                >
                  <CardBody className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-[var(--text-main)]">
                          {session.deviceName}
                        </h3>
                        <Chip
                          size="sm"
                          className={
                            session.status === "active"
                              ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                              : "bg-slate-500/20 text-[var(--text-muted)] border border-slate-500/30"
                          }
                        >
                          {session.status === "active" ? "Active" : "Inactive"}
                        </Chip>
                      </div>
                      <Button
                        size="sm"
                        className="bg-rose-500/20 text-rose-400 border border-rose-500/30 hover:bg-rose-500/30"
                        onPress={() => handleLogout(session.id)}
                        isDisabled={session.status === "inactive"}
                      >
                        Logout
                      </Button>
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-[var(--text-muted)]">Admin:</span>
                        <span className="text-[var(--text-main)]">
                          {session.adminName}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-[var(--text-muted)]">Last seen:</span>
                        <span className="text-[var(--text-main)]">
                          {formatDate(session.lastSeen)}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-[var(--text-muted)]">Admins:</span>
                        <span className="text-[var(--text-main)]">
                          {session.adminCount}
                        </span>
                      </div>
                    </div>
                  </CardBody>
                </Card>
              ))}

              {sessions.length === 0 && (
                <Card className="surface-card">
                  <CardBody className="p-8 text-center">
                    <p className="text-[var(--text-muted)]">No active sessions</p>
                  </CardBody>
                </Card>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
