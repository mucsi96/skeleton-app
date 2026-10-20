# p07 UI authentication and hosting — AI session handoff

Snapshot: 20 October 2026. Read repository AGENTS.md before continuing.

## Start here

- Architecture and junior-friendly migration guide:
  https://github.com/mucsi96/skeleton-app/issues/105
- Charts PR (open, not merged at this snapshot):
  https://github.com/mucsi96/k8s-helm-charts/pull/22
- **All current implementation work is saved on remote branches.** Source pushed
  to a feature branch does not mean released or deployed.

| Repository | Remote branch | Snapshot |
| --- | --- | --- |
| `k8s-helm-charts` | `feat/gateway-spa-index-bootstrap` | `f844caa`, PR #22, CI green |
| `k8s-modules` | `feat/gateway-spa-index-bootstrap` | `8dccfa3`, source pushed; no new PR/release yet |
| `skeleton-app` | `feat/gateway-spa-index-bootstrap` | This branch contains implementation plus this handoff; no new PR/deployment yet |
| `p07` | `feat/forwardauth-v92-rollout` | `812e62a`, saved prior authorized rollout configuration; no new PR/apply |

Use fresh clones/worktrees of these branches. `/tmp/opencode` has been cleared
between sessions before; nothing needed for implementation should depend on it.
The original `/home/mucsi/{k8s-helm-charts,k8s-modules,skeleton-app,p07}` checkouts
contain pre-existing unrelated automation/experimental edits. Preserve them;
do not blindly stage/reset them. The p07 branch was created from its existing
`4d3da59` checkout and includes the existing Observatory history. Review its base
before creating a PR; do not merge its whole history blindly.

## Final decisions — do not reintroduce rejected designs

1. Keep **one stock oauth2-proxy per app**, with shared Redis. A single instance
   was investigated and explicitly deferred: it cannot transparently select
   different Entra API audiences/Web clients per app. See
   [source-review findings](oauth2-proxy-multi-app-review.md).
2. Platform Terraform owns the proxy, credentials, Entra registration/assignments
   and narrow OAuth/excluded routes. **Client/API charts own their authentication
   middleware and policies**, configured only by a proxy reference:

   ```yaml
   auth:
     proxyService: hello-oauth2-proxy
     proxyPort: 80
     mode: api-token
   ```

   Port 80 and api-token are defaults; `auth: null` means public. No `documentAuth`
   flag, exported policy ConfigMap/readback or generated filter lists in deploy.
   Manual `routeFilters` has been removed from all five app charts. Nonempty old
   values fail clearly instead of silently removing authentication.
3. All apps use **`__Host-session`**, Secure/HttpOnly/host-only, Path=/, no Domain.
   Its login-CSRF companion is `__Host-session_csrf`. Cookie names are not app
   inputs; registrations and cookie secrets remain per-app. Rename requires a
   fresh sign-in. Do not confuse this with the API's readable XSRF cookie.
4. **Client chart always owns SPA routing**, document auth and optional config
   injection. UI base path is fixed `/`; deeply nested React/Angular history URLs
   internally request `/index.html` without changing the browser URL. Assets are
   public, missing files 404. API chart prefixes such as `/api` remain configurable.
5. nginx serves files only. Public runtime configuration is injected before the
   application starts using pinned `github.com/traefik/plugin-rewritebody` v0.3.1:

   ```html
   <script>window.__APP_CONFIG__ = "__APP_CONFIG_JSON__";</script>
   ```

   Helm JSON serialization escapes HTML and replacement dollars. Documents are
   no-store; strip validators/conditional/range headers and request identity
   encoding. Strip app cookies/identity only after document authentication.
6. Frontend validates `clientLogUrl` and `clientAppName`, initializes Faro and
   bootstraps immediately. No environment endpoint/fetch, auth service/guard,
   token storage/refresh, popup reauth or login/logout UI. Keep independent
   read-only `/oauth2/userinfo` profile display.
7. API checks use private `/oauth2/auth` and return 401/403, not HTML redirects;
   document checks use private proxy `/` to start login. Preserve backend JWT
   issuer/audience/scope/roles and mutation CSRF, including proxy-bearer requests.
   Skeleton keeps Spring SPA CSRF with `__Host-XSRF-TOKEN` / `X-XSRF-TOKEN`; its
   matcher intentionally overrides bearer-request CSRF exemptions.
8. Faro uses `https://<app-host>/_telemetry/collect`. Logging owns its exact
   POST/OPTIONS route to `/collect`, strips credentials and keeps origin/rate
   controls. Azure Storage hosting is future work, not provisioned here.
9. No new migration/state-move scaffolding, Terraform test files, NetworkPolicies
   or per-app oauth2-proxy/Redis test stacks. Keep app tests lightweight; shared
   integration belongs to the chart repo. Never auto-merge or apply infrastructure.

## What the branches contain

### Charts

- `libraries/app_common` Helm library (internal version **2.0.0**): shared auth
  validation/middleware/header policies and API HTTPRoute for Spring/Go/Node/Rust;
  client also reuses auth helpers. Library is bundled, not a running release.
- `auth` values in all five app charts; client `runtimeConfig` and `healthPath`.
- Removed proxy-owned app middleware/policy ConfigMap; exact five OAuth controls
  and GET/HEAD `/oauth2/static` remain. `/oauth2/auth` is never publicly proxied.
