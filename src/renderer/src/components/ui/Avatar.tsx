import type { JSX } from 'react'

interface Props {
  initials: string
  /** Imagen del avatar (data URL). Si está, se muestra en vez de las iniciales. */
  src?: string | null
  /** 'md' = 24px (sidebar), 'sm' = 22px (dropdown), 'lg' = 56px (settings) */
  size?: 'md' | 'sm' | 'lg'
}

const sizeCls = { md: 'w-6 h-6', sm: 'w-[22px] h-[22px]', lg: 'w-14 h-14' }
const bgCls = {
  md: 'text-[10px] font-semibold tracking-[0.3px] bg-[linear-gradient(135deg,#4a4a52,#2c2c31)]',
  sm: 'text-[9px] font-bold bg-[linear-gradient(135deg,#6b5b4a,#3a2f27)]',
  lg: 'text-[18px] font-semibold bg-[linear-gradient(135deg,#4a4a52,#2c2c31)]'
}

export default function Avatar({ initials, src, size = 'md' }: Props): JSX.Element {
  if (src) {
    return <img src={src} alt="" className={`rounded-full object-cover shrink-0 ${sizeCls[size]}`} />
  }
  return (
    <div className={`rounded-full grid place-items-center text-text shrink-0 ${sizeCls[size]} ${bgCls[size]}`}>
      {initials}
    </div>
  )
}
