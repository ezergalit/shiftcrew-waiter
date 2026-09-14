// The one rule that matters here, and the reason this file exists at all:
// a hook placed below an early return renders a different number of hooks on
// different paths and React throws at runtime. `vite build` never sees it.
// It has cost this project four crashes — countLabel, the flashcards deck, the
// waiter's session panel, and the manager's dish editor, which crashed on every
// single tap of "עריכת המנה" while the build stayed green.
//
//   npm run lint
module.exports = {
  root: true,
  env: { browser: true, es2022: true },
  parserOptions: { ecmaVersion: "latest", sourceType: "module", ecmaFeatures: { jsx: true } },
  plugins: ["react-hooks"],
  rules: {
    "react-hooks/rules-of-hooks": "error",
    "react-hooks/exhaustive-deps": "off", // noisy here, and not the failure mode we hit
    // 🔴 14.9: מזהה שנמחק מרשימת ה-import ונשאר בשימוש. קרה פעמיים באותו יום
    // (`STOPS` בניהול, `aboutSubtitle` כאן) — `check-jsx-refs` קורא **JSX בלבד**
    // ולכן הוא עיוור לקריאת פונקציה רגילה, וה-build ירוק. זה השער שתופס את שניהם.
    "no-undef": "error",
  },
  ignorePatterns: ["dist", "node_modules", "android", "ios", "supabase"],
};
