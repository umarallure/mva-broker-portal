import { computed, readonly, ref } from 'vue'
import { createSharedComposable } from '@vueuse/core'

import {
  MANAGED_LAUNCH_CONTEXT_KEY,
  type ManagedLaunchContext,
  readManagedLaunchContext,
} from '../lib/managedLaunch'

const isClient = typeof window !== 'undefined'

const _useManagedLaunch = () => {
  const context = ref<ManagedLaunchContext | null>(readManagedLaunchContext())

  const setContext = (value: ManagedLaunchContext) => {
    context.value = value
    if (!isClient) return
    window.sessionStorage.setItem(MANAGED_LAUNCH_CONTEXT_KEY, JSON.stringify(value))
  }

  const clearContext = () => {
    context.value = null
    if (!isClient) return
    window.sessionStorage.removeItem(MANAGED_LAUNCH_CONTEXT_KEY)
  }

  const refresh = () => {
    context.value = readManagedLaunchContext()
  }

  return {
    context: readonly(context),
    isManaged: computed(() => Boolean(context.value)),
    setContext,
    clearContext,
    refresh,
  }
}

export const useManagedLaunch = createSharedComposable(_useManagedLaunch)
