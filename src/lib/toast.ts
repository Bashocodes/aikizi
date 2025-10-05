/**
 * Simple toast notification system
 * Uses native browser alerts for now - can be upgraded to a toast library later
 */

export const toast = {
  success(message: string) {
    console.log('[toast] success:', message);
    if (typeof window !== 'undefined') {
      const event = new CustomEvent('toast', {
        detail: { type: 'success', message }
      });
      window.dispatchEvent(event);
    }
  },

  error(message: string) {
    console.error('[toast] error:', message);
    if (typeof window !== 'undefined') {
      const event = new CustomEvent('toast', {
        detail: { type: 'error', message }
      });
      window.dispatchEvent(event);
    }
  },

  info(message: string) {
    console.log('[toast] info:', message);
    if (typeof window !== 'undefined') {
      const event = new CustomEvent('toast', {
        detail: { type: 'info', message }
      });
      window.dispatchEvent(event);
    }
  }
};
