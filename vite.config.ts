import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
export default defineConfig({plugins:[react()],build:{target:'es2022',rollupOptions:{output:{manualChunks:{vendor:['react','react-dom'],'supabase':['@supabase/supabase-js']}}}}})
