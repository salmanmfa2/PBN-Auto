export type LandingUiMode = 'legacy' | 'alternative';

export const LANDING_UI_STORAGE_KEY = 'pbn.landing.ui';
export const LANDING_UI_CHANGED_EVENT = 'pbn:landing-ui-changed';

export function getLandingUiMode(): LandingUiMode {
  try {
    return window.localStorage.getItem(LANDING_UI_STORAGE_KEY) === 'alternative'
      ? 'alternative'
      : 'legacy';
  } catch {
    return 'legacy';
  }
}

export function setLandingUiMode(mode: LandingUiMode): void {
  try {
    window.localStorage.setItem(LANDING_UI_STORAGE_KEY, mode);
  } catch {
    // The selected page still works for the current session when storage is unavailable.
  }
  window.dispatchEvent(
    new CustomEvent<LandingUiMode>(LANDING_UI_CHANGED_EVENT, { detail: mode }),
  );
}

export function setSessionLandingUiMode(mode: LandingUiMode): void {
  window.dispatchEvent(
    new CustomEvent<LandingUiMode>(LANDING_UI_CHANGED_EVENT, { detail: mode }),
  );
}
