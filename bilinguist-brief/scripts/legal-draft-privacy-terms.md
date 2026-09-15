# Bilinguist Brief — Finalized Privacy Policy & Terms Draft

Grounded in the current codebase (branch `claude/pills-audio-verified`). Replaces the placeholder/DRAFT text in `src/screens/LegalDocModal.tsx`. A solicitor's review isn't required by Apple or by law to publish this — see the open items at the bottom for what's still worth double-checking yourself.

---

## Privacy Policy

### 1. Who We Are
Bilinguist Brief is operated by William Diggle, an individual based in the United Kingdom ("we," "us," "our"). We are the data controller for the personal data described in this policy.

Contact: support@bilinguistbrief.com

### 2. What Data We Collect

**Account data (via Supabase Authentication):**
- Your email address (for email sign-up) or identifiers provided by Apple/Google if you sign in that way.
- Your name, only if you sign in with Apple or Google and choose to share it — used for display purposes only.
- A unique account ID, generated automatically.

**App activity data (stored against your account):**
- Your reading streaks, per language, and the dates you have read a briefing.
- Practice game scores and completion history.
- Streak freeze usage.
- Your language, level, and topic preferences.

Words you look up or save (via our analytics provider — see Section 3) — including the specific word, the language, and your proficiency level.

If you save a word to your personal word bank — including its translation, explanation, example sentence, and your practice progress — this is stored locally on your device only. We do not receive or store your word bank on our servers.

Location (optional): if you grant permission, we use your approximate location, in-memory only, to show local weather and to determine your city name in your chosen language. This is never stored on our servers or your device beyond the current app session.

We do not collect your precise location for any other purpose, and we do not store your device timezone.

### 3. Third Parties We Share Data With
We use a small number of service providers to run the App. None of them are permitted to use your data for their own purposes beyond providing their service to us.

- **Supabase** — hosts your account and app activity data described in Section 2. Supabase's infrastructure may be located outside the UK; see Section 9 for how we handle this.
- **PostHog (EU-hosted analytics)** — receives app usage events, including which words you tap, save, or look up, your subscription status, and general app usage (screens viewed, games played, streaks). If you're signed in, this is linked to your account using your email address and display name (if set); if not signed in, an anonymous device identifier is used instead.
- **RevenueCat** — processes your subscription and purchase status to manage your Premium subscription (see Section 5 of our Terms of Service). Your account ID is used to link your subscription to your account across devices.
- **Google Gemini** — used only in our backend content pipeline to help write briefings. No personal user data is sent to Gemini.
- **Anthropic (Claude)** — when you tap a word for an explanation, the word, surrounding sentence, language, and your CEFR level are sent to Anthropic to generate an explanation. No account ID or other identifying information is included in this request.
- **Google Translate API** — when you look up a word, the word and source language are sent to Google to provide a translation and a per-word audio pronunciation. No personal data is included in this request.
- **Open-Meteo** — if you grant location permission, your approximate coordinates are sent to Open-Meteo to retrieve local weather. Not stored by us.
- **OpenStreetMap (Nominatim)** — if you grant location permission, your approximate coordinates are sent to OpenStreetMap's Nominatim service to determine your city name in your chosen language, for display in your weather strip. Not stored by us.
- **Apple** — provides Sign in with Apple authentication and processes your Premium subscription payment directly; we do not see or store your payment details (card numbers, etc.) — only your subscription/entitlement status via RevenueCat, above.

### 4. Legal Basis for Processing (UK GDPR)
We process your data on the following bases: performance of a contract (to provide the App and, once available, your subscription), legitimate interests (to understand app usage and improve the service), and consent (for optional features such as location access and marketing communications).

### 5. Marketing Communications
We do not currently send marketing emails. Emails you receive from us are limited to account-related and transactional messages — for example, confirming an action you've taken in the App, or responding to a support request. If we introduce optional marketing communications in future, we will only do so with your clear opt-in consent, and every marketing email will include an unsubscribe link that you can use to withdraw consent at any time.

