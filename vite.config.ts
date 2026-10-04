import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages 部署在 /<仓库名>/ 下，用相对路径最省事
export default defineConfig({
  base: './',
  plugins: [react()],
});
