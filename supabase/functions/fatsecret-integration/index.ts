import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const CONSUMER_KEY = Deno.env.get("FATSECRET_CONSUMER_KEY") ?? "";
const CONSUMER_SECRET = Deno.env.get("FATSECRET_CONSUMER_SECRET") ?? "";
const APP_URL = Deno.env.get("FATSECRET_APP_URL") ?? "https://chechelnitzky.github.io/modo-brigido/?fatsecret=connected#/nutricion";
const CALLBACK_URL = `${SUPABASE_URL}/functions/v1/fatsecret-integration?mode=callback`;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};

const service = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

function oauthEncode(value: string) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function nonce() {
  return crypto.randomUUID().replaceAll("-", "");
}

function oauthBaseParams(token?: string) {
  const params: Record<string, string> = {
    oauth_consumer_key: CONSUMER_KEY,
    oauth_nonce: nonce(),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_version: "1.0",
  };
  if (token) params.oauth_token = token;
  return params;
}

async function sign(method: string, baseUrl: string, params: Record<string, string>, tokenSecret = "") {
  const normalized = Object.entries(params)
    .map(([key, value]) => [oauthEncode(key), oauthEncode(value)] as const)
    .sort(([aKey, aVal], [bKey, bVal]) => aKey === bKey ? aVal.localeCompare(bVal) : aKey.localeCompare(bKey))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
  const base = `${method.toUpperCase()}&${oauthEncode(baseUrl)}&${oauthEncode(normalized)}`;
  const signingKey = `${oauthEncode(CONSUMER_SECRET)}&${oauthEncode(tokenSecret)}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(signingKey),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(base));
  const bytes = new Uint8Array(signature);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function signedParams(method: string, baseUrl: string, params: Record<string, string>, tokenSecret = "") {
  const oauthSignature = await sign(method, baseUrl, params, tokenSecret);
  return { ...params, oauth_signature: oauthSignature };
}

async function authenticatedUser(req: Request) {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}

function configured() {
  return Boolean(CONSUMER_KEY && CONSUMER_SECRET);
}

async function createRequestToken() {
  const url = "https://authentication.fatsecret.com/oauth/request_token";
  const params = await signedParams("POST", url, { ...oauthBaseParams(), oauth_callback: CALLBACK_URL });
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`FatSecret request token: ${response.status} ${text}`);
  const parsed = new URLSearchParams(text);
  const oauthToken = parsed.get("oauth_token");
  const oauthSecret = parsed.get("oauth_token_secret");
  if (!oauthToken || !oauthSecret) throw new Error("FatSecret no devolvió request token válido.");
  return { oauthToken, oauthSecret };
}

async function exchangeAccessToken(requestToken: string, requestSecret: string, verifier: string) {
  const url = "https://authentication.fatsecret.com/oauth/access_token";
  const params = await signedParams("GET", url, {
    ...oauthBaseParams(requestToken),
    oauth_verifier: verifier,
  }, requestSecret);
  const response = await fetch(`${url}?${new URLSearchParams(params)}`);
  const text = await response.text();
  if (!response.ok) throw new Error(`FatSecret access token: ${response.status} ${text}`);
  const parsed = new URLSearchParams(text);
  const oauthToken = parsed.get("oauth_token");
  const oauthSecret = parsed.get("oauth_token_secret");
  if (!oauthToken || !oauthSecret) throw new Error("FatSecret no devolvió access token válido.");
  return { oauthToken, oauthSecret };
}

function dateToFatSecretInt(date: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new Error("Fecha inválida.");
  const [, y, m, d] = match;
  return Math.floor(Date.UTC(Number(y), Number(m) - 1, Number(d)) / 86400000).toString();
}

async function getDiary(accessToken: string, accessSecret: string, date: string) {
  const url = "https://platform.fatsecret.com/rest/food-entries/v2";
  const params = await signedParams("GET", url, {
    ...oauthBaseParams(accessToken),
    date: dateToFatSecretInt(date),
    format: "json",
  }, accessSecret);
  const response = await fetch(`${url}?${new URLSearchParams(params)}`);
  const text = await response.text();
  if (!response.ok) throw new Error(`FatSecret diary: ${response.status} ${text}`);
  const payload = text ? JSON.parse(text) : {};
  const raw = payload?.food_entries?.food_entry;
  const entries = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const calories = Math.round(entries.reduce((sum: number, item: any) => sum + (Number(item?.calories) || 0), 0));
  const protein = Math.round(entries.reduce((sum: number, item: any) => sum + (Number(item?.protein) || 0), 0) * 10) / 10;
  return { calories, protein, entriesCount: entries.length };
}

async function cacheDailyTotals(userId: string, date: string, calories: number, protein: number) {
  const timestamp = new Date().toISOString();
  const { error } = await service.from("daily_logs").upsert({
    user_id: userId,
    log_date: date,
    calories,
    protein_g: protein,
    nutrition_source: "fatsecret",
    nutrition_synced_at: timestamp,
    updated_at: timestamp,
  }, { onConflict: "user_id,log_date" });
  if (error) throw error;
}

function appRedirect(result: "connected" | "denied" | "error", message?: string) {
  const target = new URL(APP_URL);
  target.searchParams.set("fatsecret", result);
  if (message) target.searchParams.set("fatsecret_message", message.slice(0, 180));
  return Response.redirect(target.toString(), 302);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const requestUrl = new URL(req.url);

  if (requestUrl.searchParams.get("mode") === "config") {
    return json({ configured: configured() });
  }

  if (requestUrl.searchParams.get("mode") === "callback") {
    try {
      const requestToken = requestUrl.searchParams.get("oauth_token") ?? "";
      const verifier = requestUrl.searchParams.get("oauth_verifier") ?? "";
      if (!requestToken || !verifier) return appRedirect("denied");
      if (!configured()) return appRedirect("error", "FatSecret no está configurado en el servidor.");

      const { data: pending } = await service
        .from("fatsecret_oauth_requests")
        .select("oauth_token,oauth_token_secret,user_id,created_at")
        .eq("oauth_token", requestToken)
        .maybeSingle();
      if (!pending) return appRedirect("error", "La autorización expiró. Intenta conectar nuevamente.");
      if (Date.now() - new Date(pending.created_at).getTime() > 30 * 60 * 1000) {
        await service.from("fatsecret_oauth_requests").delete().eq("oauth_token", requestToken);
        return appRedirect("error", "La autorización expiró. Intenta conectar nuevamente.");
      }

      const access = await exchangeAccessToken(requestToken, pending.oauth_token_secret, verifier);
      const { error: saveError } = await service.from("fatsecret_connections").upsert({
        user_id: pending.user_id,
        oauth_token: access.oauthToken,
        oauth_secret: access.oauthSecret,
        connected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
      if (saveError) throw saveError;
      await service.from("fatsecret_oauth_requests").delete().eq("oauth_token", requestToken);
      return appRedirect("connected");
    } catch (error) {
      console.error("fatsecret callback", error);
      return appRedirect("error", error instanceof Error ? error.message : "No se pudo conectar FatSecret.");
    }
  }

  let body: any = {};
  if (req.method === "POST") {
    try { body = await req.json(); } catch { body = {}; }
  }
  const action = String(body?.action ?? "status");
  const user = await authenticatedUser(req);
  if (!user) return json({ error: "No autorizado" }, 401);

  if (action === "status") {
    const { data } = await service.from("fatsecret_connections").select("connected_at").eq("user_id", user.id).maybeSingle();
    return json({ configured: configured(), connected: Boolean(data), connectedAt: data?.connected_at ?? null });
  }

  if (action === "start") {
    if (!configured()) return json({ error: "FatSecret aún no está configurado con Consumer Key y Shared Secret.", configured: false }, 503);
    try {
      await service.from("fatsecret_oauth_requests").delete().lt("created_at", new Date(Date.now() - 30 * 60 * 1000).toISOString());
      const requestToken = await createRequestToken();
      await service.from("fatsecret_oauth_requests").delete().eq("user_id", user.id);
      const { error } = await service.from("fatsecret_oauth_requests").insert({
        oauth_token: requestToken.oauthToken,
        oauth_token_secret: requestToken.oauthSecret,
        user_id: user.id,
      });
      if (error) throw error;
      return json({ authorizeUrl: `https://authentication.fatsecret.com/oauth/authorize?oauth_token=${encodeURIComponent(requestToken.oauthToken)}` });
    } catch (error) {
      console.error("fatsecret start", error);
      return json({ error: error instanceof Error ? error.message : "No se pudo iniciar FatSecret." }, 502);
    }
  }

  if (action === "daily") {
    const date = String(body?.date ?? "");
    const { data: connection } = await service.from("fatsecret_connections").select("oauth_token,oauth_secret").eq("user_id", user.id).maybeSingle();
    if (!connection) return json({ configured: configured(), connected: false, calories: null, protein: null });
    if (!configured()) return json({ configured: false, connected: true, calories: null, protein: null, error: "FatSecret no está configurado en el servidor." }, 503);
    try {
      const totals = await getDiary(connection.oauth_token, connection.oauth_secret, date);
      await cacheDailyTotals(user.id, date, totals.calories, totals.protein);
      return json({ configured: true, connected: true, ...totals, source: "fatsecret" });
    } catch (error) {
      console.error("fatsecret daily", error);
      return json({ configured: true, connected: true, calories: null, protein: null, error: error instanceof Error ? error.message : "No se pudo leer FatSecret." }, 502);
    }
  }

  if (action === "disconnect") {
    await service.from("fatsecret_connections").delete().eq("user_id", user.id);
    await service.from("fatsecret_oauth_requests").delete().eq("user_id", user.id);
    await service.from("daily_logs").update({
      calories: null,
      protein_g: null,
      nutrition_source: null,
      nutrition_synced_at: null,
      updated_at: new Date().toISOString(),
    }).eq("user_id", user.id).eq("nutrition_source", "fatsecret");
    return json({ connected: false });
  }

  return json({ error: "Acción desconocida" }, 400);
});
