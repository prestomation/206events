import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { copyFileSync, writeFileSync } from 'fs'
import cityConfig from '../city.config.ts'

// Analytics loader injected into index.html when city.config.ts configures a
// GoatCounter code. Skips PR previews and local dev (same guard the inline
// snippet used before it moved here).
function goatcounterSnippet(code) {
  return `<script>
      // Only load GoatCounter on production, not on PR previews or local dev
      (function() {
        var blocked = ['localhost', '127.0.0.1', 'htmlpreview.github.io'];
        var isPreview = window.location.pathname.indexOf('/preview/') !== -1;
        if (blocked.indexOf(window.location.hostname) === -1 && !isPreview) {
          var s = document.createElement('script');
          s.async = true;
          s.dataset.goatcounter = 'https://${code}.goatcounter.com/count';
          s.src = 'https://gc.zgo.at/count.js';
          document.head.appendChild(s);
        }
      })();
    </script>`
}

export default defineConfig({
  plugins: [
    react(),
    {
      // Substitute %CITY_*% placeholders in index.html from city.config.ts
      // and append the analytics snippet when configured. Runs in dev and
      // build alike.
      name: 'city-config-html',
      transformIndexHtml(html) {
        let out = html
          .replaceAll('%CITY_SITE_NAME%', cityConfig.site.name)
          .replaceAll('%CITY_SITE_DESCRIPTION%', cityConfig.site.description)
          .replaceAll('%CITY_BOOT_LOGO%', cityConfig.site.bootLogoText)
        if (cityConfig.analytics?.goatcounterCode) {
          out = out.replace('</body>', `${goatcounterSnippet(cityConfig.analytics.goatcounterCode)}\n  </body>`)
        }
        return out
      }
    },
    {
      // Preload the font weights the first screen renders (body text +
      // display headings) so the browser fetches them in parallel with the
      // stylesheet instead of discovering them only after the CSS parses —
      // the HTML → CSS → font chain Lighthouse flags. Only a build-time
      // concern: the hashed asset names come from the output bundle, and dev
      // serves fonts un-hashed. Preloading all nine weights would compete
      // with the critical path, so only these three are listed.
      // See docs/lighthouse-performance-plan.md Phase 1b.
      name: 'preload-first-screen-fonts',
      transformIndexHtml: {
        order: 'post',
        handler(_html, ctx) {
          if (!ctx.bundle) return []
          const FIRST_SCREEN_FONTS = [
            /^inter-latin-400-normal-[\w-]+\.woff2$/,
            /^inter-latin-600-normal-[\w-]+\.woff2$/,
            /^inter-tight-latin-700-normal-[\w-]+\.woff2$/,
          ]
          return Object.keys(ctx.bundle)
            .filter((name) => {
              const base = name.split('/').pop()
              return FIRST_SCREEN_FONTS.some((re) => re.test(base))
            })
            .map((name) => ({
              tag: 'link',
              attrs: { rel: 'preload', href: `/${name}`, as: 'font', type: 'font/woff2', crossorigin: true },
              injectTo: 'head',
            }))
        },
      },
    },
    {
      name: 'copy-service-worker',
      writeBundle() {
        try {
          copyFileSync('src/sw.js', '../output/sw.js')
          // The PWA manifest is generated from city.config.ts; everything
          // except the name/short_name is static.
          const manifest = {
            name: cityConfig.site.name,
            short_name: cityConfig.site.name,
            start_url: './',
            display: 'standalone',
            background_color: '#1a1a2e',
            theme_color: '#1a1a2e',
            icons: [
              { src: './icon-192.png', sizes: '192x192', type: 'image/png' },
              { src: './icon-512.png', sizes: '512x512', type: 'image/png' },
            ],
          }
          writeFileSync('../output/manifest.webmanifest', JSON.stringify(manifest, null, 2) + '\n')
        } catch (err) {
          console.error('copy-service-worker plugin failed:', err.message)
          throw err
        }
      }
    }
  ],
  base: '/',
  build: {
    outDir: '../output',
    manifest: true,
    rollupOptions: {
      output: {
        // Split stable third-party code into its own long-lived chunk so a
        // content/UI deploy doesn't bust its cache, improving repeat-visit load.
        // The Leaflet map, ical.js, and fuse.js are carved into their own
        // async chunks via React.lazy / dynamic import, so they're
        // intentionally not listed here — putting fuse.js back would pin it
        // in the eager vendor chunk and undo the lazy-load. See
        // docs/web-performance-plan.md N-3 and
        // docs/lighthouse-performance-plan.md Phase 1c.
        manualChunks: {
          vendor: ['react', 'react-dom', 'dompurify'],
        },
      },
    },
  },
  server: {
    fs: {
      allow: ['..']
    }
  },
  publicDir: '../output'
})
