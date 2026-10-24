import type { ReactNode } from 'react'

type Props = {
  title: string
  children: ReactNode
  className?: string
}

export function Panel({ title, children, className }: Props) {
  return (
    <section className={className ? `panel ${className}` : 'panel'} aria-label={title}>
      <h2 className="panel-title">{title}</h2>
      {children}
    </section>
  )
}
