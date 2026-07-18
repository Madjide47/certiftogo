import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Front-office public sur le port 5174 (le back-office utilise 5173).
// Le backend tourne sur le port 4000 (voir VITE_API_URL dans .env).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
  },
});
