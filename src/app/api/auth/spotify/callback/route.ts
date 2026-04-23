import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { exchangeCodeForTokens } from "@/lib/spotify/auth";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  const cookieStore = await cookies();
  const storedState = cookieStore.get("spotify_auth_state")?.value;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL!;

  if (error) {
    return NextResponse.redirect(new URL(`/?error=${encodeURIComponent(error)}`, appUrl));
  }

  if (!code || !state || state !== storedState) {
    return NextResponse.redirect(new URL("/?error=state_mismatch", appUrl));
  }

  try {
    const tokens = await exchangeCodeForTokens(code);

    const response = NextResponse.redirect(new URL("/radio", appUrl));

    response.cookies.delete("spotify_auth_state");

    response.cookies.set("spotify_access_token", tokens.access_token, {
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: tokens.expires_in,
      path: "/",
    });

    response.cookies.set("spotify_refresh_token", tokens.refresh_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30,
      path: "/",
    });

    return response;
  } catch {
    return NextResponse.redirect(new URL("/?error=token_exchange", appUrl));
  }
}
