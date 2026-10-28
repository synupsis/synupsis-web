// Stories lock the page underneath. Locks are counted rather than each
// restoring what it found: two stories overlapping (one closing as another
// opens) can never leave the page locked by restoring a stale "hidden".
let locks = 0;

/** Stops the page from scrolling; the returned function gives it back, once. */
export function lockPageScroll(): () => void {
  const root = document.documentElement;
  if (locks === 0) {
    // The scrollbar's width is kept so the page does not shift.
    const scrollbarWidth = window.innerWidth - root.clientWidth;
    root.style.overflow = 'hidden';
    if (scrollbarWidth > 0) root.style.paddingRight = `${scrollbarWidth}px`;
  }
  locks += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    locks = Math.max(0, locks - 1);
    if (locks === 0) {
      root.style.overflow = '';
      root.style.paddingRight = '';
    }
  };
}
