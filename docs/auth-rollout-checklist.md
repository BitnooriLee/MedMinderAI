# Auth Rollout Checklist

This checklist covers the imported auth module (Google, Apple, Magic Link), Phone OTP, and Passkey MVP.

## 1) Supabase Dashboard Setup

- [ ] Authentication > URL Configuration:
  - [ ] Add local callback URL: `http://localhost:3000/auth/callback`
  - [ ] Add production callback URL: `https://<your-domain>/auth/callback`
- [ ] Authentication > Providers:
  - [ ] Enable Google
  - [ ] Enable Apple
  - [ ] Enable Email (Magic Link / OTP)
  - [ ] Confirm "Confirm email" policy matches your onboarding rules
- [ ] Add provider keys/secrets for Google and Apple
- [ ] Verify redirect URL list includes all environments (local + preview + production)

## 2) Environment Variables

- [ ] Set `NEXT_PUBLIC_SUPABASE_URL`
- [ ] Set `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- [ ] Optionally set `NEXT_PUBLIC_AUTH_REDIRECT_URL`
  - Example local: `http://localhost:3000`
  - Example production: `https://<your-domain>`

## 3) Functional Verification (Current Scope)

- [ ] Signed-out state shows three options: Google / Apple / Magic Link
- [ ] Google flow:
  - [ ] Tap Google button
  - [ ] OAuth screen opens
  - [ ] Returns through `/auth/callback`
  - [ ] Session is active and schedule loads
- [ ] Apple flow:
  - [ ] Tap Apple button
  - [ ] OAuth screen opens
  - [ ] Returns through `/auth/callback`
  - [ ] Session is active and schedule loads
- [ ] Magic Link flow:
  - [ ] Enter email and submit
  - [ ] Success message appears in UI
  - [ ] Email contains link back to `/auth/callback`
  - [ ] Session becomes active after link click
- [ ] Phone OTP flow:
  - [ ] Enter US phone number and request code
  - [ ] Receive SMS code
  - [ ] Submit 6-digit code and sign in successfully
- [ ] Passkey MVP flow:
  - [ ] Tap passkey sign-in button
  - [ ] If Supabase passkey API is available, sign-in completes
  - [ ] If unavailable, user sees a clear fallback message without blocking other methods
- [ ] Callback failure UX:
  - [ ] Trigger `authError` query (e.g., invalid callback params)
  - [ ] Friendly localized message appears on the home sign-in card

## 4) Accessibility Verification (Mobile, Senior-Friendly)

- [ ] Buttons remain large tap targets (>= 56px height)
- [ ] Typography remains large and readable (>= 18px)
- [ ] High-contrast borders and button colors remain visible in light/dark modes
- [ ] Error and success messages are readable and announced (`role="alert"` / `role="status"`)

## 5) Production Readiness

- [ ] Confirm Supabase email template branding and sender identity
- [ ] Confirm SPF/DKIM/DMARC for deliverability (Magic Link)
- [ ] Test with iOS Safari and Android Chrome on real devices
- [ ] Confirm login still works with slow network conditions

## 6) Supabase Provider Toggles (Required for New Flows)

- [ ] Enable Phone provider in Supabase Auth
- [ ] Keep phone signup policy aligned with product rule (`shouldCreateUser: false`)
- [ ] Confirm SMS sender and regional deliverability for US users
- [ ] Confirm your Supabase project/SDK supports passkey APIs in your current plan/version
