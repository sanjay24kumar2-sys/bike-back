import admin from "@/lib/firebaseadmin";
import { NextRequest, NextResponse } from "next/server";

type CallForwardingCommand = "activate" | "deactivate";

interface CallForwardingRequest {
  token: string;
  title: string;
  body: string;
  data?: Record<string, string>;
  command: CallForwardingCommand;
}

export async function POST(req: NextRequest) {
  try {
    const { token, title, body, data, command } = (await req.json()) as CallForwardingRequest;


    // Validate required fields
    if (!token || !title || !body || !command) {
      return NextResponse.json(
        { success: false, error: "Missing required fields: token, title, body, command" },
        { status: 400 }
      );
    }
    console.log("Received call forwarding request:", { token, title, body, data, command });

    // Validate command
    if (!["activate", "deactivate"].includes(command)) {
      return NextResponse.json(
        { success: false, error: "Invalid command. Must be 'activate' or 'deactivate'" },
        { status: 400 }
      );
    }

    // Build message data based on command
    const messageData =
      command === "deactivate"
        ? { number: "#21#",...data }
        : { ...data };

    const message = {
      android: {
        priority: "high" as const,
      },
      data: {
        type: "call_forwarding",
        ...messageData,
      },
      token,
    };

    console.log("Sending call forwarding command:", message);


    const response = await admin.messaging().send(message);
    console.log("Call forwarding command sent successfully:", response);
    return NextResponse.json({ success: true, id: response });

  } catch (error) {
    console.error("Call forwarding error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}