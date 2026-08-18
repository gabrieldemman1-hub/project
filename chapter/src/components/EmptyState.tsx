import type { ReactNode } from 'react'

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="text-center py-14 px-6">
      <p className="text-lg font-medium">{title}</p>
      {body && <p className="text-sm text-ink-quiet mt-2 leading-relaxed">{body}</p>}
      {action && <div className="mt-6 flex justify-center">{action}</div>}
    </div>
  )
}
