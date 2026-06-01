// supabase/functions/elevenlabs-proxy/index.ts
// Secure proxy for ElevenLabs API — never exposes API key to clients.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── ENVIRONMENT ──
const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");
const ELEVENLABS_VOICE_ID = "EXAVITQu4vr4xnSDxMaL"; // "Sarah" — server-enforced

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// ── ALLOWED ENDPOINTS ──
const ALLOWED_ENDPOINTS = new Set(["sound-generation", "text-to-speech"]);

// ── MAX TEXT LENGTH ──
const MAX_TTS_TEXT_LENGTH = 5000;
const MAX_SOUND_PROMPT_LENGTH = 2000;

// ── RATE LIMIT DEFAULTS (fallback if rate_limits table is missing) ──
const DEFAULT_RATE_LIMITS: Record<string, { hourly: number; daily: number }> = {
  free: { hourly: 30, daily: 200 },
  transcendence: { hourly: 100, daily: 1000 },
  illumination: { hourly: 300, daily: 5000 },
};

interface ProxyRequest {
  endpoint: string;
  text?: string;
  duration_seconds?: number;
  prompt_influence?: number;
  model_id?: string;
  voice_settings?: {
    stability?: number;
    similarity_boost?: number;
    style?: number;
    use_speaker_boost?: boolean;
  };
}

// ── HELPERS ──

function corsHeaders(origin: string | null): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Max-Age": "86400",
  };
}

