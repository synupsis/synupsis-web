'use client'

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

async function updateUserRole(userId: string, newRole: 'admin' | 'user', refresh: () => void) {
  try {
    await $fetch('/api/admin/user/update-role', {
      method: 'POST',
      body: { userId, newRole },
    })
    toast.success(`User role updated to ${newRole}.`)
    refresh()
  } catch (e: any) {
    toast.error('Failed to update role', { description: e.data?.message })
  }
}

async function deleteUser(userId: string, refresh: () => void) {
  try {
    await $fetch('/api/admin/user/delete', {
      method: 'POST',
      body: { userId },
    })
    toast.success('User deleted successfully.')
    refresh()
  } catch (e: any) {
    toast.error('Failed to delete user', { description: e.data?.message })
  }
}

export const columns: ColumnDef<User>[] = [
  {
    accessorKey: 'email',
    header: 'Email',
  },
  {
    accessorKey: 'role',
    header: 'Role',
  },
  {
    id: 'actions',
    cell: ({ row, table }) => {
      const user = row.original
      const { refresh } = table.options.meta as any

      return h(DropdownMenu, null, () => [
        h(DropdownMenuTrigger, { asChild: true }, () =>
          h(Button, { variant: 'ghost', class: 'w-8 h-8 p-0' }, () =>
            h(MoreHorizontalIcon, { class: 'w-4 h-4' })
          )
        ),
        h(DropdownMenuContent, { align: 'end' }, () => [
          h(DropdownMenuLabel, null, () => 'Actions'),
          h(DropdownMenuItem, { onClick: () => navigator.clipboard.writeText(user.user_id) }, () => 'Copy User ID'),
          h(DropdownMenuSeparator),
          h(DropdownMenuItem, {
            onClick: () => updateUserRole(user.user_id, user.role === 'admin' ? 'user' : 'admin', refresh),
          }, () => `Set as ${user.role === 'admin' ? 'user' : 'admin'}`),
          h(DropdownMenuItem, {
            class: 'text-destructive',
            onClick: () => {
              if (confirm('Are you sure you want to delete this user? This action cannot be undone.')) {
                deleteUser(user.user_id, refresh)
              }
            },
          }, () => 'Delete User'),
        ])
      ])
    },
  },
]