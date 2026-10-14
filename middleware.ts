import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const url = request.nextUrl;
  // Next does not serve a folder index, and it strips a trailing slash.
  // The page's <base href> keeps texture URLs inside /vagia-house/assets.
  if (url.pathname === "/vagia-house" || url.pathname === "/vagia-house/") {
    const dest = url.clone();
    dest.pathname = "/vagia-house/index.html";
    return NextResponse.rewrite(dest);
  }

  if (url.searchParams.get("ss") !== "1") return NextResponse.next();
  if (url.pathname.startsWith("/newsletter")) return NextResponse.next();
  if (url.pathname.startsWith("/linkedin-audit")) return NextResponse.next();
  if (url.pathname.startsWith("/vagia-house")) return NextResponse.next();
  if (url.pathname.startsWith("/internal/substack")) return NextResponse.next();
  if (url.pathname.startsWith("/api/") && !url.pathname.startsWith("/api/v1")) return NextResponse.next();

  const dest = url.clone();
  dest.pathname = url.pathname === "/" ? "/internal/substack" : `/internal/substack${url.pathname}`;
  return NextResponse.rewrite(dest);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
