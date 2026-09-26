// Mirrors the CSS variables in src/index.css. Colours are defined there once,
// as RGB channels, and referenced here so opacity modifiers keep working:
// `bg-accent/10`, `text-ink-3`, `border-line`.
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        page: token("page"),
        surface: token("surface"),
        "surface-2": token("surface-2"),
        line: token("line"),
        "line-strong": token("line-strong"),
        ink: token("ink"),
        "ink-2": token("ink-2"),
        "ink-3": token("ink-3"),
        accent: token("accent"),
        "accent-ink": token("accent-ink"),
        "accent-soft": token("accent-soft"),
        sky: token("sky"),
        "sky-ink": token("sky-ink"),
        "sky-soft": token("sky-soft"),
        good: token("good"),
        "good-soft": token("good-soft"),
        bad: token("bad"),
        "bad-soft": token("bad-soft"),
        warn: token("warn"),
        "warn-soft": token("warn-soft"),
      },
      boxShadow: {
        card: "var(--shadow-card)",
        pop: "var(--shadow-pop)",
      },
    },
  },
  plugins: [],
};
