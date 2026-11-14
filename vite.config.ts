import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// ビルド結果は1つのHTMLにまとめる（ダブルクリックで遊べるように）
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  base: './',
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