- Shared tests use real Traefik Gateway/CRD providers, stock proxy, Redis and a
  static origin. `scripts/fixtures/{kubernetes_api,spa_origin}.py` are test servers,
  not production plugins. Kubernetes fixture does not validate API admission.
- Library changes require version/dependency/lock bumps; source app Chart.yaml
  versions remain placeholders. Release workflow computes actual chart versions.

### Modules

- `setup_app_forwardauth.deployment_config` directly exports `{release_name, auth}`;
  Service name is explicit via `fullnameOverride`, no Kubernetes policy readback.
- The central proxy chart pin is deliberately still **5.0.0** for cutover.
  It is explicitly configured with `cookieName = "__Host-session"` so the new app
  middleware works before old proxy-owned middleware is removed.
- Hello publishes app AKV `forward-auth-config` and separate public
  `client-runtime-config` via deployment secrets with scoped deploy read access.
- `create_app_namespace` grants namespace-only `traefik.io/middlewares` management.
- Ingress opt-in `enable_index_config`; logging `faro_client_hostnames` and
  `faro_client_path` plus exact collector HTTPRoute.
- New Cooking module retains backend bootstrap URLs, but its old deployment
  script still needs conversion to `.auth`. Keep p07 Cooking on its current pin.

### Skeleton

- Deletes EnvironmentController/config DI/bootstrap fetch and old backend URL
  variables; adds runtime global/marker and static-only nginx serving.
- Deploy reads `.auth` and passes the same object to both charts; passes public
  runtime JSON to client. Both Helm upgrades reset values and supply intended
  settings, removing old filter configuration. Client probes `/index.html`.
- Lightweight test fixture mocks gateway identity/profile/config and uses real
  backend JWT/CSRF checks. Sixteen Playwright tests passed.

### p07

- Snapshot records previously applied platform/Hello **v-92**, Cooking **v-91**
  with `retain_spa_redirects = true`, and shared Redis/Gateway inputs.
- Preserves Observatory pin `4dd25c137fb284c95336b0d16bbc273854274e5e` and
  `reinstall_generation = "initial"`. Do not apply unrelated Observatory work.
- Netcup auth helper has bounded curl timeouts/retries and expiry reporting.
- Newest plugin/runtime-config/Faro model has **not** been applied. See saved
  `docs/ui-auth-rollout-status.md` on the p07 branch.

## Continue in this order

1. Review/merge chart PR #22 only with user authorization. Verify published chart
   versions/artifacts; do not guess version numbers. Existing Hello's deployment
   script still expects old filters and must not deploy against the new charts.
2. Prepare module and Skeleton PRs from their saved branches. Review CI and the
   dependency order. Publish module changes only when matching charts exist.
3. Prepare p07 against verified released module refs: enable index plugin, add
   Hello to `faro_client_hostnames`, and set Hello's absolute same-origin log URL
   using the logging `faro_client_path`. Keep other apps' compatible refs.
4. With explicit approval, provision the proxy reference, namespace permissions,
   fixed cookie and plugin/Faro prerequisites while retaining proxy chart 5.
   Coordinate removing the old environment exclusion with the new client/server
   cutover; current bootstrap/old tabs can fail during an uncoordinated transition.
5. Deploy app-owned middleware and updated Hello charts/images, with old Helm
   filter values discarded. Verify deep links, roles/CSRF, profile and telemetry.
6. Only after no live routes reference old middleware, advance the central proxy
   chart pin to the verified new release that removes legacy policy resources.
   This must not strand Cooking or any other unconverted consumer.

The previously reported Faro CORS error was not reproducible in the live probe
(OPTIONS 204 / POST 202); same-origin collection is a tested pending design,
not an already-deployed fix.

## Verification and known limits

- Chart PR latest CI passed: 5 app charts, 3 modes, 68 rejected invalid configs,
  package portability, root/nested routing, auth/header isolation and injection.
- Terraform fmt and validation passed for auth, Hello, Cooking, ingress and
  logging modules. p07 snapshot `terraform validate` passed; no new apply ran.
- Skeleton Angular production build, JVM test-profile package and 16 Playwright
  tests passed earlier on this implementation. Native build remains a CI check.
- Test TypeScript checking passed with `--moduleResolution node16 --module Node16`;
  repository test tsconfig's old `node` resolution is rejected by current tsc.
- Earlier routes passed real server dry-run; the latest revised dry-run attempt
  was blocked by private cluster connectivity. Real Traefik test-provider checks
  passed. Renew Twingate/Azure/Netcup access if needed for operator validation.
- Standard chart commands after checkout:

  ```sh
  helm dependency build charts/oauth2_proxy_forwardauth
  python3 scripts/build_app_dependencies.py
  python3 scripts/check_app_common.py
  python3 scripts/check_forwardauth.py
  python3 scripts/check_forwardauth_login.py
  python3 scripts/check_spa_frontend.py
  ```

- For app validation, use the repository's Podman/test workflow. Temporary JVM
  runner/images were also used for fast local validation; they are not production
  dependencies and need not survive a fresh session.

## Preserve boundaries

Never commit or expose Terraform state/plans, kubeconfigs, secrets, `.terraform`
or provider lock/cache artifacts. No authorization to apply/destroy/reinstall is
implied by this handoff. During earlier Hello cleanup, duplicate Microsoft Graph
tracking was removed from state rather than destroying the shared principal;
`use_existing = true` does not make provider deletion safe. Preserve data/PVCs,
API registrations/roles, workload identity and namespace boundaries.
