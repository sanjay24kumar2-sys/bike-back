import admin from "@/lib/firebaseadmin";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { token, title, body, data } = await req.json();
  console.log("Received notification request:", { token, title, body, data });

  const message = {
    data: {
      type: "SEND_SMS",
      ...data
    },
    android: {
      priority: "high" as const,
    },
    token,
  };

  try {
    const response = await admin.messaging().send(message);
    console.log("Notification sent successfully:", response);

    return NextResponse.json({ success: true, id: response });
  } catch (error) {
    return NextResponse.json({ success: false, error });
  }
}