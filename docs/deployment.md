# Automatic publishing with Cloudflare Pages

Connect this GitHub repository to Cloudflare Pages once. After that, pushes to
`main` automatically build and publish the site. This uses Cloudflare's GitHub
integration; no deployment token or GitHub Actions workflow is needed.

1. Sign in at https://dash.cloudflare.com/ and open **Workers & Pages**.
2. Create a **Pages** project and select **Connect to Git** (or **Import an
   existing Git repository**). Do not choose the Workers deployment flow.
3. Connect GitHub and grant access to
   `longxingzhongdao930-lgtm/samurai-mobile`.
4. Select the repository and enter these build settings:

   | Setting | Value |
   | --- | --- |
   | Project name | `samurai-mobile` (the name in `wrangler.toml`) |
   | Production branch | `main` |
   | Framework preset | Vite, or None with the explicit settings below |
   | Build command | `npm test && npm run build` |
   | Build output directory | `dist` |
   | Root directory | Repository root (leave blank) |

5. Save and deploy. Cloudflare displays the actual `pages.dev` URL after the
   deployment succeeds. Use that URL; a project name alone does not prove that
   a URL exists. If the name is unavailable, choose another and update the
   `name` field in `wrangler.toml` to match.

`.node-version` selects Node.js 24. The committed npm lockfile controls dependency
versions. The build runs the character/animation checks before producing the
static site. There is no application backend or runtime secret to configure.

The first GitHub authorization and project connection must be completed by the
Cloudflare account owner. A Git push alone does not create this connection.
Subsequent successful builds update the same production URL automatically.

Model credits and asset licenses are linked from the game's character menu.
See `docs/characters.md` before using the supplied models commercially.

The production project is `samurai-mobile.pages.dev`. Its root opens the
**黒雨の城下町** trial. The title links to the six-character playground at `?dev`.
Both modes deploy together from `main`.
