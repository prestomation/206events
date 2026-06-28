import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { initWebVitals } from './lib/webVitals.js'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

// Report Core Web Vitals (LCP/INP/CLS/FCP/TTFB) as bucketed, cookieless
// GoatCounter events. Self-guards to production only. See lib/webVitals.js.
initWebVitals()

// Register service worker for offline support
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .catch(err => console.warn('SW registration failed:', err))
  })
}
