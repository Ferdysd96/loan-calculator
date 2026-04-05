/**
 * Notificaciones toast en la esquina inferior.
 */

const DEFAULT_DURATION_MS = 4200;

/**
 * @param {HTMLElement | null} toastRegion
 * @param {{ durationMs?: number }} [options]
 * @returns {(message: string, opts?: {
 *   title?: string,
 *   variant?: 'success' | 'error',
 *   durationMs?: number,
 *   actionLabel?: string,
 *   onAction?: () => void
 * }) => void}
 */
export function createShowToast(toastRegion, options = {}) {
  const defaultDurationMs = options.durationMs ?? DEFAULT_DURATION_MS;

  return function showToast(message, opts = {}) {
    if (!toastRegion) return;
    const variant = opts.variant === 'error' ? 'error' : 'success';
    const durationMs = typeof opts.durationMs === 'number' ? opts.durationMs : defaultDurationMs;
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

    let timeoutId = 0;
    const removeEl = () => {
      window.clearTimeout(timeoutId);
      el.classList.remove('toast--visible');
      el.classList.add('toast--leaving');
      window.setTimeout(() => {
        el.remove();
      }, 320);
    };

    if (opts.actionLabel && typeof opts.onAction === 'function') {
      const actions = document.createElement('div');
      actions.className = 'toast__actions';
      const actionBtn = document.createElement('button');
      actionBtn.type = 'button';
      actionBtn.className = 'toast__action-btn';
      actionBtn.textContent = opts.actionLabel;
      actionBtn.addEventListener('click', () => {
        opts.onAction();
        removeEl();
      });
      actions.appendChild(actionBtn);
      el.appendChild(actions);
    }

    toastRegion.appendChild(el);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => el.classList.add('toast--visible'));
    });
    timeoutId = window.setTimeout(removeEl, durationMs);
  };
}
