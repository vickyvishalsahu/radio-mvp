import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

// Fetch user's top tracks and return their URIs
async function getTopTrackUris(accessToken: string): Promise<string[]> {
  const res = await fetch(
    "https://api.spotify.com/v1/me/top/tracks?limit=20&time_range=medium_term",
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) return [];
  const data = (await res.json()) as { items: Array<{ uri: string }> };
  return data.items.map((t) => t.uri);
}

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get("spotify_access_token")?.value;

  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { device_id } = (await request.json()) as { device_id: string };

  if (!device_id) {
    return NextResponse.json({ error: "device_id required" }, { status: 400 });
  }

  const uris = await getTopTrackUris(accessToken);

  if (uris.length === 0) {
    return NextResponse.json({ error: "No top tracks found" }, { status: 404 });
  }

  const shuffled = [...uris];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  const res = await fetch(
    `https://api.spotify.com/v1/me/player/play?device_id=${device_id}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ uris: shuffled }),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json(
      { error: `Spotify play failed: ${res.status}`, detail: text },
      { status: res.status }
    );
  }

  return NextResponse.json({ ok: true });
}