### 6. Children's Privacy
The App is intended for users aged 13 and over. We do not knowingly collect more personal data from users under 18 than is necessary to provide the App, and we do not use profiling or targeted advertising directed at users under 18. The App does not currently include any social, friends, or messaging features. If we introduce a friends or social feature in future, we will update this policy in advance to describe how it works and what, if any, additional data it involves.

### 7. Data Retention
Account and app activity data is retained for as long as your account is active. Reading history is retained without a fixed time limit while your account remains active, as it directly supports the streak and progress features of the App.

You can delete your account at any time directly in the App (Settings → Account Settings → Delete account). This immediately and permanently deletes your account, reading history, and streak data from our servers. Your saved word bank is stored only on your device and is not affected by server-side account deletion.

If you contact us at support@bilinguistbrief.com to request deletion instead of using the in-app option, we will delete your personal data within 30 days.

Our payment processor (Apple, via RevenueCat) may retain transaction records for longer, as required by law for financial and tax record-keeping purposes — this is outside our control.

### 8. Your Rights
Under UK GDPR, you have the right to:
- Access the personal data we hold about you;
- Request correction of inaccurate data;
- Request deletion of your data;
- Request a copy of your data in a portable format;
- Object to or restrict certain processing;
- Withdraw consent at any time where processing is based on consent.

To exercise any of these rights, contact us at support@bilinguistbrief.com. You also have the right to complain to the Information Commissioner's Office (ICO) if you believe we have not handled your data properly.

### 9. International Data Transfers
Some of our service providers, including those listed in Section 3, may process your data outside the UK — for example, in the United States or the EU. Where this happens, we rely on legally recognised safeguards, such as the UK's International Data Transfer Agreement, Standard Contractual Clauses, or the receiving country's UK adequacy status, to ensure your data continues to receive an equivalent level of protection. Contact us if you would like details of the specific safeguard used for a given provider.

### 10. Security
Data is encrypted in transit (HTTPS) and at rest, using Supabase's built-in security features, including row-level security policies that ensure your data is only ever accessible to your own account. Access to our systems is restricted to us as the App's sole developer. We do not share access with any party beyond the service providers listed in Section 3.

### 11. Changes to This Policy
We may update this policy from time to time. If we make material changes, we will notify you by email or an in-app notice, and update the "last updated" date above.

### 12. Contact Us
If you have questions about this policy or how your data is handled, please contact us at support@bilinguistbrief.com.

---

## Terms of Service

### 1. Acceptance of These Terms
By creating an account or using Bilinguist Brief (the "App"), you agree to these Terms of Service. If you do not agree, please do not use the App.

You must be at least 13 years old to create an account. If you are under 18, you confirm you have your parent or guardian's permission to use the App.

### 2. Description of the Service
Bilinguist Brief provides daily, AI-generated multilingual news briefings written at your chosen language proficiency level (CEFR A1–C2, plus a Native journalism tier), along with vocabulary tools including tap-to-translate, flashcards, and language practice games.

All briefing content is original writing, generated by AI based on publicly available facts and current events. Briefings are not reproductions of any third-party news article, and the App does not claim affiliation with, or endorsement by, any news outlet.

The App may include coverage of real-world events, including difficult or distressing subject matter (for example, conflict, disasters, or loss of life), as this reflects genuine current affairs. Please use discretion, particularly for younger users.

### 3. Accuracy of Content
While we aim for factual accuracy, briefings are generated by AI and rewritten for language-learning purposes. We do not guarantee that any briefing is complete, current, or free of error, and the App should not be relied upon as your sole source of news or as professional, medical, legal, or financial advice.

### 4. Accounts
- You are responsible for maintaining the confidentiality of your account credentials.
- You agree to provide accurate information when creating an account.
- Each account is intended for a single individual; do not share your account or create accounts on behalf of others without permission.
- You may delete your account at any time in the App (Settings → Account Settings → Delete account), or by contacting support@bilinguistbrief.com. See our Privacy Policy for details on what happens to your data on deletion.

