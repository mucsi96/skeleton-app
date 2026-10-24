# Static client deployment

Production index HTML lives in Azure Storage's `$web` container. All other files
live in its public-read `assets` Blob container. The API uses `mucsi96/spring-app`
**34.0.0** on Kubernetes. The `hello-client` release uses
`mucsi96/static-client-app` **2.0.0** for document-only gateway routing.

Terraform supplies `client-storage-config` (`account_name`, `hostname`, `assets_base_url`) alongside
`forward-auth-config` and `client-runtime-config`. GitHub's existing federated deploy
identity receives Storage Blob Data Contributor separately on `$web` and `assets`.
Uploads use `--auth-mode login`; no account keys or SAS tokens are distributed.

The pipeline extracts the static files from the same image tested by Playwright,
passes them as the `client-static` artifact, and attaches `client-static.tar.gz` to
new client releases. Client GHCR publication is retired. The nginx image remains a
local/test fixture. Deployment takes `CLIENT_DIST`, not `CLIENT_IMAGE`.

`scripts/upload_client.py` checks the HTML bootstrap marker, rewrites HTML asset
links to absolute Blob URLs with anonymous CORS requests, and keeps the document
base at `/`. Manifest navigation fields stay on the app origin. Module imports
and external CSS font URLs resolve relative to their Blob-hosted parents. Roboto
and Material Icons are bundled locally. The script uploads assets with explicit
MIME types, then index last. Failed asset uploads leave the previous
index intact. Old bundles are retained for open browser tabs; asset responses
revalidate and index is never cached. Do not delete all blobs during deployment.

The storage website is publicly readable, including raw index HTML, by Azure's
static website design. It contains only public build resources and the unresolved
configuration marker. The application hostname still authenticates documents before
runtime configuration injection; APIs still validate JWT roles/scopes and CSRF.
Cookies and identity headers are stripped before requests reach Azure, and the
origin connection uses verified HTTPS with the storage hostname. Storage does not
perform SPA fallback; the gateway owns deep-link routing.

Azure website endpoints do not support CORS. Browser assets therefore use Blob
URLs with CORS restricted to the app origin and GET/HEAD/OPTIONS. The gateway
has no asset catchall; it serves only SPA documents.

`python3 scripts/check_static_assets.py <build-directory>` exercises the actual
build in Chromium with separate origins: modules, lazy chunks, styles, fonts,
icons, manifest navigation, CORS enforcement, credential isolation and same-origin
API calls.
