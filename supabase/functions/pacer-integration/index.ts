import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { createHash, randomBytes } from "node:crypto";

const PACER_AUTH_URL = "https://developer.mypacer.com/oauth2/dialog";
const PACER_TOKEN_URL = "https://openapi.mypacer.com/oauth2/access_token";
const PACER_API_URL = "https://openapi.mypacer.com";
const APP_SETTINGS_URL = "https://chechelnitzky.github.io/modo-brigido/#/ajustes";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
};

type PacerConnection = {
  user_id: string;
  pacer_user_id: string;
  display_name: string | null;
  access_token: string;
  refresh_token: string;
  access_token_expires_at: string | null;
  connected_at: string;
  last_sync_at: string | null;
  last_sync_status: string | null;
  last_sync_error: string | null;
};

type PacerConfig = { clientId: string; clientSecret: string };

type DailyActivity = {
  recorded_for_date: string;
  steps: number;
  walking_running_distance?: number;
  calories?: number;
  active_time?: number;
  source?: string;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

function redirectToApp(result: "connected" | "cancelled" | "error", message?: string) {
  const query = new URLSearchParams({ pacer: result });
  if (message) query.set("message", message.slice(0, 180));
  return Response.redirect(`${APP_SETTINGS_URL}?${query.toString()}`, 302);
}

function md5(value: string) {
  return createHash("md5").update(value).digest("hex");
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function pacerSignature(config: PacerConfig) {
  const appSecretHash = md5(`${config.clientSecret}pacer_oauth`);
  return md5(`${appSecretHash}${config.clientId}`);
}

function shiftDate(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function dateInTimezone(timezone: string) {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    if (values.year && values.month && values.day) return `${values.year}-${values.month}-${values.day}`;
  } catch {
    // Fall through to UTC.
  }
  return new Date().toISOString().slice(0, 10);
}

function safeError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function loadPacerConfig(admin: SupabaseClient): Promise<PacerConfig | null> {
  const { data, error } = await admin
    .from("app_secrets")
    .select("secret_name,secret_value")
    .in("secret_name", ["pacer_client_id", "pacer_client_secret"]);
  if (error) throw new Error(`No se pudo leer la configuración de Pacer: ${error.message}`);
  const secrets = Object.fromEntries((data ?? []).map((row) => [row.secret_name, row.secret_value]));
  if (!secrets.pacer_client_id || !secrets.pacer_client_secret) return null;
  return { clientId: secrets.pacer_client_id, clientSecret: secrets.pacer_client_secret };
}

async function exchangeToken(config: PacerConfig, payload: Record<string, string>) {
  const response = await fetch(PACER_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: pacerSignature(config),
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ client_id: config.clientId, ...payload })
  });
  const result = await response.json().catch(() => null) as any;
  if (!response.ok || !result?.success || !result?.data?.access_token) {
    throw new Error(result?.message || result?.error || `Pacer rechazó el token (${response.status})`);
  }
  return result.data as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    user_id: string;
  };
}

async function getProfileTimezone(admin: SupabaseClient, userId: string) {
  const { data } = await admin.from("profiles").select("timezone").eq("id", userId).maybeSingle();
  return data?.timezone || "America/Santiago";
}

