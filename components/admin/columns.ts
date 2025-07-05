"use client"

import { h } from "vue"
import type { ColumnDef } from "@tanstack/vue-table"
import { ArrowUpDown, MoreHorizontal } from "lucide-vue-next"
import { toast } from "vue-sonner"

import { Button } from "~/components/shadcn/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/shadcn/dropdown-menu"

export interface User {
  id: string
  email: string
  role: "user" | "admin"
}

export const columns: ColumnDef<User>[] = [
  {
    accessorKey: "email",
    header: ({ column }) => {
      return h(Button, {
        variant: "ghost",
        onClick: () => column.toggleSorting(column.getIsSorted() === "asc"),
      }, () => ["Email", h(ArrowUpDown, { class: "ml-2 h-4 w-4" })])
    },
  },
  {
    accessorKey: "role",
    header: "Role",
  },
  {
    id: "actions",
    cell: ({ row, table }) => {
      const user = row.original
      const supabase = useSupabaseClient();

      const setRole = async (role: "user" | "admin") => {
        const { error } = await supabase.from('profile').update({ role }).eq('id', user.id);
        if (error) {
          toast.error("Failed to update role", { description: error.message });
        } else {
          toast.success("Role updated successfully");
          (table.options.meta as any)?.refresh();
        }
      };

      return h("div", { class: "relative" }, h(DropdownMenu, {}, {
        default: () => [
          h(DropdownMenuTrigger, {}, () => h(Button, { variant: "ghost", class: "h-8 w-8 p-0" }, () => [
            h("span", { class: "sr-only" }, "Open menu"),
            h(MoreHorizontal, { class: "h-4 w-4" }),
          ])),
          h(DropdownMenuContent, { align: "end" }, {
            default: () => [
              h(DropdownMenuLabel, {}, () => "Actions"),
              h(DropdownMenuItem, { onClick: () => navigator.clipboard.writeText(user.id) }, () => "Copy user ID"),
              h(DropdownMenuSeparator),
              h(DropdownMenuItem, { onClick: () => setRole("admin") }, () => "Make admin"),
              h(DropdownMenuItem, { onClick: () => setRole("user") }, () => "Make user"),
            ]
          }),
        ]
      }))
    },
  },
]

