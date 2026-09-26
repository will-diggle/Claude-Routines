import { recordPendingAcceptance, requireSession, type Account } from './auth';

// One session lookup per page, shared by every component that needs to know
// who's reading (brief, selectors, profile panel). Importing this module
// enforces the login gate, so only gated pages should import it.
export const accountReady: Promise<Account> = requireSession();

// A new account's Terms/Privacy agreement is recorded once it's signed in.
accountReady.then(({ session }) => {
  if (session) recordPendingAcceptance(session).catch(() => {});
});
