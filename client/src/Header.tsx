import { useQuery } from '@tanstack/react-query';
import { fetchJson, userInfoSchema } from './api';

export function Header() {
  const { data } = useQuery({ queryKey: ['profile'], queryFn: ({ signal }) => fetchJson('/oauth2/userinfo', userInfoSchema, { signal }) });
  const name = (data?.additionalClaims?.name ?? data?.preferredUsername ?? data?.email)?.trim();
  const initials = name?.split(/\s+/).map(part => part[0]).join('').toUpperCase();
  return <header className="topbar">
    <a href="/">Skeleton App</a>
    {name && <details className="profile">
      <summary role="button" aria-label={initials}>{initials}</summary>
      <div className="profile-name">{name}</div>
    </details>}
  </header>;
}
