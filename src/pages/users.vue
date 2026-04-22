<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import type { TableColumn } from '@nuxt/ui'

import { useAuth } from '../composables/useAuth'
import {
  listUsers,
  createUser,
  updateUser,
  deleteUser,
  type ManageUserRow,
  type ManageUserRole
} from '../lib/manage-users'
import { listCenters, type CenterRow } from '../lib/centers'
import UserModal from '../components/users/UserModal.vue'
import DeleteUserConfirmModal from '../components/users/DeleteUserConfirmModal.vue'

type Role = ManageUserRole
type AppUserRow = ManageUserRow

const auth = useAuth()
const router = useRouter()
const toast = useToast()

const isSuperAdmin = computed(() => auth.state.value.profile?.role === 'super_admin')

const users = ref<AppUserRow[]>([])
const centers = ref<CenterRow[]>([])
const loading = ref(false)
const errorMessage = ref<string | null>(null)

const query = ref('')

const isCreateOpen = ref(false)

const editing = ref<AppUserRow | null>(null)

const userModalOpen = computed({
  get: () => isCreateOpen.value,
  set: (value: boolean) => {
    isCreateOpen.value = value
  }
})

const isBusy = computed(() => loading.value)

const filteredUsers = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return users.value

  return users.value.filter((u) => {
    const haystack = [
      u.email,
      u.display_name ?? '',
      u.role ?? ''
    ].join(' ').toLowerCase()

    return haystack.includes(q)
  })
})

const columns: TableColumn<AppUserRow>[] = [
  { accessorKey: 'email', header: 'Email' },
  { accessorKey: 'display_name', header: 'Display name' },
  { accessorKey: 'role', header: 'Role' },
  { accessorKey: 'actions', header: '' }
]

const deleteConfirmOpen = ref(false)
const deleteTarget = ref<AppUserRow | null>(null)

const token = computed(() => auth.state.value.session?.access_token ?? '')

const loadUsers = async () => {
  loading.value = true
  errorMessage.value = null

  try {
    const data = await listUsers(token.value)
    users.value = data.users
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unable to load users'
    errorMessage.value = msg
  } finally {
    loading.value = false
  }
}

const loadCenters = async () => {
  try {
    centers.value = await listCenters()
  } catch (err) {
    console.error('Failed to load centers:', err)
  }
}

const openCreate = () => {
  deleteConfirmOpen.value = false
  deleteTarget.value = null
  editing.value = null
  isCreateOpen.value = true
}

const handleUserSubmit = async (
  payload:
    | { mode: 'create'; email: string; password: string; role: Role | null; center_id: string | null }
    | { mode: 'edit'; user_id: string; role: Role | null; center_id: string | null; urgency_orders_enabled: boolean | null }
) => {
  loading.value = true
  errorMessage.value = null

  try {
    if (payload.mode === 'create') {
      await createUser(token.value, {
        email: payload.email,
        password: payload.password,
        role: payload.role,
        center_id: payload.center_id
      })

      isCreateOpen.value = false
      toast.add({
        title: 'User created',
        color: 'success'
      })
      await loadUsers()
      return
    }

    await updateUser(token.value, {
      user_id: payload.user_id,
      role: payload.role,
      center_id: payload.center_id,
      urgency_orders_enabled: payload.urgency_orders_enabled
    })

    isCreateOpen.value = false
    toast.add({
      title: 'User updated',
      color: 'success'
    })
    await loadUsers()
  } catch (err) {
    const msg = err instanceof Error
      ? err.message
      : payload.mode === 'create'
        ? 'Unable to create user'
        : 'Unable to update user'
    errorMessage.value = msg
  } finally {
    loading.value = false
  }
}

const startEdit = (row: AppUserRow) => {
  isCreateOpen.value = false
  deleteConfirmOpen.value = false
  deleteTarget.value = null
  editing.value = row
  isCreateOpen.value = true
}

const requestDelete = (row: AppUserRow) => {
  if (row.user_id === auth.state.value.user?.id) {
    errorMessage.value = 'You cannot delete your own account.'
    return
  }

  isCreateOpen.value = false
  editing.value = null
  deleteTarget.value = row
  deleteConfirmOpen.value = true
}

