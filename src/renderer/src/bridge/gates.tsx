/**
 * Answerable gates — the inline cards for the harness's approval/question
 * frames. Rendered at the transcript tail (inside ChatStream's scroll area):
 * approvals get allow-once/reject, questions get an options form with an
 * always-available custom answer and a cancel path.
 */
import { useState } from 'react'
import type { ReactElement } from 'react'
import type { PendingApproval, PendingQuestion, QuestionAnswerItem } from './use-session'

/** Tool-approval card: what is about to run, then allow-once / reject. */
export function ApprovalCard({
  pending,
  onAnswer,
}: {
  pending: PendingApproval
  onAnswer: (outcome: 'allowed-once' | 'rejected') => void
}): ReactElement {
  return (
    <div className="chat-row chat-row--assistant">
      <div className="gate-card" role="group" aria-label="工具调用确认">
        <div className="gate-head">
          <span className="gate-badge">需要确认</span>
          <span className="gate-title">{pending.toolName}</span>
        </div>
        {pending.reason !== undefined && <p className="gate-reason">{pending.reason}</p>}
        {pending.argsSummary !== undefined && (
          <pre className="gate-args">{pending.argsSummary}</pre>
        )}
        <div className="gate-actions">
          <button
            type="button"
            className="gate-btn gate-btn--primary"
            onClick={() => onAnswer('allowed-once')}
          >
            允许一次
          </button>
          <button
            type="button"
            className="gate-btn gate-btn--danger"
            onClick={() => onAnswer('rejected')}
          >
            拒绝
          </button>
        </div>
      </div>
    </div>
  )
}

/** Question form: one block per question, options single/multi + custom. */
export function QuestionCard({
  pending,
  onSubmit,
  onCancel,
}: {
  pending: PendingQuestion
  onSubmit: (answers: QuestionAnswerItem[]) => void
  onCancel: () => void
}): ReactElement {
  const [selections, setSelections] = useState<Record<string, string[]>>({})
  const [customs, setCustoms] = useState<Record<string, string>>({})

  const toggleOption = (qid: string, label: string, multi: boolean): void => {
    setSelections((prev) => {
      const current = prev[qid] ?? []
      if (multi) {
        return {
          ...prev,
          [qid]: current.includes(label) ? current.filter((l) => l !== label) : [...current, label],
        }
      }
      return { ...prev, [qid]: current.includes(label) ? [] : [label] }
    })
  }

  const complete = pending.questions.every(
    (q) => (selections[q.id]?.length ?? 0) > 0 || (customs[q.id] ?? '').trim() !== '',
  )

  const submit = (): void => {
    if (!complete) return
    onSubmit(
      pending.questions.map((q) => ({
        id: q.id,
        selected: selections[q.id] ?? [],
        ...((customs[q.id] ?? '').trim() !== '' ? { custom: customs[q.id].trim() } : {}),
      })),
    )
  }

  // A plan-review batch labels its submit with the intent's approve copy.
  const submitLabel =
    pending.questions.find((q) => q.intent?.kind === 'plan-review')?.intent?.approve ?? '提交'

  return (
    <div className="chat-row chat-row--assistant">
      <div className="gate-card" role="group" aria-label="问题确认">
        {pending.questions.map((q) => (
          <div key={q.id} className="gate-question">
            {q.header !== undefined && <span className="gate-badge">{q.header}</span>}
            <p className="gate-reason">{q.question}</p>
            {q.detail !== undefined && <p className="gate-detail">{q.detail}</p>}
            {q.options !== undefined && q.options.length > 0 && (
              <div className="gate-options">
                {q.options.map((opt) => {
                  const active = (selections[q.id] ?? []).includes(opt.label)
                  return (
                    <button
                      key={opt.label}
                      type="button"
                      className={`gate-option${active ? ' active' : ''}`}
                      aria-pressed={active}
                      title={opt.description}
                      onClick={() => toggleOption(q.id, opt.label, q.multiSelect === true)}
                    >
                      {opt.label}
                    </button>
                  )
                })}
              </div>
            )}
            <input
              className="gate-custom"
              placeholder="其他：直接输入…"
              aria-label={`自定义回答：${q.question}`}
              value={customs[q.id] ?? ''}
              onChange={(event) =>
                setCustoms((prev) => ({ ...prev, [q.id]: event.target.value }))
              }
            />
          </div>
        ))}
        <div className="gate-actions">
          <button
            type="button"
            className="gate-btn gate-btn--primary"
            disabled={!complete}
            onClick={submit}
          >
            {submitLabel}
          </button>
          <button type="button" className="gate-btn" onClick={onCancel}>
            取消
          </button>
        </div>
      </div>
    </div>
  )
}
