// dist/index.html をプロジェクト直下の「将棋大乱闘.html」にコピーする
import { copyFileSync } from 'node:fs';
copyFileSync('dist/index.html', '将棋大乱闘.html');
console.log('→ 将棋大乱闘.html を更新しました（ダブルクリックで遊べます）');
