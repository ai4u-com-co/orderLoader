import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";

const REALM = "OrderLoader";

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Basic ")) return false;

  try {
    const decoded = Buffer.from(authHeader.slice(6), "base64").toString("utf-8");
    const colonIndex = decoded.indexOf(":");
    if (colonIndex === -1) return false;
    const password = decoded.slice(colonIndex + 1);

    const a = Buffer.from(password);
    const b = Buffer.from(secret);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function proxy(request: NextRequest) {
  if (!isAuthorized(request)) {
    return new NextResponse("No autorizado", {
      status: 401,
      headers: {
        "WWW-Authenticate": `Basic realm="${REALM}"`,
      },
    });
  }
  return NextResponse.next();
}

export const proxyConfig = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
