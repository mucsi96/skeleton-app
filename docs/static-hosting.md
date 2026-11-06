# Static client deployment

Production index HTML lives in Azure Storage's `$web` container. All other files
live in its public-read `assets` Blob container. The API uses `mucsi96/rust-app`
**7.0.0** on Kubernetes. The `hello-client` release uses
`mucsi96/static-client-app` **5.0.0** for document-only gateway routing.

Terraform supplies `client-storage-config` (`account_name`, `hostname`, `assets_base_url`) alongside
`forward-auth-config`. GitHub's existing federated deploy
identity receives Storage Blob Data Contributor separately on `$web` and `assets`.
Uploads use `--auth-mode login`; no account keys or SAS tokens are distributed.

The pipeline builds React/Vite directly with `actions/setup-node`, `npm ci` and
`npm run build`. It passes `client/dist` as the `client-static` artifact to tests
and deployment, and attaches `client-static.tar.gz` to new client releases.
There is no client Dockerfile, image build or image publication. E2E tests mount
the compiled files and nginx configuration into the stock nginx image behind
Traefik; Traefik routes requests but does not serve files itself.

`scripts/prepare-client.mjs` rewrites HTML asset
links to absolute Blob URLs with anonymous CORS requests, and keeps the document
base at `/`. Manifest navigation fields stay on the app origin. Module imports
and external CSS font URLs resolve relative to their Blob-hosted parents. Roboto
is bundled locally. Preparation separates `assets/` and
`documents/index.html` without changing the tested bundles.

The official `azure/login` action authenticates with OIDC, then `azure/cli` runs
`az storage blob upload-batch` for assets. Azure CLI infers asset MIME types;
the manifest is explicitly published as `application/manifest+json`. Index HTML
is uploaded separately, last. Before uploading, deployment empties `$web`, then
`assets`, including old release directories. Only the latest assets are published,
directly at the asset root, with `Cache-Control: public, max-age=31536000, immutable`,
including the manifest and icons; index uses `no-store`. Downtime is intentional,
and a failed upload leaves the site unavailable until a successful deployment.
Deleting blobs does not clear browser caches for unchanged asset URLs.

The storage website is publicly readable, including raw index HTML, by Azure's
static website design. It contains only public build resources. Faro's app name
and same-origin collector path are compiled into the bundle. The application
hostname authenticates documents; APIs validate JWT roles/scopes and CSRF.
Cookies and identity headers are stripped before requests reach Azure, and the
origin connection uses verified HTTPS with the storage hostname. Storage does not
perform SPA fallback; the gateway owns deep-link routing.

Azure website endpoints do not support CORS. Browser assets therefore use Blob
URLs with CORS restricted to the app origin and GET/HEAD/OPTIONS. The gateway
has no asset catchall; it serves only SPA documents.

## Shared contract with Cooking and Observatory

All three clients use `static-client-app` 5.0.0 and the same hosting/auth deployment
secrets: `forward-auth-config.auth` and
`client-storage-config`. The gateway authenticates documents before rewriting
deep links. No response-body configuration middleware is installed. Browser assets use anonymous Blob
requests; APIs and Faro stay on the application hostname. There is no frontend
OAuth/token implementation or environment-bootstrap fetch.

Each pipeline tests a static artifact, empties both static containers, uploads
assets before index and deploys the client route without a client container. Terraform owns
storage, app-origin CORS, scoped upload permissions and session infrastructure.
The app/API charts own routing and authentication middleware.

Alignment preserves stack-specific security: Skeleton uses host-only double-submit
CSRF cookies with its same-origin fetch helper, Cooking uses strict mutation Origin checks, and Observatory's JWT-protected
API is read-only. Observatory also supplies a strict CSP via
`contentSecurityPolicy`; all clients receive the chart's fixed `no-referrer` and
`nosniff` document headers.
