<script setup lang="ts">
import * as z from 'zod'
import { computed, onMounted, reactive, ref, watch } from 'vue'
import type { FormSubmitEvent } from '@nuxt/ui'

import { useAuth } from '../../composables/useAuth'
import { supabase } from '../../lib/supabase'

const profileSchema = z.object({
  name: z.string().min(2, 'Too short'),
  email: z.string().email('Invalid email')
})

type ProfileSchema = z.output<typeof profileSchema>

const auth = useAuth()
const saving = ref(false)
const isEditing = ref(false)

const profile = reactive<Partial<ProfileSchema>>({
  name: '',
  email: ''
})

const disabled = computed(() => !isEditing.value)

const hydrateFromAuth = () => {
  const p = auth.state.value.profile
  profile.name = p?.display_name ?? ''
  profile.email = p?.email ?? auth.state.value.user?.email ?? ''
}

onMounted(async () => {
  await auth.init()
  hydrateFromAuth()
})

watch(
  () => auth.state.value.profile,
  () => {
    hydrateFromAuth()
  }
)

const toast = useToast()
async function onSubmit(event: FormSubmitEvent<ProfileSchema>) {
  const token = auth.state.value.session?.access_token ?? ''
  if (!token) return

  saving.value = true
  try {
    const { error } = await supabase
      .from('app_users')
      .update({ display_name: event.data.name })
      .eq('user_id', auth.state.value.user?.id)

    if (error) throw error

    await auth.refreshProfile()
    toast.add({
      title: 'Success',
      description: 'Your settings have been updated.',
      icon: 'i-lucide-check',
      color: 'success'
    })

    isEditing.value = false
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unable to update profile'
    toast.add({
      title: 'Error',
      description: msg,
      icon: 'i-lucide-x',
      color: 'error'
    })
  } finally {
    saving.value = false
  }
}

const startEditing = () => {
  isEditing.value = true
}

const cancelEditing = () => {
  hydrateFromAuth()
  isEditing.value = false
}
</script>

<template>
  <UForm
    id="settings"
    :schema="profileSchema"
    :state="profile"
    @submit="onSubmit"
  >
    <!-- Page Header -->
    <div class="flex items-center justify-between mb-6">
      <div class="flex items-center gap-3">
        <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--ap-accent)]/10">
          <UIcon name="i-lucide-user" class="text-lg text-[var(--ap-accent)]" />
        </div>
        <div>
          <h2 class="text-base font-semibold text-highlighted">Profile</h2>
          <p class="text-xs text-muted">This information will be displayed publicly.</p>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <UButton
          v-if="!isEditing"
          label="Edit"
          icon="i-lucide-pencil"
          class="group rounded-lg bg-[var(--ap-accent)] text-white hover:bg-[var(--ap-accent)]/80 transition-colors duration-200"
          :ui="{ leadingIcon: 'transition duration-200 group-hover:-rotate-12' }"
          @click="startEditing"
        />
        <template v-else>
          <UButton
            form="settings"
            label="Save changes"
            type="submit"
            icon="i-lucide-check"
            :loading="saving"
            class="rounded-lg bg-[var(--ap-accent)] text-white hover:bg-[var(--ap-accent)]/90"
          />
          <UButton
            label="Cancel"
            color="neutral"
            variant="ghost"
            class="rounded-lg"
            @click="cancelEditing"
          />
        </template>
      </div>
    </div>

    <!-- Account Details Card -->
    <div class="rounded-2xl border border-[var(--ap-card-border)] bg-[var(--ap-card-bg)] overflow-hidden">
      <div class="border-b border-[var(--ap-card-border)] px-5 py-3">
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-id-card" class="text-sm text-muted" />
          <span class="text-xs font-semibold uppercase tracking-wider text-muted">Account Details</span>
        </div>
      </div>

      <div class="divide-y divide-[var(--ap-card-divide)]">
        <div class="flex max-sm:flex-col items-start justify-between gap-4 px-5 py-4">
          <div class="min-w-0 flex-1">
            <label class="text-sm font-medium text-highlighted">
              Name
              <span class="text-red-400">*</span>
            </label>
            <p class="mt-0.5 text-xs text-muted">Will appear on receipts, invoices, and other communication.</p>
          </div>
          <div class="w-full sm:w-72">
            <UInput
              v-model="profile.name"
              autocomplete="off"
              :disabled="disabled"
              size="md"
              class="w-full sm:w-72"
            />
          </div>
        </div>

        <div class="flex max-sm:flex-col items-start justify-between gap-4 px-5 py-4">
          <div class="min-w-0 flex-1">
            <label class="text-sm font-medium text-highlighted">
              Email
              <span class="text-red-400">*</span>
            </label>
            <p class="mt-0.5 text-xs text-muted">Used to sign in, for email receipts and product updates.</p>
          </div>
          <div class="w-full sm:w-72">
            <UInput
              v-model="profile.email"
              type="email"
              autocomplete="off"
              disabled
              size="md"
              class="w-full sm:w-72"
            />
          </div>
        </div>
      </div>
    </div>
  </UForm>
</template>
