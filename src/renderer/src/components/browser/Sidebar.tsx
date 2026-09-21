import { useState, type JSX } from 'react'
import type { BrowserState, Bookmark, Profile, UpdateState } from '@shared/types'
import UpdatePill from './UpdatePill'
import RemotePill from './RemotePill'
import AccountPill from './AccountPill'
import TabList from './TabList'
import TabRow from './TabRow'
import BookmarkRow from './BookmarkRow'
import BookmarkFolderRow from './BookmarkFolderRow'
import IconFolderPlus from '~icons/tabler/folder-plus'
import IconSpy from '~icons/tabler/spy'
import { IconButton, SectionLabel } from '@renderer/components/ui'
import { PlusIcon, SidebarIcon } from '@renderer/lib/icons'
import titanioPng from '@renderer/assets/titanio.png' // el PNG a pelo: aquí el fondo es siempre oscuro

interface Props {
  state: BrowserState
  profile: Profile
  bookmarks: Bookmark[]
  collapsed: boolean
  onOpenBookmark: (url: string) => void
  onOpenMenu: (rect: DOMRect) => void
  onCollapse: () => void
  onNewTab: () => void
  onSelectTab: (id: number) => void
  onCloseTab: (id: number) => void
  onReorderTabs: (ids: number[]) => void
  /** Variante "peek": se renderiza dentro de una ventana flotante, no fijo a la izquierda. */
  floating?: boolean
  /** Estado de actualización, para el pill junto al semáforo. */
  update?: UpdateState
  onDownloadUpdate?: () => void
  onInstallUpdate?: () => void
  /** Control remoto activo → indicador en el mismo hueco que el pill de actualización. */
  remote?: { enabled: boolean; port: number }
  onDisableRemote?: () => void
}

const newRowClass =
  'flex items-center gap-2.5 w-full py-1 px-2 rounded-lg border border-transparent text-text-dim text-left text-[14.5px] ' +
  'min-h-[29px] hover:bg-bg-hover hover:text-text [&>svg]:opacity-80 [&>svg]:w-[16px] [&>svg]:h-[16px]'

