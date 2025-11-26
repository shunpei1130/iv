import 'react-native-url-polyfill/auto'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'

// ここにさっきのSupabaseのキーを入れる
const supabaseUrl = 'https://bjjdbhrsrjrdhwkihfuz.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJqamRiaHJzcmpyZGh3a2loZnV6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQxMjg4NTAsImV4cCI6MjA3OTcwNDg1MH0.26RSs513xfmjlzPjjcOubvR2Mm_wvNfI6HToJvnrlzg'

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})