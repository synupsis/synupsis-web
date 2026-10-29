/**
 * Tells the viewer how the recaps they unlocked ended: a system notification
 * while the tab is hidden, a toast otherwise. Only asks for permission when the
 * viewer unlocks a recap, which is when the notice matters to them.
 */
export function useRecapNotices() {
  function askPermission() {
    if (!import.meta.client || !('Notification' in window) || Notification.permission !== 'default') return;
    void Notification.requestPermission().catch(() => undefined);
  }

  /** Whether a system notification was shown instead of an in-page notice. */
  function notifyWhileHidden(title: string, body: string) {
    if (!import.meta.client || !document.hidden) return false;
    if (!('Notification' in window) || Notification.permission !== 'granted') return false;
    try {
      const notification = new Notification(title, { body, icon: '/pwa/icon-192.png', tag: 'synupsis-recap' });
      notification.onclick = () => {
        window.focus();
        notification.close();
      };
      return true;
    } catch {
      // Some mobile browsers only notify through a service worker.
      return false;
    }
  }

  return { askPermission, notifyWhileHidden };
}
