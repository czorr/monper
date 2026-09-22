import { useSyncExternalStore } from 'react'
import { getLocale, subscribeLocale } from '@shared/i18n'
export { t, getLocale } from '@shared/i18n'

export function useLocale() {
  return useSyncExternalStore(subscribeLocale, getLocale)
}
