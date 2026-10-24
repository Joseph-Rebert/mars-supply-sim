import type { ReactNode } from 'react'

type Props = {
  title: string
  children: ReactNode
  className?: string
}

/** A titled section separated from its neighbours by a hairline rule (no box). */
export function Panel({ title, children, className }: Props) {
  return (
    <section className={className ? `section ${className}` : 'section'} aria-label={title}>
      <h2 className="section-title">{title}</h2>
      {children}
    </section>
  )
}
