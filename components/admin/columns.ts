import type { useI18n } from '~/composables/useI18n'

type Translate = ReturnType<typeof useI18n>['t']

import type { ColumnDef } from '@tanstack/vue-table'
import { h } from 'vue'
import { toast } from 'vue-sonner'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '~/components/shadcn/dropdown-menu'
import { Button } from '~/components/shadcn/button'
import { MoreHorizontalIcon } from 'lucide-vue-next'

export interface User {
  id: string
  user_id: string
  role: 'admin' | 'user'
  email: string
}

async function updateUserRole(userId: string, newRole: 'admin' | 'user', refresh: () => void, t: Translate) {
  try {
    await $fetch('/api/admin/user/update-role', {
      method: 'POST',
      body: { userId, newRole },
    })
    toast.success(t('User role updated to {role}.', { role: t(newRole === 'admin' ? 'Administrator' : 'User') }))
    refresh()
  } catch (e: any) {
    toast.error(t('Failed to update role'), { description: t('Please try again.') })
  }
}

async function deleteUser(userId: string, refresh: () => void, t: Translate) {
  try {
    await $fetch('/api/admin/user/delete', {
      method: 'POST',
      body: { userId },
    })
    toast.success(t('User deleted successfully.'))
    refresh()
  } catch (e: any) {
    toast.error(t('Failed to delete user'), { description: t('Please try again.') })
  }
}

export const createUserColumns = (t: Translate): ColumnDef<User>[] => [
  {
    accessorKey: 'email',
    header: t('Email'),
  },
  {
    accessorKey: 'role',
    header: t('Role'),
    cell: ({ row }) => t(row.original.role === 'admin' ? 'Administrator' : 'User'),
  },
  {
    id: 'actions',
    cell: ({ row, table }) => {
      const user = row.original
      const { refresh } = table.options.meta as any

      return h(DropdownMenu, null, () => [
        h(DropdownMenuTrigger, { asChild: true }, () =>
          h(Button, { variant: 'ghost', class: 'w-8 h-8 p-0', 'aria-label': t('User actions') }, () =>
            h(MoreHorizontalIcon, { class: 'w-4 h-4' })
          )
        ),
        h(DropdownMenuContent, { align: 'end' }, () => [
          h(DropdownMenuLabel, null, () => t('Actions')),
          h(DropdownMenuItem, { onClick: () => navigator.clipboard.writeText(user.user_id) }, () => t('Copy User ID')),
          h(DropdownMenuSeparator),
          h(DropdownMenuItem, {
            onClick: () => updateUserRole(user.user_id, user.role === 'admin' ? 'user' : 'admin', refresh, t),
          }, () => t(user.role === 'admin' ? 'Set as user' : 'Set as administrator')),
          h(DropdownMenuItem, {
            class: 'text-destructive',
            onClick: () => {
              if (confirm(t('Are you sure you want to delete this user? This action cannot be undone.'))) {
                deleteUser(user.user_id, refresh, t)
              }
            },
          }, () => t('Delete User')),
        ])
      ])
    },
  },
]
