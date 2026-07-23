import { createRoot } from 'react-dom/client'
import VaultWindow from '@renderer/components/vault/VaultWindow'
import './styles.css'

createRoot(document.getElementById('root')!).render(<VaultWindow />)
