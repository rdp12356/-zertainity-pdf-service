# Security & operational readiness

This public PDF service processes student-generated report HTML and must not be exposed as an open HTML renderer.

**Required before normal PDF generation works**
- Set `PDF_SERVICE_SECRET` on this Render service as a randomly generated value of 32+ characters.
- Set the **exact same** secret as `PDF_SERVICE_SECRET` in the Zertainity Supabase Edge Function secrets; do not put the value in a browser `VITE_` variable or commit it.
- Set `PRIMARY_PDF_SERVICE_URL` to the service's HTTPS `/generate-pdf` endpoint in Supabase. Remove legacy unauthenticated fallback renderer URLs.
- Do not expose user session tokens to this service; the Supabase Edge Function verifies JWT and sends only a server-to-server secret.
- Smoke-test: no secret -> HTTP 403 (or 503 when unconfigured); correct secret -> PDF 200; external links, scripts, and file resources must never be fetched.
- Limit memory/CPU and configure failure alerts in Render. Base image versions should be reviewed and pinned.
- `.dockerignore` excludes tracked `node_modules` from the Docker build. The historical commit contains installed packages; later cleanup should remove tracked dependencies and review Git history.

**Fail-closed design:** Without `PDF_SERVICE_SECRET`, this service rejects rendering with HTTP 503. This is safer than allowing untrusted HTML to drive unauthenticated headless Chromium.

Do not post secrets, raw student reports, or session tokens in public issues or logs.
