// A public page address, /u/<handle>: the rule the database checks on public_profile.handle.
export const PROFILE_HANDLE_PATTERN = /^[a-z0-9][a-z0-9_-]{1,29}$/;
export const PROFILE_NAME_MAX_LENGTH = 80;
export const PROFILE_BIO_MAX_LENGTH = 160;

/** Normalize the address from a profile URL before looking it up. */
export function normalizeProfileHandle(value: string): string {
  return value.trim().toLowerCase();
}

export function isProfileHandle(value: string): boolean {
  return PROFILE_HANDLE_PATTERN.test(value);
}
