# Single-instance proxy review (20 October 2026)

**Decision: keep oauth2-proxy per application for now.** The user explicitly
chose this after reviewing the limits below. Sharing Helm templates is independent
of sharing the runtime proxy.

Reviewed a fresh clone of upstream v7.15.5 (`bea3f04b`) and compared deployed
baseline v7.15.2. The latest published upstream release at review was v7.15.5.

- One instance can protect several hostnames using one OAuth client/configuration.
- Both versions initialize `providers.NewProvider(opts.Providers[0])`;
  multiple-provider selection is still incomplete ([issue 926](https://github.com/oauth2-proxy/oauth2-proxy/issues/926)).
- Sessions contain one access token, ID token and refresh token; refresh uses
  that provider's client. There is no host-to-API-audience token selection/cache.
- Microsoft token redemption requests one resource's scopes plus OIDC scopes.
  A Hello API token cannot be used as a Cooking API token. Per-app assignments
  also do not automatically survive replacement with one shared Web client.
- A path-only callback can derive its hostname from trusted forwarded metadata.
  Per-app callbacks registered on one Web client could preserve host-only cookies.
  Root and auth-only checks support configured group/email restrictions, but
  these do not select a different API token.

A truly shared proxy would require an explicitly approved shared API audience
with app-specific roles, or a different trusted-header identity architecture.
Neither was approved. Do not relax backend audience validation or replace
per-app registrations to achieve consolidation.

If revisited, the existing `traefik` namespace is a suitable shared edge-service
location: it owns the Gateway/TLS secret, while the k3s controller is in
`kube-system`. The official upstream Helm chart could replace our wrapper if
Terraform owns the remaining narrow OAuth routes/configuration. Grafana's
separate full reverse proxy would also need conversion. No such deployment ran.

Targeted upstream tests passed in Go 1.26: callback URI derivation, root/auth-only
group restrictions, auth-only email and email-domain restrictions.

Sources:
- [Provider selection](https://github.com/oauth2-proxy/oauth2-proxy/blob/v7.15.5/oauthproxy.go#L140)
- [Incomplete multi-provider support](https://github.com/oauth2-proxy/oauth2-proxy/blob/v7.15.5/pkg/apis/options/providers.go#L56-L60)
- [Session token fields](https://github.com/oauth2-proxy/oauth2-proxy/blob/v7.15.5/pkg/apis/sessions/session_state.go#L16-L23)
- [Callback URI handling](https://github.com/oauth2-proxy/oauth2-proxy/blob/v7.15.5/oauthproxy.go#L1135-L1156)
- [Microsoft token redemption](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow#redeem-a-code-for-an-access-token)
