import React from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles.css'

const container = document.getElementById('root')
if (container === null) throw new Error('missing #root mount point')

// Platform fact for platform-conditional chrome (system caption buttons on
// Windows reserve the top-right corner; CSS keys off this attribute).
document.documentElement.dataset.platform = window.dshDesktop.platform

createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