async function getPacerUserInfo(accessToken: string, pacerUserId: string) {
  const response = await fetch(`${PACER_API_URL}/users/${encodeURIComponent(pacerUserId)}`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const result = await response.json().catch(() => null) as any;
  if (!response.ok || !result?.success) return null;
  return result.data ?? null;
}

async function ensureFreshConnection(admin: SupabaseClient, config: PacerConfig, connection: PacerConnection) {
  const expiresAt = connection.access_token_expires_at ? Date.parse(connection.access_token_expires_at) : 0;
  if (expiresAt > Date.now() + 5 * 60_000) return connection;

  const refreshed = await exchangeToken(config, {
    refresh_token: connection.refresh_token,
    grant_type: "refresh_token"
  });
  const expiresIn = Math.max(60, Number(refreshed.expires_in ?? 86400));
  const next = {
    ...connection,
    access_token: refreshed.access_token,
    refresh_token: refreshed.refresh_token || connection.refresh_token,
    access_token_expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
    pacer_user_id: refreshed.user_id || connection.pacer_user_id
  };
  const { error } = await admin.from("pacer_connections").update({
    access_token: next.access_token,
    refresh_token: next.refresh_token,
    access_token_expires_at: next.access_token_expires_at,
    pacer_user_id: next.pacer_user_id,
    last_sync_error: null
  }).eq("user_id", connection.user_id);
  if (error) throw new Error(`No se pudo guardar el token renovado: ${error.message}`);
  return next;
}

async function syncPacerRange(
  admin: SupabaseClient,
  config: PacerConfig,
  connectionInput: PacerConnection,
  startDate: string,
  endDate: string
) {
  try {
    const connection = await ensureFreshConnection(admin, config, connectionInput);
    const url = new URL(`${PACER_API_URL}/users/${encodeURIComponent(connection.pacer_user_id)}/activities/daily.json`);
    url.searchParams.set("start_date", startDate);
    url.searchParams.set("end_date", endDate);
    url.searchParams.set("accept_manual_input", "false");

    const response = await fetch(url, { headers: { Authorization: `Bearer ${connection.access_token}` } });
    const result = await response.json().catch(() => null) as any;
    if (!response.ok || !result?.success) {
      throw new Error(result?.message || result?.error || `Pacer rechazó la sincronización (${response.status})`);
    }

    const activities = (result?.data?.daily_activities ?? []) as DailyActivity[];
    const rows = activities
      .filter((activity) => /^\d{4}-\d{2}-\d{2}$/.test(activity.recorded_for_date))
      .map((activity) => ({
        user_id: connection.user_id,
        activity_date: activity.recorded_for_date,
        steps: Math.max(0, Math.round(Number(activity.steps) || 0)),
        walking_running_distance_m: Number.isFinite(Number(activity.walking_running_distance)) ? Math.max(0, Math.round(Number(activity.walking_running_distance))) : null,
        calories: Number.isFinite(Number(activity.calories)) ? Math.max(0, Math.round(Number(activity.calories))) : null,
        active_time_seconds: Number.isFinite(Number(activity.active_time)) ? Math.max(0, Math.round(Number(activity.active_time))) : null,
        source: activity.source || "Pacer",
        synced_at: new Date().toISOString()
      }));

    if (rows.length) {
      const { error: activityError } = await admin.from("pacer_daily_activity").upsert(rows, { onConflict: "user_id,activity_date" });
      if (activityError) throw new Error(`No se pudo guardar la actividad: ${activityError.message}`);

      const { error: dailyError } = await admin.rpc("apply_pacer_steps", {
        p_user_id: connection.user_id,
        p_rows: rows.map((row) => ({ log_date: row.activity_date, steps: row.steps }))
      });
      if (dailyError) throw new Error(`No se pudieron actualizar los pasos: ${dailyError.message}`);
    }

    const syncedAt = new Date().toISOString();
    await admin.from("pacer_connections").update({
      last_sync_at: syncedAt,
      last_sync_status: "ok",
      last_sync_error: null
    }).eq("user_id", connection.user_id);

    return { synced: rows.length, lastSyncAt: syncedAt, activities: rows };
  } catch (error) {
    const message = safeError(error).slice(0, 500);
    await admin.from("pacer_connections").update({
      last_sync_at: new Date().toISOString(),
      last_sync_status: "error",
      last_sync_error: message
    }).eq("user_id", connectionInput.user_id);
    throw error;
  }
}

async function authenticateUser(req: Request, supabaseUrl: string, anonKey: string) {
  const authorization = req.headers.get("Authorization");
  if (!authorization) return null;
  const client = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data: { user }, error } = await client.auth.getUser();
  return error ? null : user;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) return json({ error: "Supabase no está configurado en el servidor." }, 500);

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

  if (req.method === "GET") {
    const url = new URL(req.url);
    const state = url.searchParams.get("state") || "";
    const code = url.searchParams.get("code") || "";
    const authResult = url.searchParams.get("auth_result") || "";
    if (!state) return redirectToApp("error", "Pacer no devolvió un estado OAuth válido.");

    const stateHash = sha256(state);
    const { data: stateRow } = await admin
      .from("pacer_oauth_states")
      .select("state_hash,user_id,expires_at,used_at")
      .eq("state_hash", stateHash)
      .is("used_at", null)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (!stateRow) return redirectToApp("error", "La autorización expiró. Intenta conectar Pacer nuevamente.");

    await admin.from("pacer_oauth_states").update({ used_at: new Date().toISOString() }).eq("state_hash", stateHash);
    if (authResult === "fail" || !code) return redirectToApp("cancelled");

    try {
      const config = await loadPacerConfig(admin);
      if (!config) return redirectToApp("error", "Falta configurar el cliente de Pacer en el servidor.");
      const token = await exchangeToken(config, { code, grant_type: "authorization_code" });
      if (!token.refresh_token) throw new Error("Pacer no entregó refresh_token.");
      const expiresIn = Math.max(60, Number(token.expires_in ?? 86400));
      const info = await getPacerUserInfo(token.access_token, token.user_id);

      const connection: PacerConnection = {
        user_id: stateRow.user_id,
        pacer_user_id: token.user_id,
        display_name: info?.display_name ?? null,
        access_token: token.access_token,
        refresh_token: token.refresh_token,
        access_token_expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
        connected_at: new Date().toISOString(),
        last_sync_at: null,
        last_sync_status: null,
        last_sync_error: null
      };

      const { error: connectionError } = await admin.from("pacer_connections").upsert(connection, { onConflict: "user_id" });
      if (connectionError) throw new Error(`No se pudo guardar la conexión: ${connectionError.message}`);

      const timezone = await getProfileTimezone(admin, stateRow.user_id);
      const today = dateInTimezone(timezone);
      await syncPacerRange(admin, config, connection, shiftDate(today, -30), today);
      return redirectToApp("connected");
    } catch (error) {
      console.error("Pacer OAuth callback failed", safeError(error));
      return redirectToApp("error", safeError(error));
    }
  }

  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: any = {};
  try { body = await req.json(); } catch { return json({ error: "JSON inválido." }, 400); }
  const action = body?.action || "status";

  if (action === "sync-all") {
    const suppliedSecret = req.headers.get("x-cron-secret") || "";
    const { data: secretRow } = await admin.from("app_secrets").select("secret_value").eq("secret_name", "pacer_cron_secret").maybeSingle();
    if (!secretRow?.secret_value || suppliedSecret !== secretRow.secret_value) return json({ error: "Unauthorized" }, 401);
    const config = await loadPacerConfig(admin);
    if (!config) return json({ configured: false, syncedUsers: 0 });

    const { data: connections, error } = await admin.from("pacer_connections").select("*");
    if (error) return json({ error: error.message }, 500);
    let syncedUsers = 0;
    const errors: string[] = [];
    for (const connection of (connections ?? []) as PacerConnection[]) {
      try {
        const timezone = await getProfileTimezone(admin, connection.user_id);
        const today = dateInTimezone(timezone);
        await syncPacerRange(admin, config, connection, shiftDate(today, -1), today);
        syncedUsers += 1;
      } catch (error) {
        errors.push(`${connection.user_id}: ${safeError(error)}`);
      }
    }
    return json({ configured: true, syncedUsers, failedUsers: errors.length, errors: errors.slice(0, 10) });
  }

  const user = await authenticateUser(req, supabaseUrl, anonKey);
  if (!user) return json({ error: "Unauthorized" }, 401);

  const config = await loadPacerConfig(admin);
  const { data: connectionData, error: connectionError } = await admin
    .from("pacer_connections")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();
  if (connectionError) return json({ error: connectionError.message }, 500);
  const connection = connectionData as PacerConnection | null;

  if (action === "status") {
    return json({
      configured: Boolean(config),
      connected: Boolean(connection),
      displayName: connection?.display_name ?? null,
      connectedAt: connection?.connected_at ?? null,
      lastSyncAt: connection?.last_sync_at ?? null,
      lastSyncStatus: connection?.last_sync_status ?? null,
      lastSyncError: connection?.last_sync_error ?? null
    });
  }

  if (action === "start") {
    if (!config) return json({ error: "Pacer todavía no está configurado en el servidor.", configured: false }, 503);
    const state = randomBytes(32).toString("base64url");
    const stateHash = sha256(state);
    await admin.from("pacer_oauth_states").delete().eq("user_id", user.id);
    const { error } = await admin.from("pacer_oauth_states").insert({
      state_hash: stateHash,
      user_id: user.id,
      expires_at: new Date(Date.now() + 10 * 60_000).toISOString()
    });
    if (error) return json({ error: error.message }, 500);

    const authorizeUrl = new URL(PACER_AUTH_URL);
    authorizeUrl.searchParams.set("client_id", config.clientId);
    authorizeUrl.searchParams.set("redirect_uri", `${supabaseUrl}/functions/v1/pacer-integration`);
    authorizeUrl.searchParams.set("state", state);
    return json({ authorizeUrl: authorizeUrl.toString() });
  }

  if (action === "sync") {
    if (!config) return json({ configured: false, connected: Boolean(connection), error: "Pacer no está configurado." }, 503);
    if (!connection) return json({ configured: true, connected: false }, 200);
    const timezone = await getProfileTimezone(admin, user.id);
    const today = dateInTimezone(timezone);
    const days = Math.min(31, Math.max(1, Number(body?.days ?? 2)));
    const result = await syncPacerRange(admin, config, connection, shiftDate(today, -(days - 1)), today);
    return json({ configured: true, connected: true, ...result });
  }

  if (action === "disconnect") {
    await admin.from("pacer_oauth_states").delete().eq("user_id", user.id);
    const { error } = await admin.from("pacer_connections").delete().eq("user_id", user.id);
    if (error) return json({ error: error.message }, 500);
    return json({ connected: false });
  }

  return json({ error: "Acción desconocida." }, 400);
});
