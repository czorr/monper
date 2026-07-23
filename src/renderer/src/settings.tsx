import { createRoot } from 'react-dom/client'
import SettingsPage from '@renderer/components/settings/SettingsPage'
import './styles.css'

createRoot(document.getElementById('root')!).render(<SettingsPage />)
