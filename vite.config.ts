import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'build',
    // 此 Windows 环境删除后立即重建目录会触发 EPERM；保留目录和旧哈希文件。
    // 部署时以本次 index.html 引用的文件为准。
    emptyOutDir: false,
  },
});
