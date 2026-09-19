import { useEffect } from 'react';
import { Linking } from 'react-native';
import { useFriendsStore } from '../store/useFriendsStore';

const INVITE_PREFIX = 'bilinguistbrief://friend-invite/';

function extractToken(url: string): string | null {
  if (!url.startsWith(INVITE_PREFIX)) return null;
  const token = url.slice(INVITE_PREFIX.length).split(/[?#]/)[0].trim();
  return token || null;
}

// Catches bilinguistbrief://friend-invite/<token> (both while the app is
// running and on cold start), the same way useAuthDeepLink.ts catches
// bilinguistbrief://auth — a sibling hook rather than folded into that one,
// since this has nothing to do with auth (redemption itself needs a signed-
// in user, which FriendsScreen enforces by showing SignInRequiredScreen).
// Opens the Friends screen and hands it the token; FriendsScreen redeems it
// once a session is present.
export function useFriendInviteDeepLink() {
  useEffect(() => {
    function handleUrl(url: string) {
      const token = extractToken(url);
      if (token) useFriendsStore.getState().show({ redeemToken: token });
    }
    Linking.getInitialURL().then((url) => { if (url) handleUrl(url); }).catch(() => {});
    const sub = Linking.addEventListener('url', ({ url }) => handleUrl(url));
    return () => sub.remove();
  }, []);
}