const confirmDelete = async () => {
  if (!deleteTarget.value) return

  loading.value = true
  errorMessage.value = null

  try {
    await deleteUser(token.value, deleteTarget.value.user_id)

    deleteConfirmOpen.value = false
    deleteTarget.value = null

    toast.add({
      title: 'User deleted',
      color: 'success'
    })

    await loadUsers()
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unable to delete user'
    errorMessage.value = msg
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  await auth.init()
  if (!isSuperAdmin.value) {
    await router.replace('/dashboard')
    return
  }

  await loadCenters()
  await loadUsers()
})
</script>

<template>
  <UDashboardPanel id="users">
    <template #header>
      <UDashboardNavbar title="Users">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

      </UDashboardNavbar>

      <UDashboardToolbar>
        <div class="flex w-full flex-wrap items-center justify-between gap-3">
          <div class="flex flex-1 flex-wrap items-center gap-3">
            <UInput
              v-model="query"
              class="max-w-md"
              icon="i-lucide-search"
              placeholder="Search by email, name, role..."
            />
            <UBadge
              variant="subtle"
              :label="`${filteredUsers.length} users`"
            />
          </div>

          <UButton
            color="neutral"
            variant="outline"
            icon="i-lucide-refresh-cw"
            :loading="isBusy"
            @click="loadUsers"
          >
            Refresh
          </UButton>
        </div>
      </UDashboardToolbar>
    </template>

    <template #body>
      <div class="space-y-4">
        <p class="text-sm text-slate-600 dark:text-white/70">
          Manage roles and access. Creating a user will send an invite email from Supabase.
        </p>

        <UAlert
          v-if="errorMessage"
          color="error"
          variant="subtle"
          title="Something went wrong"
          :description="errorMessage"
        />

        <UPageCard variant="subtle">
          <template #header>
            <div class="flex items-center justify-between gap-3">
              <div>
                <h3 class="text-base font-semibold text-slate-900 dark:text-white">Users</h3>
                <p class="text-sm text-slate-600 dark:text-white/70">Invite teammates and manage their roles.</p>
              </div>
              <UButton
                label="Add user"
                icon="i-lucide-user-plus"
                class="rounded-full"
                :disabled="isBusy"
                @click="openCreate"
              />
            </div>
          </template>
          <UTable
            class="mt-0"
            :data="filteredUsers"
            :loading="isBusy"
            :columns="columns"
            :ui="{
              base: 'table-fixed border-separate border-spacing-0',
              thead: '[&>tr]:bg-elevated/50 [&>tr]:after:content-none',
              tbody: '[&>tr]:last:[&>td]:border-b-0',
              th: 'first:rounded-l-lg last:rounded-r-lg border-y border-default first:border-l last:border-r',
              td: 'border-b border-default'
            }"
          >
            <template #email-cell="{ row }">
              <div class="flex flex-col">
                <span class="text-sm font-medium text-slate-900 dark:text-white/90">{{ row.original.email }}</span>
              </div>
            </template>

            <template #display_name-cell="{ row }">
              <span class="text-sm text-slate-700 dark:text-white/80">{{ row.original.display_name || '—' }}</span>
            </template>

            <template #role-cell="{ row }">
              <UBadge
                v-if="row.original.role"
                variant="subtle"
                class="capitalize"
                :label="row.original.role"
              />
              <span v-else class="text-sm text-slate-500 dark:text-white/60">—</span>
            </template>

            <template #actions-cell="{ row }">
              <div class="flex justify-end gap-2">
                <UButton
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  icon="i-lucide-pencil"
                  :disabled="isBusy"
                  @click="startEdit(row.original)"
                />
                <UButton
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  icon="i-lucide-trash"
                  :disabled="isBusy || row.original.user_id === auth.state.value.user?.id"
                  @click="requestDelete(row.original)"
                />
              </div>
            </template>
          </UTable>

          <div v-if="!isBusy && filteredUsers.length === 0" class="p-6 text-center text-sm text-slate-600 dark:text-white/70">
            No users found.
          </div>
        </UPageCard>

        <UserModal
          v-model:open="userModalOpen"
          :user="editing"
          :centers="centers"
          :loading="isBusy"
          @submit="handleUserSubmit"
          @after:leave="editing = null"
        />

        <DeleteUserConfirmModal
          v-model:open="deleteConfirmOpen"
          :user="deleteTarget"
          :loading="isBusy"
          @confirm="confirmDelete"
        />
      </div>
    </template>
  </UDashboardPanel>
</template>
