import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function setCors(h: Headers) {
  h.set("Access-Control-Allow-Origin", "*");
  h.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  h.set("Access-Control-Allow-Headers", "Content-Type, Range");
  h.set("Access-Control-Expose-Headers", "Content-Range, Accept-Ranges, Content-Type");
}

export async function OPTIONS() {
  const h = new Headers();
  setCors(h);
  return new Response(null, { status: 204, headers: h });
}

export async function HEAD(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const targetUrl = searchParams.get("url");
  const ref = searchParams.get("referer") || searchParams.get("ref") || "";
  const origin = searchParams.get("origin") || "";

  const baseHeaders = new Headers();
  setCors(baseHeaders);

  if (!targetUrl) {
    return Response.json({ error: "Missing url parameter" }, { status: 400, headers: baseHeaders });
  }

  const upstreamHeaders: Record<string, string> = {
    Accept: "*/*",
    "User-Agent": req.headers.get("user-agent") || "Mozilla/5.0",
  };
  const range = req.headers.get("range");
  if (range) upstreamHeaders["Range"] = range;
  if (ref) upstreamHeaders["Referer"] = ref;
  if (origin) upstreamHeaders["Origin"] = origin;

  const headRes = await fetch(targetUrl, { method: "HEAD", headers: upstreamHeaders, redirect: "follow" });

  const out = new Headers(baseHeaders);
  out.set("Accept-Ranges", headRes.headers.get("accept-ranges") || "bytes");
  const cr = headRes.headers.get("content-range");
  if (cr) out.set("Content-Range", cr);
  const ct = headRes.headers.get("content-type");
  if (ct) out.set("Content-Type", ct);
  out.set("X-Proxy-By", "next-hls-proxy");

  return new Response(null, { status: headRes.status, headers: out });
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const targetUrl = searchParams.get("url");
  const ref = searchParams.get("referer") || searchParams.get("ref") || "";
  const origin = searchParams.get("origin") || "";

  const baseHeaders = new Headers();
  setCors(baseHeaders);

  if (!targetUrl) {
    return Response.json({ error: "Missing url parameter" }, { status: 400, headers: baseHeaders });
  }

  try {
    const upstreamHeaders: Record<string, string> = {
      Accept: "*/*",
      "User-Agent": req.headers.get("user-agent") || "Mozilla/5.0",
    };
    const range = req.headers.get("range");
    if (range) upstreamHeaders["Range"] = range;
    if (ref) upstreamHeaders["Referer"] = ref;
    if (origin) upstreamHeaders["Origin"] = origin;

    const upstream = await fetch(targetUrl, { headers: upstreamHeaders, redirect: "follow" });

    const ct = upstream.headers.get("content-type") || "";
    const isM3U8 =
      ct.includes("application/vnd.apple.mpegurl") ||
      ct.includes("application/x-mpegURL") ||
      /\.m3u8(\?|$)/i.test(targetUrl);

    const out = new Headers(baseHeaders);
    out.set("Accept-Ranges", upstream.headers.get("accept-ranges") || "bytes");
    const cr = upstream.headers.get("content-range");
    if (cr) out.set("Content-Range", cr);
    out.set("X-Proxy-By", "next-hls-proxy");

    if (isM3U8) {
      let text = await upstream.text();
      const base = new URL(targetUrl);
      const refQ = ref ? `&referer=${encodeURIComponent(ref)}` : "";
      const orgQ = origin ? `&origin=${encodeURIComponent(origin)}` : "";

      const toAbs = (u: string) => {
        try {
          return new URL(u, base).toString();
        } catch {
          return u;
        }
      };
      const toProxy = (u: string) => `/api/proxy?url=${encodeURIComponent(u)}${refQ}${orgQ}`;

      // Rewrite URI attributes in KEY and MAP lines
      text = text.replace(/(#EXT-X-KEY:([^\n]*?)URI=")([^"]+)("[^\n]*?)/g, (m, p1, _p2, p3, p4) => `${p1}${toProxy(toAbs(p3))}${p4}`);
      text = text.replace(/(#EXT-X-MAP:([^\n]*?)URI=")([^"]+)("[^\n]*?)/g, (m, p1, _p2, p3, p4) => `${p1}${toProxy(toAbs(p3))}${p4}`);

      // Rewrite any non-comment line to go through proxy
      const rewritten = text
        .split(/\n/)
        .map((line) => {
          if (!line || line.startsWith("#")) return line;
          const abs = toAbs(line.trim());
          return toProxy(abs);
        })
        .join("\n");

      out.set("Content-Type", "application/vnd.apple.mpegurl");
      return new Response(rewritten, { status: upstream.status, headers: out });
    }

    const ct2 = upstream.headers.get("content-type");
    if (ct2) out.set("Content-Type", ct2);
    return new Response(upstream.body, { status: upstream.status, headers: out });
  } catch (err: any) {
    return Response.json(
      { error: "Proxy failed", details: String(err?.message || err) },
      { status: 500, headers: baseHeaders }
    );
  }
}
