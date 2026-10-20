# Domain options (to revisit)

**Status: bought 2026-10-19.** The owner bought `hackamatch.com` on Cloudflare Registrar (about $10.46 a year, same price on renewal, auto-renew on). The app and its email now use it; setup steps are in [`../runbooks/deploy.md`](../runbooks/deploy.md) §1 and §3.4. Until then (decided 2026-10-14) the app ran on `hackamatch.vercel.app`, which still works. The notes below are kept for reference.

Prices below are typical figures from memory, **not checked** on 2026-10-14. Check the registrar's page, including the renewal price, before buying. Buying a domain is a charge and needs the owner's approval.

## What `vercel.app` covers and what it does not

- **Covers:** hosting the site with HTTPS, at no cost. Every Phase C step except the email domain.
- **Does not cover email.** Resend sends only from a domain whose DNS records you control (SPF, DKIM, DMARC), and nobody but Vercel controls `vercel.app`. Without a verified domain, Resend's test sender (`onboarding@resend.dev`) delivers only to the Resend account's own address.
- **What that means for P1-20:** sign-in emails, and the interested and mutual emails, cannot reach students. The owner can still test end to end if the Resend account is registered with their own `@cornell.edu` address. The acceptance criterion "emails land in a Cornell Outlook inbox, not spam" can only be judged with a real domain, because the test sender's reputation is not ours.
- **Changing later:** add the domain in Vercel → Settings → Domains, then update `APP_URL` in Vercel and the Site URL and redirect list in Supabase (runbook steps 2.4 and 3.2), then redeploy. Already-sent emails link to the old address; it keeps working because Vercel serves the project on both.

## Typical yearly prices by ending

| Ending | Usual price | Notes |
| --- | --- | --- |
| `.com` | $10–12 | Most familiar; short names are mostly taken |
| `.app` / `.dev` | $12–20 | Fits a web app; browsers require HTTPS, which Vercel provides |
| `.org` | $10–15 | Reads as a nonprofit or community project |
| `.io` | $35–60 | Popular with startups, noticeably pricier |
| `.xyz`, `.site` and others | $1–3 for year one | Renewals jump, often to $15–30 |

## Registrars

| Registrar | For | Watch for |
| --- | --- | --- |
| Cloudflare Registrar | Wholesale price, no markup; renewals cost the same as year one | DNS must be on Cloudflare too (free) |
| Porkbun | Among the cheapest; free privacy protection | Fewer extras |
| Namecheap | Popular, easy; free privacy protection | Year-one discounts, higher renewals |
| Vercel | Bought in the Vercel account; the site's DNS is set up automatically | Around market price; Resend's records still added by hand |
| Squarespace (formerly Google Domains) | Clean interface | Usually a little pricier |
| GoDaddy | Best known | Expensive renewals, many add-on upsells |
| A `cornell.edu` subdomain | Best delivery to Cornell inboxes | Needs Cornell IT's approval; unusual for a student project |

## Before buying

- Compare the **renewal** price, not the first-year price.
- Privacy protection should be free (it is at all of the above except some GoDaddy plans).
- **Buy early.** A new domain has no sending reputation, so Outlook may put its first emails in junk even with every record correct. Buy days or weeks before launch, then send to a few Cornell addresses before any launch-day batch.
- Suggested if a domain is bought: a `.com` or `.app` from Cloudflare or Porkbun, about $10–15 a year.
