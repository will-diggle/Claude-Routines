# Supabase Auth email templates

Branded replacements for Supabase's default auth emails. They aren't served by
the website — paste each one into **Supabase → Authentication → Email
Templates**. `{{ .ConfirmationURL }}`, `{{ .Email }}` and `{{ .NewEmail }}` are
Supabase's own placeholders; leave them as they are.

| Supabase template | File | Subject |
|---|---|---|
| Confirm signup | `confirm-signup.html` | Confirm your Bilinguist Brief account |
| Reset password | `reset-password.html` | Reset your Bilinguist Brief password |
| Magic link | `magic-link.html` | Your Bilinguist Brief sign-in link |
| Change email address | `change-email.html` | Confirm your new email address |

They load the masthead from `https://bilinguistbrief.com/masthead/white.jpg`, so
keep that file in `public/masthead/`.

Send them through Resend (custom SMTP) so they come from
`Bilinguist Brief <noreply@bilinguistbrief.com>` rather than Supabase's shared
sender, which also adds its own footer.
