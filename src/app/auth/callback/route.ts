import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

function resolveNextPath(rawNext: string | null): string {
  if (!rawNext) return "/";
  if (!rawNext.startsWith("/") || rawNext.startsWith("//")) return "/";
  return rawNext;
}

function buildRedirectUrl(requestUrl: string, path: string): URL {
  return new URL(path, requestUrl);
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const searchParams = requestUrl.searchParams;
  const nextPath = resolveNextPath(searchParams.get("next"));

  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");

  const supabase = await createSupabaseServerClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(buildRedirectUrl(request.url, nextPath));
    }
    const errorUrl = buildRedirectUrl(request.url, nextPath);
    errorUrl.searchParams.set("authError", "oauth_exchange_failed");
    return NextResponse.redirect(errorUrl);
  }

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as EmailOtpType,
    });
    if (!error) {
      return NextResponse.redirect(buildRedirectUrl(request.url, nextPath));
    }
    const errorUrl = buildRedirectUrl(request.url, nextPath);
    errorUrl.searchParams.set("authError", "magic_link_failed");
    return NextResponse.redirect(errorUrl);
  }

  const invalidUrl = buildRedirectUrl(request.url, nextPath);
  invalidUrl.searchParams.set("authError", "invalid_auth_callback");
  return NextResponse.redirect(invalidUrl);
}
