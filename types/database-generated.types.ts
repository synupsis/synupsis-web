export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          avatar_url: string | null
          id: string
          updated_at: string | null
          username: string | null
          website: string | null
        }
        Insert: {
          avatar_url?: string | null
          id: string
          updated_at?: string | null
          username?: string | null
          website?: string | null
        }
        Update: {
          avatar_url?: string | null
          id?: string
          updated_at?: string | null
          username?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_id_fkey"
            columns: ["id"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      season: {
        Row: {
          created_at: string
          id: string
          name: string | null
          number: number
          show_id: string
          tv_maze_id: number
        }
        Insert: {
          created_at?: string
          id?: string
          name?: string | null
          number: number
          show_id: string
          tv_maze_id: number
        }
        Update: {
          created_at?: string
          id?: string
          name?: string | null
          number?: number
          show_id?: string
          tv_maze_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "season_show_id_fkey"
            columns: ["show_id"]
            referencedRelation: "show"
            referencedColumns: ["id"]
          }
        ]
      }
      show: {
        Row: {
          created_at: string
          genres: string[] | null
          id: string
          image: string | null
          language: string
          name: string
          slug: string
          summary: string | null
          tv_maze_id: number
        }
        Insert: {
          created_at?: string
          genres?: string[] | null
          id?: string
          image?: string | null
          language: string
          name: string
          slug: string
          summary?: string | null
          tv_maze_id: number
        }
        Update: {
          created_at?: string
          genres?: string[] | null
          id?: string
          image?: string | null
          language?: string
          name?: string
          slug?: string
          summary?: string | null
          tv_maze_id?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

