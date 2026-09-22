import type { JSX } from 'react'
import type { ProfileIcon } from '@shared/profiles'
import IconUser from '~icons/tabler/user'
import IconBriefcase from '~icons/tabler/briefcase'
import IconHome from '~icons/tabler/home'
import IconCode from '~icons/tabler/code'
import IconBook from '~icons/tabler/book'
import IconCompass from '~icons/tabler/compass'

interface Props {
  initials: string
  /** Imagen del avatar (data URL). Si está, se muestra en vez de las iniciales. */
  src?: string | null
  color?: string
  icon?: ProfileIcon
  /** 'xs' = 20px (sidebar), 'sm' = 22px, 'md' = 24px, 'lg' = 56px (settings) */
  size?: 'xs' | 'md' | 'sm' | 'lg'
}

const sizeCls = { xs: 'w-5 h-5', md: 'w-6 h-6', sm: 'w-[22px] h-[22px]', lg: 'w-14 h-14' }
const bgCls = {
  xs: 'text-[9px] font-semibold tracking-[0.3px] bg-[linear-gradient(135deg,#4a4a52,#2c2c31)]',
  md: 'text-[10px] font-semibold tracking-[0.3px] bg-[linear-gradient(135deg,#4a4a52,#2c2c31)]',
  sm: 'text-[9px] font-bold bg-[linear-gradient(135deg,#6b5b4a,#3a2f27)]',
  lg: 'text-[18px] font-semibold bg-[linear-gradient(135deg,#4a4a52,#2c2c31)]'
}

export default function Avatar({ initials, src, size = 'md', color, icon = 'initials' }: Props): JSX.Element {
  if (src) {
    return <img src={src} alt="" style={color ? { outline: `2px solid ${color}`, outlineOffset: 2 } : undefined} className={`rounded-full object-cover shrink-0 ${sizeCls[size]}`} />
  }
  const icons = { user: IconUser, briefcase: IconBriefcase, home: IconHome, code: IconCode, book: IconBook, compass: IconCompass }
  const Icon = icon === 'initials' ? null : icons[icon]
  return (
    <div style={color ? { background: `linear-gradient(135deg, ${color}, ${color}80)` } : undefined} className={`rounded-full grid place-items-center text-white shrink-0 ${sizeCls[size]} ${bgCls[size]}`}>
      {Icon ? <Icon aria-hidden="true" className={size === 'lg' ? 'w-6 h-6' : 'w-3.5 h-3.5'} /> : initials}
    </div>
  )
}
