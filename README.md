# Vflow AI (Video Flow)

**Next-Gen Video Generation for Global E-Commerce.**

Vflow AI is a modern, production-grade frontend application designed to streamline the video creation process for e-commerce. It features a sophisticated "Workbench" interface for script-to-video generation, asset management, and template configuration, all wrapped in a sleek, dark-mode glassmorphism UI.

## ✨ Key Features

### 1. 🔐 Secure Authentication
* **Dual Login Methods:** Support for Email (Mock) and Phone Number (Real API Integration).
* **OTP Verification:** Integrated with backend API for SMS code verification.
* **Session Management:** Persistent login state using `AuthContext` and LocalStorage.
* **Protected Routes:** Automatic redirection for unauthenticated users.

### 2. 🛠️ AI Workbench (Core)
A powerful, three-column workspace designed for creators:
* **Config Panel (Left):** File uploads, attribute configuration (Duration, Aspect Ratio, Style), and prompt input.
* **Script Editor (Center):** Interactive shot list editor. Add, remove, or modify visual/audio scripts for each shot.
* **Preview & Publish (Right):** Real-time video preview placeholder and one-click publishing to social platforms (TikTok, Instagram, YouTube).

### 3. 🌐 Internationalization (i18n)
* **Bilingual Support:** Full English and Chinese (Simplified) translations.
* **Instant Switching:** Global language switcher available on all pages.
* **Context-Aware:** Translations applied to Sidebar, Workbench, Login, and Landing pages.

### 4. 🎨 Modern UI/UX
* **Design System:** "Dark Mode" aesthetic with deep violet/orange gradients and glassmorphism effects.
* **Responsive:** Adaptive sidebar and layout logic.
* **Animations:** Smooth transitions using Tailwind CSS and Lucide React icons.

### 5. 📂 Asset & Template Management
* **Asset Hub:** Manage uploaded models, products, and scenes.
* **Template Library:** Create, edit, and save reusable video configuration templates (e.g., "TikTok Viral", "High-End Product").
* **History Archive:** Track past generations with status indicators (Draft, Completed).

---

## 🛠️ Tech Stack

* **Framework:** [React 18](https://reactjs.org/) (via [Vite](https://vitejs.dev/))
* **Language:** [TypeScript](https://www.typescriptlang.org/)
* **Styling:** [Tailwind CSS](https://tailwindcss.com/)
* **Icons:** [Lucide React](https://lucide.dev/)
* **Routing:** [React Router DOM](https://reactrouter.com/)
* **State Management:** React Context API (Auth & Language)

---

## 🚀 Getting Started

### Prerequisites
* Node.js (v16 or higher)
* npm or yarn

### Installation

1.  **Clone the repository**
    ```bash
    git clone [https://github.com/TeeJunnJeh/VFlow.git](https://github.com/TeeJunnJeh/VFlow.git)
    cd vflow-ai
    ```

2.  **Install dependencies**
    ```bash
    npm install
    # or
    yarn install
    ```

3.  **Configure Proxy (Important)**
    To avoid CORS issues with the backend API, ensure `vite.config.ts` is configured to proxy requests:
    ```typescript
    // vite.config.ts
    server: {
      proxy: {
        '/api': {
          target: '[http://1.95.137.119:8001](http://1.95.137.119:8001)',
          changeOrigin: true,
          secure: false,
        }
      }
    }
    ```

4.  **Run the development server**
    ```bash
    npm run dev
    ```

5.  **Open the app**
    Visit `http://localhost:5173` in your browser.

---

## 📂 Project Structure

```text
src/
├── components/
│   └── common/
│       └── LanguageSwitcher.tsx  # Global language toggle
├── context/
│   ├── AuthContext.tsx           # User session & login logic
│   └── LanguageContext.tsx       # i18n state management
├── i18n/
│   └── translations.ts           # EN/ZH translation dictionary
├── pages/
│   ├── Landing.tsx               # Public landing page
│   ├── Login.tsx                 # Split-screen auth page
│   └── Workbench.tsx             # Main app (Dashboard, Assets, Editor)
├── services/
│   └── auth.ts                   # API calls (Send Code, Login)
├── App.tsx                       # Routing & Layout definitions
├── index.css                     # Global styles & Tailwind directives
└── main.tsx                      # Entry point