function jsonResponse(data: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

async function getSupabaseUser(authHeader: string): Promise<{ id: string; email: string } | null> {
  const token = authHeader.replace("Bearer ", "");
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;
  return { id: user.id, email: user.email || "" };
}

async function getUserTier(supabase: SupabaseClient, userId: string): Promise<string> {
  const { data } = await supabase
    .from("profiles")
    .select("tier")
    .eq("id", userId)
    .single();
  return data?.tier || "free";
}

async function getRateLimit(supabase: SupabaseClient, tier: string): Promise<{ hourly: number; daily: number }> {
  try {
    const { data } = await supabase
      .from("rate_limits")
      .select("hourly_max, daily_max")
      .eq("tier", tier)
      .single();
    if (data) return { hourly: data.hourly_max, daily: data.daily_max };
  } catch {
    // Table might not exist yet — fall back to defaults
  }
  return DEFAULT_RATE_LIMITS[tier] || DEFAULT_RATE_LIMITS.free;
}

async function checkRateLimit(
  supabase: SupabaseClient,
  userId: string,
  limit: { hourly: number; daily: number }
): Promise<{ allowed: boolean; remaining: number }> {
  const oneHourAgo = new Date(Date.now() - 3600000).toISOString();

  const { count, error } = await supabase
    .from("elevenlabs_usage")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", oneHourAgo);

  if (error) {
    console.error("[RateLimit] Query error:", error);
    return { allowed: true, remaining: limit.hourly }; // Fail open
  }

  const used = count || 0;
  return { allowed: used < limit.hourly, remaining: Math.max(0, limit.hourly - used) };
}

async function logUsage(
  supabase: SupabaseClient,
  userId: string,
  endpoint: string,
  status: number
): Promise<void> {
  try {
    await supabase.from("elevenlabs_usage").insert({
      user_id: userId,
      endpoint,
      status,
    });
  } catch (e) {
    console.error("[LogUsage] Insert error:", e);
  }
}

// ── MAIN HANDLER ──

serve(async (req) => {
  const origin = req.headers.get("origin");
  const cors = corsHeaders(origin);

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  // Only POST allowed
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405, cors);
  }

  // 1. Authenticate
  const authHeader = req.headers.get("authorization");
  if (!authHeader) {
    return jsonResponse({ error: "Missing authorization header" }, 401, cors);
  }

  const user = await getSupabaseUser(authHeader);
  if (!user) {
    return jsonResponse({ error: "Invalid or expired token" }, 401, cors);
  }

  // 2. Parse request body
  let body: ProxyRequest;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400, cors);
  }

  // 3. Validate endpoint
  if (!body.endpoint || !ALLOWED_ENDPOINTS.has(body.endpoint)) {
    return jsonResponse({ error: "Invalid endpoint" }, 400, cors);
  }

  // 4. Get user tier and rate limit
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const tier = await getUserTier(supabase, user.id);
  const rateLimit = await getRateLimit(supabase, tier);
  const { allowed, remaining } = await checkRateLimit(supabase, user.id, rateLimit);

  if (!allowed) {
    await logUsage(supabase, user.id, body.endpoint, 429);
    return jsonResponse(
      { error: "Rate limit exceeded", remaining: 0, tier, limit: rateLimit },
      429,
      { ...cors, "Retry-After": "3600" }
    );
  }

  // 5. Validate and build ElevenLabs request
  let elUrl: string;
  let elBody: string;

  if (body.endpoint === "sound-generation") {
    if (!body.text || typeof body.text !== "string") {
      return jsonResponse({ error: "Missing or invalid 'text' field" }, 400, cors);
    }
    if (body.text.length > MAX_SOUND_PROMPT_LENGTH) {
      return jsonResponse({ error: "Text exceeds maximum length" }, 400, cors);
    }
    elUrl = "https://api.elevenlabs.io/v1/sound-generation";
    elBody = JSON.stringify({
      text: body.text,
      duration_seconds: Math.min(Math.max(body.duration_seconds || 22, 1), 300),
      prompt_influence: Math.min(Math.max(body.prompt_influence || 0.7, 0), 1),
    });
  } else {
    // text-to-speech
    if (!body.text || typeof body.text !== "string") {
      return jsonResponse({ error: "Missing or invalid 'text' field" }, 400, cors);
    }
    if (body.text.length > MAX_TTS_TEXT_LENGTH) {
      return jsonResponse({ error: "Text exceeds maximum length" }, 400, cors);
    }
    elUrl = `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}/stream`;
    elBody = JSON.stringify({
      text: body.text,
      model_id: body.model_id || "eleven_multilingual_v2",
      voice_settings: {
        stability: body.voice_settings?.stability ?? 0.72,
        similarity_boost: body.voice_settings?.similarity_boost ?? 0.78,
        style: body.voice_settings?.style ?? 0.15,
        use_speaker_boost: body.voice_settings?.use_speaker_boost ?? true,
      },
    });
  }

  // 6. Forward to ElevenLabs
  if (!ELEVENLABS_API_KEY) {
    console.error("[ElevenLabs] API key not configured");
    return jsonResponse({ error: "Server configuration error" }, 500, cors);
  }

  let elResponse: Response;
  try {
    elResponse = await fetch(elUrl, {
      method: "POST",
      headers: {
        "xi-api-key": ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: elBody,
    });
  } catch (e) {
    console.error("[ElevenLabs] Fetch error:", e);
    await logUsage(supabase, user.id, body.endpoint, 502);
    return jsonResponse({ error: "Failed to reach ElevenLabs" }, 502, cors);
  }

  // 7. Log usage
  await logUsage(supabase, user.id, body.endpoint, elResponse.status);

  // 8. Handle ElevenLabs errors
  if (!elResponse.ok) {
    const errorText = await elResponse.text().catch(() => "Unknown error");
    console.error(`[ElevenLabs] ${elResponse.status}: ${errorText}`);
    return jsonResponse(
      { error: "ElevenLabs request failed", status: elResponse.status },
      elResponse.status >= 500 ? 502 : elResponse.status,
      cors
    );
  }

  // 9. Stream audio response back to client
  const responseHeaders: Record<string, string> = {
    ...cors,
    "Content-Type": elResponse.headers.get("Content-Type") || "audio/mpeg",
    "Cache-Control": "public, max-age=86400",
    "X-RateLimit-Remaining": String(remaining - 1),
    "X-RateLimit-Tier": tier,
  };

  return new Response(elResponse.body, {
    status: 200,
    headers: responseHeaders,
  });
});
