---
name: Better Auth hardening
description: Non-obvious Better Auth and migration constraints established during foundation hardening.
---

Better Auth credential accounts require the synthetic issuer `local:credential`, with identity uniqueness based on issuer plus account ID. Preserve this when creating users outside Better Auth's sign-up endpoint.

**Why:** Better Auth 1.7 ignores otherwise valid credential accounts when the issuer is absent or differs, causing correct passwords to fail as “user not found.”

**How to apply:** Any administrative user-creation or credential-migration path must populate the issuer exactly as Better Auth does.

Compatibility routes that call Better Auth's server API directly must enforce exact trusted origins themselves. Never trust wildcard suffixes on shared hosting domains.

**Why:** Server API calls do not apply the HTTP handler's origin middleware, and wildcard Replit subdomains allow sibling-host login/logout CSRF because they are schemefully same-site.

**How to apply:** Keep production bound to an exact configured origin, development bound to the exact dev host plus loopback, and retain forged-origin regression tests.

The initial development schema was applied with schema push before migration history existed.

**Why:** Running the migration runner later attempted to reapply the initial schema because its ledger was empty.

**How to apply:** Preserve the reconciled migration ledger; use the migration command for subsequent development changes rather than schema push.