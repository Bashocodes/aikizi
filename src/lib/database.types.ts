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
      users: {
        Row: {
          id: string
          auth_id: string
          role: 'viewer' | 'pro' | 'publisher' | 'admin'
          created_at: string
        }
        Insert: {
          id?: string
          auth_id: string
          role?: 'viewer' | 'pro' | 'publisher' | 'admin'
          created_at?: string
        }
        Update: {
          id?: string
          auth_id?: string
          role?: 'viewer' | 'pro' | 'publisher' | 'admin'
          created_at?: string
        }
      }
      profiles: {
        Row: {
          user_id: string
          handle: string
          display_name: string | null
          avatar_url: string | null
          bio: string | null
          is_public: boolean
          created_at: string
        }
        Insert: {
          user_id: string
          handle: string
          display_name?: string | null
          avatar_url?: string | null
          bio?: string | null
          is_public?: boolean
          created_at?: string
        }
        Update: {
          user_id?: string
          handle?: string
          display_name?: string | null
          avatar_url?: string | null
          bio?: string | null
          is_public?: boolean
          created_at?: string
        }
      }
      plans: {
        Row: {
          id: number
          name: string
          tokens_granted: number
          created_at: string
        }
        Insert: {
          id?: number
          name: string
          tokens_granted?: number
          created_at?: string
        }
        Update: {
          id?: number
          name?: string
          tokens_granted?: number
          created_at?: string
        }
      }
      entitlements: {
        Row: {
          user_id: string
          plan_id: number
          tokens_balance: number
          created_at: string
          updated_at: string
        }
        Insert: {
          user_id: string
          plan_id: number
          tokens_balance?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          user_id?: string
          plan_id?: number
          tokens_balance?: number
          created_at?: string
          updated_at?: string
        }
      }
      transactions: {
        Row: {
          id: string
          user_id: string
          kind: string
          amount: number
          ref: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          kind: string
          amount: number
          ref?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          kind?: string
          amount?: number
          ref?: Json | null
          created_at?: string
        }
      }
      media_assets: {
        Row: {
          id: string
          provider: string
          public_id: string
          width: number
          height: number
          bytes: number
          variants: Json
          created_at: string
        }
        Insert: {
          id?: string
          provider: string
          public_id: string
          width: number
          height: number
          bytes: number
          variants: Json
          created_at?: string
        }
        Update: {
          id?: string
          provider?: string
          public_id?: string
          width?: number
          height?: number
          bytes?: number
          variants?: Json
          created_at?: string
        }
      }
      posts: {
        Row: {
          id: string
          owner_id: string
          title: string
          slug: string
          image_id: string | null
          image_base64: string | null
          visibility: string
          status: string
          created_at: string
        }
        Insert: {
          id?: string
          owner_id: string
          title: string
          slug: string
          image_id?: string | null
          image_base64?: string | null
          visibility?: string
          status?: string
          created_at?: string
        }
        Update: {
          id?: string
          owner_id?: string
          title?: string
          slug?: string
          image_id?: string | null
          image_base64?: string | null
          visibility?: string
          status?: string
          created_at?: string
        }
      }
      post_meta: {
        Row: {
          post_id: string
          prompt_full: string | null
          prompt_short: string | null
          mj_version: string | null
          model_used: string | null
          alt_text: string | null
        }
        Insert: {
          post_id: string
          prompt_full?: string | null
          prompt_short?: string | null
          mj_version?: string | null
          model_used?: string | null
          alt_text?: string | null
        }
        Update: {
          post_id?: string
          prompt_full?: string | null
          prompt_short?: string | null
          mj_version?: string | null
          model_used?: string | null
          alt_text?: string | null
        }
      }
      post_subjects: {
        Row: {
          post_id: string
          subject_slug: string
        }
        Insert: {
          post_id: string
          subject_slug: string
        }
        Update: {
          post_id?: string
          subject_slug?: string
        }
      }
      post_styles: {
        Row: {
          post_id: string
          style_triplet: string
          artist_oneword: string | null
          style_tags: string[]
        }
        Insert: {
          post_id: string
          style_triplet: string
          artist_oneword?: string | null
          style_tags: string[]
        }
        Update: {
          post_id?: string
          style_triplet?: string
          artist_oneword?: string | null
          style_tags?: string[]
        }
      }
      post_tags: {
        Row: {
          post_id: string
          tag: string
        }
        Insert: {
          post_id: string
          tag: string
        }
        Update: {
          post_id?: string
          tag?: string
        }
      }
      sref_codes: {
        Row: {
          post_id: string
          locked: boolean
          price_tokens: number
          code_encrypted: string | null
        }
        Insert: {
          post_id: string
          locked?: boolean
          price_tokens?: number
          code_encrypted?: string | null
        }
        Update: {
          post_id?: string
          locked?: boolean
          price_tokens?: number
          code_encrypted?: string | null
        }
      }
      bookmarks: {
        Row: {
          user_id: string
          post_id: string
          created_at: string
        }
        Insert: {
          user_id: string
          post_id: string
          created_at?: string
        }
        Update: {
          user_id?: string
          post_id?: string
          created_at?: string
        }
      }
      likes: {
        Row: {
          user_id: string
          post_id: string
          created_at: string
        }
        Insert: {
          user_id: string
          post_id: string
          created_at?: string
        }
        Update: {
          user_id?: string
          post_id?: string
          created_at?: string
        }
      }
      decodes: {
        Row: {
          id: string
          user_id: string
          input_media_id: string
          model: string
          raw_json: Json
          normalized_json: Json
          cost_tokens: number
          private: boolean
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          input_media_id: string
          model: string
          raw_json: Json
          normalized_json: Json
          cost_tokens: number
          private?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          input_media_id?: string
          model?: string
          raw_json?: Json
          normalized_json?: Json
          cost_tokens?: number
          private?: boolean
          created_at?: string
        }
      }
      audit_logs: {
        Row: {
          id: string
          actor_id: string
          action: string
          target: Json
          created_at: string
        }
        Insert: {
          id?: string
          actor_id: string
          action: string
          target: Json
          created_at?: string
        }
        Update: {
          id?: string
          actor_id?: string
          action?: string
          target?: Json
          created_at?: string
        }
      }
      sref_unlocks: {
        Row: {
          user_id: string
          post_id: string
          created_at: string
        }
        Insert: {
          user_id: string
          post_id: string
          created_at?: string
        }
        Update: {
          user_id?: string
          post_id?: string
          created_at?: string
        }
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
  }
}
