import { NextResponse } from "next/server";
import { getSpotifyAuthUrl } from "@/lib/spotify/auth";

export async function GET() {
  const state = crypto.randomUUID();
  const response = NextResponse.redirect(getSpotifyAuthUrl(state));

  response.cookies.set("spotify_auth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  return response;
}
