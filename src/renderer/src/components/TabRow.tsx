import type { JSX } from 'react'
import type { TabInfo } from '../../../shared/types'
import { domainOf } from '../util'
import { CloseIcon } from './Icons'

interface Props {
  tab: TabInfo
  active: boolean
  onSelect: (id: number) => void
  onClose: (id: number) => void
}

export default function TabRow({ tab, active, onSelect, onClose }: Props): JSX.Element {
  return (
    <div
      className={'tab' + (active ? ' active' : '')}
      onClick={() => onSelect(tab.id)}
      onAuxClick={(e) => e.button === 1 && onClose(tab.id)}
    >
      {tab.loading ? (
        <div className="spinner" />
      ) : tab.favicon ? (
        <img className="favicon" src={tab.favicon} onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
      ) : (
        <span className="favicon placeholder" />
      )}
      <span className="title">{tab.title || domainOf(tab.url) || 'New tab'}</span>
      <button className="close" title="Cerrar" onClick={(e) => { e.stopPropagation(); onClose(tab.id) }}>
        <CloseIcon />
      </button>
    </div>
  )
}
