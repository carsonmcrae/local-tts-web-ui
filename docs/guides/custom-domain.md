# Pointing ttsnative.com at the website

The website is built and deployed by `.github/workflows/pages.yml`. Until the domain is connected it
is served at `https://carsonmcrae.github.io/ttsnative/`. The build reads the address from GitHub
Pages (`configure-pages`), so once the custom domain is set, the canonical URL, social-preview links,
`sitemap.xml` and `robots.txt` switch to `https://ttsnative.com/` on the next deploy. No code change
is needed.

**State on 2026-10-20:** `ttsnative.com` uses GoDaddy's nameservers (`ns73`/`ns74.domaincontrol.com`)
and still resolves to GoDaddy's parking page (`3.33.130.190`, `15.197.148.33`); `www` is a CNAME to the
apex. Nothing below has been done yet. The DNS steps need the registrar account, so they are manual.

Do the steps in order. Setting the custom domain in GitHub before DNS points at GitHub breaks the
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
