import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        paper: "#F3F5EF",
        ink: "#1B211D",
        ledger: {
          DEFAULT: "#1F6F54",
          dark: "#154F3B",
          light: "#E8F0EA",
        },
        rust: "#B4532A",
        line: "#D6DBD0",
        muted: "#6B7568",
      },
      fontFamily: {
        display: ["var(--font-display)", "serif"],
        body: ["var(--font-body)", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
      },
    },
  },
  plugins: [],
};
export default config;
