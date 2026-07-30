// Emails allowed to see the in-app Analytics screen. Comma-separated via env
// so it can be changed without a code change/App Store review; falls back to
// the one hardcoded owner email so it's never accidentally empty in a build
// where the env var wasn't set.
const envList = (process.env.EXPO_PUBLIC_ADMIN_EMAILS ?? '')
  .split(',')
  .map((s: string) => s.trim().toLowerCase())
  .filter(Boolean);

const DEFAULT_ADMIN_EMAILS = ['williamdiggz@gmail.com'];

export const ADMIN_EMAILS = envList.length > 0 ? envList : DEFAULT_ADMIN_EMAILS;

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.toLowerCase());
}