### 5. Subscriptions & Billing
Bilinguist Brief offers a free tier and a paid subscription tier ("Premium"), sold and billed through the Apple App Store. The following terms apply, subject to change and to the specific terms shown in the App's paywall screen and App Store listing at the time you subscribe:
- Free tier and Premium tier offer different limits on languages, briefing length, CEFR levels, and daily word lookups/saves, as described in the App at the time. Streak tracking and streak freezes remain free for all users regardless of tier.
- Premium is priced at £3.79 per month in the UK (or the then-current local price shown in the App and App Store listing for your region).
- There is currently no free trial — payment is charged to your Apple ID account at the time of purchase.
- Subscriptions automatically renew each month unless cancelled at least 24 hours before the end of the current billing period. You can manage or cancel your subscription at any time via your Apple ID account settings. Cancellation takes effect at the end of the current billing period; we do not provide partial refunds for unused time.
- We may change subscription pricing from time to time. Any price change will be communicated in advance in accordance with Apple's standard price-change notification process, and will not affect your current billing period.

### 6. Acceptable Use
When using the App, you agree not to:
- Impersonate another person, or use a username intended to mislead or deceive other users;
- Scrape, reverse engineer, decompile, or attempt to extract the App's source code, prompts, or underlying data;
- Use automated means (bots, scripts) to access or interact with the App;
- Harass, abuse, or attempt to repeatedly contact another user against their wishes;
- Attempt to gain unauthorized access to any part of the App, its data, or other users' accounts.

We reserve the right to suspend or terminate any account that violates these terms.

### 7. Intellectual Property
The App, including its design, branding, software, and all briefing content, is owned by William Diggle ("we," "us") or our licensors. You may use the App for personal, non-commercial language learning only. You may not copy, redistribute, publicly republish, or create derivative works from briefing content or any other part of the App without our prior written permission.

### 8. Limitation of Liability
The App is provided "as is" without warranties of any kind, express or implied. To the fullest extent permitted by law, we are not liable for any indirect, incidental, or consequential damages arising from your use of the App, including but not limited to reliance on briefing content, service interruptions, or data loss. Nothing in these Terms excludes liability that cannot be excluded under applicable law.

### 9. Termination
You may stop using the App and delete your account at any time. We may suspend or terminate your access to the App if we reasonably believe you have violated these Terms, engaged in abusive behaviour, or if required to do so by law.

### 10. Governing Law
These Terms are governed by the laws of England and Wales. Any disputes arising from these Terms or your use of the App will be subject to the exclusive jurisdiction of the courts of England and Wales.

### 11. Changes to These Terms
We may update these Terms from time to time. If we make material changes, we will notify you by email or an in-app notice. Continued use of the App after changes take effect constitutes acceptance of the updated Terms.

### 12. Contact Us
If you have any questions about these Terms, please contact us at support@bilinguistbrief.com.

---

## Real bugs found while grounding this draft (not fixed, flagging for you)

1. **Account deletion doesn't clear the local word bank.** The in-app confirmation alert (`SettingsScreen.tsx`) promises deletion of "reading history, streaks, and word bank," but `performDeleteAccount()` never touches `useWordBankStore` (AsyncStorage-only). Either clear it on deletion, or soften the alert copy.
2. **`record-acceptance` Edge Function is built but never called.** It's what would stamp `terms_version`/`privacy_version` on your `user_profiles` row and send a confirmation email — currently zero references to it in the app frontend, so you have no actual record of anyone accepting these terms.
3. **The old draft described a "friends feature" and a marketing-email opt-in checkbox that don't exist anywhere in the app** — both removed from this draft.

## Still needs your/legal confirmation before publishing
- Effective date (both docs currently say `[INSERT PUBLICATION DATE]`)
- Supabase's actual data-centre region (not discoverable from code — check the Supabase dashboard)
- Exact international-transfer mechanism per vendor (used generic "legally recognised safeguards" language instead of naming one)
- Solicitor sign-off, if you decide you want one (not an Apple/legal requirement — your call)
