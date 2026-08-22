import { useState } from 'react'
import type { ReactElement } from 'react'
import { Menu, MenuItem } from '@uibase'
import { AboutDialog } from './AboutDialog'

/**
 * Application command menu: a WinUI 3 style chevron button in the title bar
 * (left of the caption buttons) dropping a uibase Menu card. The only entry
 * is the About action; the dialog is modal.
 */
export function AppMenu(): ReactElement {
  const [aboutOpen, setAboutOpen] = useState(false)

  return (
    <>
      <Menu
        className="appmenu-root"
        trigger={({ open, toggle }) => (
          <button
            className={`appmenu-btn ${open ? 'active' : ''}`}
            title="应用菜单"
            aria-label="应用菜单"
            aria-expanded={open}
            onClick={toggle}
          >
            <svg viewBox="0 0 12 12">
              <path d="M3 4.5l3 3 3-3" />
            </svg>
          </button>
        )}
      >
        <MenuItem onClick={() => setAboutOpen(true)}>关于 Coded</MenuItem>
      </Menu>
      <AboutDialog open={aboutOpen} onClose={() => setAboutOpen(false)} />
    </>
  )
}
