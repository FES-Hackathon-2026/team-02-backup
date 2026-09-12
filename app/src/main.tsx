import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import App from './App'
import { startTheme } from './lib/theme'
import './styles/tokens.css'
import './styles/app.css'

// Before the first paint, so a dark build never flashes light first.
startTheme()

const root = document.getElementById('root')
if (!root) throw new Error('#root missing from index.html')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
