// The links to the three legal pages (spec sections 3.5 and 10). They are plain pages of the site, precached by the worker, so they
// open in flight mode. They are ordinary links, not routes: the page is served by the site itself.
import { Y } from '../../core/wording/en-you.ts';
import { Card } from '../card.tsx';

export const LEGAL_PAGES = [
  { href: '/legal/imprint.html', label: Y.youImprint },
  { href: '/legal/privacy.html', label: Y.youPrivacy },
  { href: '/legal/licences.html', label: Y.youLicences },
] as const;

export function LegalLinks() {
  return (
    <Card title={Y.youLegalTitle}>
      <ul class="you-legal" data-legal-links>
        {LEGAL_PAGES.map((page) => <li key={page.href}><a class="btn" href={page.href}>{page.label}</a></li>)}
      </ul>
      <p class="muted">{Y.youLegalNote}</p>
    </Card>
  );
}
