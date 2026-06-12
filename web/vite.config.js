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
  },
  server: {
    fs: {
      allow: ['..']
    }
  },
  publicDir: '../output'
})
