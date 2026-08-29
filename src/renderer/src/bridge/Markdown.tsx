/**
 * Markdown — assistant text rendering over react-markdown + remark-gfm.
 *
 * React-element output only (no innerHTML anywhere): raw HTML in model output
 * is dropped by default, which is exactly the XSS posture this shell wants.
 * GFM enables the tables/strikethrough/task lists models actually emit.
 * Links get target=_blank so clicks route through the main process
 * setWindowOpenHandler (shell.openExternal) already wired at window creation.
 */
import { memo } from 'react'
import type { ReactElement } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

export const Markdown = memo(function Markdown({ text }: { text: string }): ReactElement {
  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: (props) => <a {...props} target="_blank" rel="noopener noreferrer" />,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
})
