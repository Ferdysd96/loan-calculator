/**
 * Notificaciones toast en la esquina inferior.
 */

const DEFAULT_DURATION_MS = 4200;

/**
 * @param {HTMLElement | null} toastRegion
 * @param {{ durationMs?: number }} [options]
 * @returns {(message: string, opts?: { title?: string, variant?: 'success' | 'error' }) => void}
 */
export function createShowToast(toastRegion, options = {}) {
  const durationMs = options.durationMs ?? DEFAULT_DURATION_MS;

  return function showToast(message, opts = {}) {
    if (!toastRegion) return;
    const variant = opts.variant === 'error' ? 'error' : 'success';
    const el = document.createElement('div');
    el.className = `toast toast--${variant}`;
    el.setAttribute('role', 'status');
    if (opts.title) {
      const titleEl = document.createElement('p');
      titleEl.className = 'toast__title';
      titleEl.textContent = opts.title;
      const msgEl = document.createElement('p');
      msgEl.className = 'toast__message';
      msgEl.textContent = message;
      el.append(titleEl, msgEl);
    } else {
      el.textContent = message;
    }
    toastRegion.appendChild(el);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => el.classList.add('toast--visible'));
    });
    window.setTimeout(() => {
      el.classList.remove('toast--visible');
      el.classList.add('toast--leaving');
      window.setTimeout(() => {
        el.remove();
      }, 320);
    }, durationMs);
  };
}
