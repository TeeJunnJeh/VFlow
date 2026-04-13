import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
// 👇 引入刚刚新建的 ThemeProvider（请根据你的实际文件夹结构调整路径）
import { setupPageLoadTrace } from './services/opsTrace'

setupPageLoadTrace()

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        {/* 👇 用 ThemeProvider 包裹整个 App */}
        <App />
    </StrictMode>,
)
