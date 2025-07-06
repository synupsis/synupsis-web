import { h } from 'vue'
import type { ColumnDef } from '@tanstack/vue-table'
import { ArrowUpDown, MoreHorizontal } from 'lucide-vue-next'
import { Button } from '@/components/shadcn/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/shadcn/dropdown-menu'
import { Checkbox } from '@/components/shadcn/checkbox'
import type { Prompt } from '~/types/database.types'

type ActionHandlers = {
  onEdit: (prompt: Prompt) => void
  onDuplicate: (prompt: Prompt) => void
  onDelete: (prompt: Prompt) => void
}

export const columns = ({ onEdit, onDuplicate, onDelete }: ActionHandlers): ColumnDef<Prompt>[] => [
  {
    id: 'select',
    header: ({ table }) => h(Checkbox, {
      'checked': table.getIsAllPageRowsSelected(),
      'onUpdate:checked': (value: boolean) => table.toggleAllPageRowsSelected(!!value),
      'aria-label': 'Select all',
    }),
    cell: ({ row }) => h(Checkbox, {
      'checked': row.getIsSelected(),
      'onUpdate:checked': (value: boolean) => row.toggleSelected(!!value),
      'aria-label': 'Select row',
    }),
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: 'name',
    header: 'Name',
  },
  {
    accessorKey: 'is_active',
    header: 'Active',
    cell: ({ row }) => (row.getValue('is_active') ? 'Yes' : 'No'),
  },
  {
    accessorKey: 'created_at',
    header: ({ column }) => {
      return h(Button, {
        variant: 'ghost',
        onClick: () => column.toggleSorting(column.getIsSorted() === 'asc'),
      }, () => ['Created At', h(ArrowUpDown, { class: 'ml-2 h-4 w-4' })])
    },
    cell: ({ row }) => new Date(row.getValue('created_at')).toLocaleDateString(),
  },
  {
    id: 'actions',
    cell: ({ row }) => {
      const prompt = row.original

      return h('div', { class: 'relative' }, [
        h(DropdownMenu, () => [
          h(DropdownMenuTrigger, { asChild: true }, () =>
            h(Button, { variant: 'ghost', class: 'h-8 w-8 p-0' }, () =>
              h(MoreHorizontal, { class: 'h-4 w-4' }),
            ),
          ),
          h(DropdownMenuContent, { align: 'end' }, () => [
            h(DropdownMenuLabel, () => 'Actions'),
            h(DropdownMenuItem, { onClick: () => navigator.clipboard.writeText(prompt.id) }, () => 'Copy ID'),
            h(DropdownMenuSeparator),
            h(DropdownMenuItem, { onClick: () => onEdit(prompt) }, () => 'Edit'),
            h(DropdownMenuItem, { onClick: () => onDuplicate(prompt) }, () => 'Duplicate'),
            h(DropdownMenuItem, { class: 'text-red-600', onClick: () => onDelete(prompt) }, () => 'Delete'),
          ]),
        ]),
      ])
    },
  },
]
