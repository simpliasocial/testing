import { createClient } from '@supabase/supabase-js';
import { config } from '../config';

// RECONNECTED - Supabase for the new project

// Get credentials from config.ts
const supabaseUrl = config.supabase.url;
const supabaseAnonKey = config.supabase.anonKey;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase configuration. Please check src/config.ts');
}

// Create the Supabase client
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
  global: {
    headers: {
      'x-client-info': 'supabase-js-web',
    },
  },
  // Disable the content reporter that causes errors in Vercel
  db: {
    schema: 'public',
  },
});

// Types for TypeScript
export type Database = {
  public: {
    Tables: {
      // Define your Supabase table types here
    };
  };
};
