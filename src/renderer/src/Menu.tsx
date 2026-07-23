import { createRoot } from 'react-dom/client'
import ProfileMenu from '@renderer/components/menu/ProfileMenu'
import './styles.css'

createRoot(document.getElementById('root')!).render(<ProfileMenu />)
