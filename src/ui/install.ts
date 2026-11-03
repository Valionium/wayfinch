// Installing the app (spec section 9.4): Android's Install button where the browser offers one, and the iPhone's ask to add the app
// to the home screen first. Both only say so; neither blocks anything.
import { signal } from '@preact/signals';

type InstallEvent = Event & { prompt: () => Promise<unknown> };

/** The browser's offer to install, kept until it is used. Null without one: then there is no Install button. */
export const installOffer = signal<InstallEvent | null>(null);

let listening = false;
/** Once per page, early: the browser fires `beforeinstallprompt` once, soon after the page loads. */
export function listenForInstall(target: Pick<Window, 'addEventListener'> = window): void {
  if (listening) return;
  listening = true;
  target.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    installOffer.value = event as InstallEvent;
  });
  target.addEventListener('appinstalled', () => { installOffer.value = null; });
}

/** Shows the browser's own install question. The offer is used up either way. */
export async function promptInstall(): Promise<void> {
  const offer = installOffer.value;
  if (!offer) return;
  installOffer.value = null;
  try {
    await offer.prompt();
  } catch {
    // The browser declined to ask again; nothing to tell.
  }
}

export type DeviceFacts = { userAgent: string; maxTouchPoints: number; platform: string; standalone: boolean | null };

/**
 * True on an iPhone or iPad in a browser tab, where the home-screen app has storage of its own and a tab's can be cleared
 * (section 9.4). False when it is the installed app, and also when the page can't tell (`standalone` null): then no one is asked.
 */
export function askForHomeScreen(d: DeviceFacts): boolean {
  const apple = /iPhone|iPad|iPod/.test(d.userAgent) || (d.platform === 'MacIntel' && d.maxTouchPoints > 1);
  return apple && d.standalone === false;
}
