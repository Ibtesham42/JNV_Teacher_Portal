import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "./auth.config";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const user = req.auth?.user;
  const isApi = pathname.startsWith("/api/");

  if (pathname.startsWith("/api/auth")) return NextResponse.next();

  if (!user) {
    if (isApi) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
    if (pathname === "/login") return NextResponse.next();
    const url = new URL("/login", req.nextUrl.origin);
    if (pathname !== "/") url.searchParams.set("next", pathname + req.nextUrl.search);
    return NextResponse.redirect(url);
  }

  if (user.mustChangePassword && pathname !== "/change-password" && pathname !== "/api/account/password") {
    if (isApi) return NextResponse.json({ error: "Please change your password first." }, { status: 403 });
    return NextResponse.redirect(new URL("/change-password", req.nextUrl.origin));
  }

  if (pathname === "/login") {
    return NextResponse.redirect(new URL(user.role === "ADMIN" ? "/admin" : "/me", req.nextUrl.origin));
  }

  if (pathname.startsWith("/admin") && user.role !== "ADMIN") {
    return NextResponse.redirect(new URL("/", req.nextUrl.origin));
  }
  return NextResponse.next();
});

export const config = {
  // public static files (logo, icons) must load on the login page
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|webp)$).*)"],
};
