/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      keyframes: {
        // 1. 登录表单错误提示的抖动动画
        shake: {
          '0%, 100%': { transform: 'translateX(0)' },
          '25%': { transform: 'translateX(-4px)' },
          '75%': { transform: 'translateX(4px)' },
        },
        // 2. 成功登录时的外围光圈扩散效果
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
        // 3. 成功登录时的核心能量脉冲释放
        'ping-slow': {
          '0%': { transform: 'scale(1)', opacity: '0.8' },
          '100%': { transform: 'scale(20)', opacity: '0' },
        },
        // 4. 首页流星滑落动画 (彻底修复版)
        shooting: {
          '0%': {
            /** * 核心修复：
             * 1. 必须先 rotate 锁定朝向，再进行 translate。
             * 2. 初始 translate(0, 0) 明确起点。
             */
            transform: 'rotate(-45deg) translate(0, 0)',
            opacity: '1'
          },
          '70%': {
            opacity: '1'
          },
          '100%': {
            /**
             * 核心修复：
             * 1. 再次重复 rotate(-45deg) 锁死朝向，防止动画过程中“回正”。
             * 2. 使用 translate(-1000px, 1000px) 同时改变 X 和 Y，确保完美 45 度滑行。
             */
            transform: 'rotate(-45deg) translate(-1000px, 1000px)',
            opacity: '0'
          },
        },
      },
      animation: {
        // 绑定关键帧到类名
        'shake': 'shake 0.2s ease-in-out 0s 2',
        'ripple': 'ripple 1.2s cubic-bezier(0, 0, 0.2, 1) forwards',
        'ping-slow': 'ping-slow 1s cubic-bezier(0, 0, 0.2, 1) forwards',

        // 首页流星效果：建议 3s - 4s，保持线性 (linear) 匀速感
        'shooting-star': 'shooting 4s linear infinite',
      },
    },
  },
  // 必须安装 tailwindcss-animate 插件：npm install tailwindcss-animate
  plugins: [
    require("tailwindcss-animate")
  ],
}

