import type { JSX } from 'react'

interface Props {
  initials: string
  /** 'md' = 24px (sidebar), 'sm' = 22px (dropdown) */
  size?: 'md' | 'sm'
}

const styles = {
  md: 'w-6 h-6 text-[10px] font-semibold tracking-[0.3px] bg-[linear-gradient(135deg,#4a4a52,#2c2c31)]',
  sm: 'w-[22px] h-[22px] text-[9px] font-bold bg-[linear-gradient(135deg,#6b5b4a,#3a2f27)]'
}

export default function Avatar({ initials, size = 'md' }: Props): JSX.Element {
  return (
    <div className={`rounded-full grid place-items-center text-text shrink-0 ${styles[size]}`}>
      {initials}
    </div>
  )
}
