# The website domain: ttsnative.com

The website is built and deployed by `.github/workflows/pages.yml`. The build reads the address from
GitHub Pages (`configure-pages`), so the canonical URL, social-preview links, `sitemap.xml` and
`robots.txt` follow the custom domain automatically on every deploy. No code change is needed.

**Status (connected on 2026-10-20):** GoDaddy's nameservers are unchanged. The parking record was replaced
with the A and AAAA records below, `www` points at `carsonmcrae.github.io`, and the GitHub verification TXT
record is in place; the existing DMARC and domain-connect records were left as they were. The domain is
verified on the GitHub account (so no one else can publish Pages on it), set as the repository's Pages
domain, and served over HTTPS only, with a Let's Encrypt certificate for `ttsnative.com` and
`www.ttsnative.com` that GitHub renews. `www` and the old `carsonmcrae.github.io/ttsnative/` address
redirect to `https://ttsnative.com/`.

The steps below are how it was set up, and how to set it up again (for example after a registrar move).
Do them in order. Setting the custom domain in GitHub before DNS points at GitHub breaks the
site, because GitHub immediately redirects the `github.io` address to a domain that doesn't serve it
yet.

## 1. Verify the domain with GitHub (prevents takeover)

1. GitHub → your profile **Settings** → **Pages** → **Add a domain** → `ttsnative.com`.
2. GitHub shows a TXT record. Add it at the registrar:

   | Type | Name (host)                           | Value                     | TTL    |
   | ---- | ------------------------------------- | ------------------------- | ------ |
   | TXT  | `_github-pages-challenge-carsonmcrae` | the code GitHub shows you | 1 hour |

3. Wait a few minutes, then click **Verify**. Leave the TXT record in place afterwards.

## 2. Point the domain at GitHub Pages

At the registrar's DNS settings (GoDaddy: **My Products** → `ttsnative.com` → **DNS**):

1. **Remove** the parking records: the two `A @` records (`3.33.130.190` and `15.197.148.33`) and any
   **Forwarding** set up for the domain.
2. **Add** these records (they are GitHub's published Pages addresses):

   | Type  | Name  | Value                   | TTL    |
   | ----- | ----- | ----------------------- | ------ |
   | A     | `@`   | `185.199.108.153`       | 1 hour |
   | A     | `@`   | `185.199.109.153`       | 1 hour |
   | A     | `@`   | `185.199.110.153`       | 1 hour |
   | A     | `@`   | `185.199.111.153`       | 1 hour |
   | AAAA  | `@`   | `2606:50c0:8000::153`   | 1 hour |
   | AAAA  | `@`   | `2606:50c0:8001::153`   | 1 hour |
   | AAAA  | `@`   | `2606:50c0:8002::153`   | 1 hour |
   | AAAA  | `@`   | `2606:50c0:8003::153`   | 1 hour |
   | CNAME | `www` | `carsonmcrae.github.io` | 1 hour |

   `www` must point at `carsonmcrae.github.io` (no repository name, no `https://`). Don't add a
   wildcard (`*`) record.

3. Check from any terminal (changes usually appear within an hour; allow up to 48):

   ```bash
   nslookup ttsnative.com 1.1.1.1
   ```

   ```bash
   nslookup www.ttsnative.com 1.1.1.1
   ```

   The apex should list only the four `185.199.x.153` addresses; `www` should show the
   `carsonmcrae.github.io` alias.

## 3. Set the custom domain on the repository

Repository **Settings** → **Pages** → **Custom domain** → `ttsnative.com` → **Save**, or:

```bash
gh api -X PUT repos/carsonmcrae/ttsnative/pages -f cname=ttsnative.com
```

The workflow deploys with GitHub Actions, so no `CNAME` file is needed in the repository. With the
apex as the custom domain and the `www` CNAME above, GitHub redirects `www.ttsnative.com` to
`ttsnative.com`, and `carsonmcrae.github.io/ttsnative/` to the domain.

## 4. Turn on HTTPS

GitHub requests a certificate once the DNS check passes (the Pages settings show progress; it can take
up to an hour). Then tick **Enforce HTTPS**, or:

```bash
gh api -X PUT repos/carsonmcrae/ttsnative/pages -F https_enforced=true
```

## 5. Redeploy and update links

1. Rebuild so canonical and social URLs use the domain:

   ```bash
   gh workflow run pages.yml --repo carsonmcrae/ttsnative
   ```

2. Check `https://ttsnative.com/`, `https://www.ttsnative.com/` (should redirect), and that the page
   source's `<link rel="canonical">` reads `https://ttsnative.com/`.
3. Set the repository's website to the domain:

   ```bash
   gh repo edit carsonmcrae/ttsnative --homepage https://ttsnative.com
   ```

4. Replace `https://carsonmcrae.github.io/ttsnative/` with `https://ttsnative.com` in `README.md`,
   the profile README and the portfolio.

## Undo

Remove the custom domain in **Settings** → **Pages** (the site returns to the `github.io` address on
the next deploy), then restore the registrar's previous records if needed.
