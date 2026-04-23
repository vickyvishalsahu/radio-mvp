import { NextResponse } from "next/server";

export const GET = () => {
  const response = NextResponse.redirect(new URL("/", process.env.NEXT_PUBLIC_APP_URL!));

  response.cookies.delete("spotify_access_token");
  response.cookies.delete("spotify_refresh_token");

  return response;
};
