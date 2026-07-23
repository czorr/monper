import { createRoot } from 'react-dom/client'
import NewTabPage from '@renderer/components/newtab/NewTabPage'
import './styles.css'

createRoot(document.getElementById('root')!).render(<NewTabPage />)