export default function Sidebar({ state, profile, bookmarks, collapsed, onOpenBookmark, onOpenMenu, onCollapse, onNewTab, onSelectTab, onCloseTab, onReorderTabs, floating = false, update, onDownloadUpdate, onInstallUpdate, remote, onDisableRemote }: Props): JSX.Element {
  const noop = (): void => {}

  /**
   * Arrastre del sidebar. Vive AQUÍ y no en cada lista porque cruza las dos: soltar una
   * pestaña sobre Bookmarks la convierte en marcador, y al revés. Con el estado dentro de
   * cada lista, ninguna sabría qué está arrastrando la otra.
   */
  const [arrastre, setArrastre] = useState<{ tipo: 'tab' | 'bookmark'; id: string } | null>(null)
  const [sobre, setSobre] = useState<string | null>(null)
  /** Carpeta recién creada: entra en modo renombrar sola. */
  const [carpetaNueva, setCarpetaNueva] = useState<string | null>(null)

  // Un nivel: raíz y, dentro de cada carpeta, sus marcadores. Ver `Bookmark.folder`.
  const raiz = bookmarks.filter((b) => !b.parentId)
  const hijosDe = (id: string): Bookmark[] => bookmarks.filter((b) => b.parentId === id)

  const nuevaCarpeta = async (): Promise<void> => {
    const f = await window.titanio.newBookmarkFolder('Nueva carpeta')
    setCarpetaNueva(f.id)
  }

  /**
   * Marcador soltado sobre una CARPETA: se mete dentro.
   *
   * Una carpeta no se mete en otra (el árbol es de un nivel), así que ese caso se reordena como
   * siempre en vez de no hacer nada — quedarse quieto al soltar parece que la app se colgó.
   */
  const soltarEnCarpeta = (folderId: string): void => {
    if (arrastre?.tipo === 'bookmark' && arrastre.id !== folderId) {
      const b = bookmarks.find((x) => x.id === arrastre.id)
      if (b && !b.folder) window.titanio.moveBookmark(arrastre.id, folderId)
      else soltarEnMarcador(folderId)
    } else if (arrastre?.tipo === 'tab') soltarTabEnMarcadores()
    limpiar()
  }

  const soltarEnMarcador = (destinoId: string): void => {
    if (!arrastre) return
    if (arrastre.tipo === 'bookmark' && arrastre.id !== destinoId) {
      // Soltar sobre un marcador es "ponte aquí", así que además de la posición hereda la
      // carpeta del destino: arrastrar uno de dentro de una carpeta a la raíz lo saca. Sin
      // esto se movía de sitio pero seguía dentro, y parecía que el arrastre no había hecho nada.
      const origen = bookmarks.find((b) => b.id === arrastre.id)
      const destino = bookmarks.find((b) => b.id === destinoId)
      if (origen && !origen.folder && (origen.parentId ?? null) !== (destino?.parentId ?? null)) {
        window.titanio.moveBookmark(arrastre.id, destino?.parentId ?? null)
      }
      const ids = bookmarks.map((b) => b.id).filter((id) => id !== arrastre.id)
      const at = ids.indexOf(destinoId)
      ids.splice(at < 0 ? ids.length : at, 0, arrastre.id)
      window.titanio.reorderBookmarks(ids)
    }
    limpiar()
  }

  /** Soltar en la cabecera de la sección: sale de su carpeta y vuelve a la raíz. */
  const soltarEnRaiz = (): void => {
    if (arrastre?.tipo === 'tab') return soltarTabEnMarcadores()
    if (arrastre?.tipo === 'bookmark') {
      const b = bookmarks.find((x) => x.id === arrastre.id)
      if (b && !b.folder && b.parentId) window.titanio.moveBookmark(arrastre.id, null)
    }
    limpiar()
  }

  /**
   * Pestaña soltada en Bookmarks: se marca. Es el mismo gesto que la estrella del topbar, y
   * como marcar ata la pestaña a su marcador, la fila se mueve sola de una lista a la otra.
   */
  const soltarTabEnMarcadores = (): void => {
    if (arrastre?.tipo === 'tab') window.titanio.toggleBookmark()
    limpiar()
  }

  /**
   * Marcador soltado en Tabs: deja de ser marcador y se queda como pestaña.
   *
   * Se ABRE antes de quitarlo si no estaba abierto, para que el gesto no destruya nada: al
   * soltar acabas con esa página delante, no con un marcador menos y nada a cambio.
   */
  const soltarMarcadorEnTabs = (): void => {
    if (arrastre?.tipo === 'bookmark') {
      const vivo = state.tabs.find((t) => t.bookmarkId === arrastre.id)
      if (!vivo) window.titanio.openBookmark(arrastre.id)
      window.titanio.detachBookmark(arrastre.id)
    }
    limpiar()
  }

  const limpiar = (): void => { setArrastre(null); setSobre(null) }

  /** Un marcador normal. Se pinta en la raíz y dentro de una carpeta, de ahí que esté extraído. */
  const filaMarcador = (b: Bookmark): JSX.Element => {
    const live = liveBookmark(b.id)
    return (
      <div
        key={b.id}
        draggable
        onDragStart={() => setArrastre({ tipo: 'bookmark', id: b.id })}
        onDragOver={(e) => { if (arrastre) { e.preventDefault(); setSobre(b.id) } }}
        onDragEnd={limpiar}
        onDrop={(e) => { e.stopPropagation(); arrastre?.tipo === 'tab' ? soltarTabEnMarcadores() : soltarEnMarcador(b.id) }}
        className={'rounded-lg ' + (arrastre?.id === b.id ? 'opacity-40 ' : '') + resaltado(b.id)}
      >
        {live ? (
          <TabRow tab={live} active={live.id === state.activeId} onSelect={onSelectTab} onClose={onCloseTab} />
        ) : (
          <BookmarkRow bookmark={b} onOpen={onOpenBookmark} />
        )}
      </div>
    )
  }
  const resaltado = (id: string): string =>
    sobre === id && arrastre ? 'shadow-[inset_0_2px_0_0_rgba(255,255,255,0.45)] ' : ''
  // Las pestañas ligadas a un bookmark se muestran en su slot de bookmarks, no en Tabs.
  const userTabs = state.tabs.filter((t) => !t.agent && !t.bookmarkId)
  const agentTabs = state.tabs.filter((t) => t.agent)
  const liveBookmark = (id: string): (typeof state.tabs)[number] | undefined =>
    state.tabs.find((t) => t.bookmarkId === id)
  const closeOthers = (): void => userTabs.forEach((t) => t.id !== state.activeId && onCloseTab(t.id))

  return (
    <aside
      className={
        'group flex flex-col pb-2.5 px-2 ' +
        (floating ? 'h-full w-full pt-2 ' : 'fixed inset-y-0 left-0 w-sidebar ') +
        (collapsed && !floating ? 'hidden' : '')
      }
    >
      {/*
        Row del semáforo nativo (izquierda) + pill de update y colapsar (derecha).

        Mide `h-topbar`, lo mismo que el topbar que tiene al lado: los dos son la misma banda
        visual y sus iconos deben compartir centro. Antes esta fila medía 44px con los botones
        en tamaño `sm`, así que había TRES centros distintos en la misma línea —semáforo 23,
        estos iconos 24, los del topbar 26— y se notaba. El semáforo se movió a y=20 en el
        main para caer también en 26.
      */}
      {!floating && (
        <div className="h-topbar shrink-0 flex items-center justify-end gap-1 [-webkit-app-region:drag]">
          {remote?.enabled && <RemotePill port={remote.port} onDisable={onDisableRemote ?? noop} />}
          {update && (
            <UpdatePill
              state={update}
              onDownload={onDownloadUpdate ?? noop}
              onInstall={onInstallUpdate ?? noop}
            />
          )}
          <IconButton title="Colapsar sidebar (⌘S)" onClick={onCollapse}>
            <SidebarIcon />
          </IconButton>
        </div>
      )}

      {/* En incógnito no se enseña el perfil: la ventana no navega como tú, y decir lo
          contrario sería el peor sitio para una ambigüedad. */}
      {state.incognito && (
        <div className="flex items-center gap-2 h-8 px-2.5 mb-1 rounded-xl bg-white/[0.06] text-[12.5px] text-text-dim [-webkit-app-region:drag]">
          <IconSpy className="w-[15px] h-[15px] shrink-0 text-text-faint" />
          <span className="truncate">Ventana de incógnito</span>
        </div>
      )}

      <div className="flex items-center justify-between gap-1 pr-1 [-webkit-app-region:drag]">
        <AccountPill initials={profile.initials} name={profile.name} avatar={profile.avatar} onOpen={onOpenMenu} />
        <IconButton title="Nueva pestaña (⌘T)" onClick={onNewTab}>
          <PlusIcon />
        </IconButton>
      </div>

      {bookmarks.length > 0 && (
        <div
          className="shrink-0"
          onDragOver={(e) => { if (arrastre) { e.preventDefault(); setSobre('__bookmarks__') } }}
          onDrop={soltarEnRaiz}
        >
          <SectionLabel label="Bookmarks" action={{ label: <IconFolderPlus className="w-[15px] h-[15px]" />, title: 'Nueva carpeta', onClick: () => void nuevaCarpeta() }} />
          {/* pb-px: la fila pulsada baja 1px y, si es la última, sacaba scroll en este
              contenedor. Ese píxel de holgura evita la barra sin tocar el efecto. */}
          <div className="flex flex-col gap-px pb-px max-h-[35vh] overflow-y-auto [&::-webkit-scrollbar]:w-0">
            {raiz.map((b) => {
              if (b.folder) {
                const hijos = hijosDe(b.id)
                const plegada = !!b.collapsed
                return (
                  <div key={b.id}>
                    <div
                      draggable
                      onDragStart={() => setArrastre({ tipo: 'bookmark', id: b.id })}
                      onDragOver={(e) => { if (arrastre) { e.preventDefault(); setSobre(b.id) } }}
                      onDragEnd={limpiar}
                      onDrop={(e) => { e.stopPropagation(); soltarEnCarpeta(b.id) }}
                      className={'rounded-lg ' + (arrastre?.id === b.id ? 'opacity-40 ' : '') + resaltado(b.id)}
                    >
                      <BookmarkFolderRow
                        folder={b}
                        count={hijos.length}
                        collapsed={plegada}
                        onToggle={() => window.titanio.collapseBookmarkFolder(b.id, !plegada)}
                        autoRename={carpetaNueva === b.id}
                        onRenamed={() => setCarpetaNueva(null)}
                      />
                    </div>
                    {/* Sangrado con una guía: sin ella, con el sidebar estrecho, no se ve dónde
                        acaba una carpeta y empieza la siguiente. */}
                    {!plegada && hijos.length > 0 && (
                      <div className="ml-[13px] pl-1.5 border-l border-white/[0.08] flex flex-col gap-px">
                        {hijos.map((h) => filaMarcador(h))}
                      </div>
                    )}
                  </div>
                )
              }
              return filaMarcador(b)
            })}
          </div>
        </div>
      )}

      <SectionLabel label="Tabs" action={{ label: 'Clear', title: 'Cerrar todas menos la activa', onClick: closeOthers }} />

      <button className={newRowClass} onClick={onNewTab}>
        <PlusIcon />
        <span>New tab</span>
      </button>

      <div
        className="flex-1 min-h-0 flex flex-col"
        onDragOver={(e) => { if (arrastre?.tipo === 'bookmark') { e.preventDefault(); setSobre('__tabs__') } }}
        onDrop={() => arrastre?.tipo === 'bookmark' && soltarMarcadorEnTabs()}
      >
        <TabList
          tabs={userTabs}
          activeId={state.activeId}
          onSelect={onSelectTab}
          onClose={onCloseTab}
          onReorder={onReorderTabs}
          onDragTab={(id) => setArrastre({ tipo: 'tab', id: String(id) })}
          onDragEnd={limpiar}
          onTearOff={(id) => window.titanio.tearOffTab(id)}
        />
      </div>

      {agentTabs.length > 0 && (
        <div className="shrink-0 mt-1">
          <div className="flex items-center gap-1.5 px-2 pb-1 text-[12px] font-medium text-text-faint [&>img]:w-3.5 [&>img]:h-3.5 [&>img]:opacity-80">
            <img src={titanioPng} alt="" />
            <span>Agent tabs</span>
          </div>
          <div className="flex flex-col gap-px pb-px max-h-[40vh] overflow-y-auto [&::-webkit-scrollbar]:w-0">
            {agentTabs.map((t) => (
              <TabRow key={t.id} tab={t} active={t.id === state.activeId} onSelect={onSelectTab} onClose={onCloseTab} />
            ))}
          </div>
        </div>
      )}
    </aside>
  )
}
