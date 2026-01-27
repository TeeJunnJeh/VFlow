/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      keyframes: {
        // 1. 错误提示的抖动动画
        shake: {
          '0%, 100%': { transform: 'translateX(0)' },
          '25%': { transform: 'translateX(-4px)' },
          '75%': { transform: 'translateX(4px)' },
        },
        // 2. 成功登录时的光圈扩散
        ripple: {
          '0%': {
            transform: 'scale(1)',
            opacity: '1',
            borderWidth: '8px',
          },
          '100%': {
            transform: 'scale(12)',
            opacity: '0',
            borderWidth: '1px',
          },
        },
        // 3. 成功登录时的核心能量释放
        'ping-slow': {
          '0%': { transform: 'scale(1)', opacity: '0.8' },
          '100%': { transform: 'scale(20)', opacity: '0' },
        },
      },
      animation: {
        // 将 Keyframes 绑定到可用的类名上
        'shake': 'shake 0.2s ease-in-out 0s 2',
        'ripple': 'ripple 1.2s cubic-bezier(0, 0, 0.2, 1) forwards',
        'ping-slow': 'ping-slow 1s cubic-bezier(0, 0, 0.2, 1) forwards',
      },
    },
  },
  // 必须安装并引入 tailwindcss-animate 插件
  // 命令: npm install tailwindcss-animate
  plugins: [require("tailwindcss-animate")],
}