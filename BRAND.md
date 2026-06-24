# MDconcierge — Brand & Theme Spec

This is the single source of truth for MDconcierge's visual identity. All pages,
portals, and components must pull from these tokens. Do not hardcode hex values
anywhere else — reference the CSS variables below.

Colors are taken directly from the official logo.

---

## 1. Color palette

| Token | Hex | Use for |
|-------|-----|---------|
| `--brand-navy` | `#08214C` | Primary brand color. Headings, primary buttons, top nav background, footer. |
| `--brand-navy-hover` | `#0E2E63` | Hover/active state for navy buttons and links on navy. |
| `--brand-blue` | `#6B95D4` | Accent. Icons, borders, highlights, active tabs, focus rings, chart accents. **Do not use for body text** (fails contrast on white). |
| `--brand-blue-link` | `#2F5EA8` | Accessible blue for links and interactive text on white backgrounds. |
| `--brand-blue-50` | `#EEF4FC` | Tinted backgrounds: info banners, table row hover, selected states. |
| `--brand-blue-100` | `#DCE8F7` | Light dividers and subtle borders. |
| `--brand-ink` | `#14213D` | Default body text (navy-tinted near-black). |
| `--brand-muted` | `#5C6B85` | Secondary/helper text, captions, placeholders. |
| `--brand-border` | `#DCE6F2` | Default borders on cards, inputs, tables. |
| `--brand-surface` | `#F6F9FD` | Page background / subtle card surfaces. |
| `--brand-white` | `#FFFFFF` | Cards, panels, content background. |

### Contrast rules (must follow)
- Navy `#08214C` and ink `#14213D` are the only colors allowed for normal body text on light backgrounds.
- The light blue `#6B95D4` is an **accent only** — borders, icons, fills, active indicators. Never use it for paragraph text or small text on white.
- For blue text or links, use `--brand-blue-link` (`#2F5EA8`).
- On navy backgrounds, all text and the logo must be white (`--brand-white`) — use `logo-white.png`.

---

## 2. CSS — drop this into a single global stylesheet (`brand.css`)

```css
:root {
  --brand-navy: #08214C;
  --brand-navy-hover: #0E2E63;
  --brand-blue: #6B95D4;
  --brand-blue-link: #2F5EA8;
  --brand-blue-50: #EEF4FC;
  --brand-blue-100: #DCE8F7;
  --brand-ink: #14213D;
  --brand-muted: #5C6B85;
  --brand-border: #DCE6F2;
  --brand-surface: #F6F9FD;
  --brand-white: #FFFFFF;

  --font-sans: "Inter", "Helvetica Neue", Arial, sans-serif;
  --radius: 8px;
}

body {
  font-family: var(--font-sans);
  color: var(--brand-ink);
  background: var(--brand-surface);
}

h1, h2, h3, h4 { color: var(--brand-navy); }

a { color: var(--brand-blue-link); text-decoration: none; }
a:hover { text-decoration: underline; }

/* Primary button */
.btn-primary {
  background: var(--brand-navy);
  color: var(--brand-white);
  border: none;
  border-radius: var(--radius);
  padding: 10px 18px;
  font-weight: 600;
  cursor: pointer;
}
.btn-primary:hover { background: var(--brand-navy-hover); }

/* Secondary button */
.btn-secondary {
  background: var(--brand-white);
  color: var(--brand-navy);
  border: 1.5px solid var(--brand-blue);
  border-radius: var(--radius);
  padding: 10px 18px;
  font-weight: 600;
  cursor: pointer;
}
.btn-secondary:hover { background: var(--brand-blue-50); }

/* Top navigation bar */
.navbar {
  background: var(--brand-navy);
  color: var(--brand-white);
  padding: 12px 24px;
  display: flex;
  align-items: center;
}
.navbar a { color: var(--brand-white); }

/* Cards / panels */
.card {
  background: var(--brand-white);
  border: 1px solid var(--brand-border);
  border-radius: var(--radius);
  padding: 20px;
}

/* Inputs */
input, select, textarea {
  border: 1px solid var(--brand-border);
  border-radius: var(--radius);
  padding: 8px 10px;
}
input:focus, select:focus, textarea:focus {
  outline: none;
  border-color: var(--brand-blue);
  box-shadow: 0 0 0 3px var(--brand-blue-50);
}

/* Tables */
th { background: var(--brand-navy); color: var(--brand-white); text-align: left; padding: 10px; }
td { padding: 10px; border-bottom: 1px solid var(--brand-border); }
tr:hover td { background: var(--brand-blue-50); }
```

---

## 3. Logo assets

Files live in `/assets/brand/` (create this folder if it doesn't exist):

| File | Use |
|------|-----|
| `logo.png` | Standard logo for light/white headers and login screens. |
| `logo-white.png` | Knockout logo for navy/dark backgrounds (e.g. the top nav). |
| `favicon.ico` | Browser tab favicon. |
| `favicon-32.png` | Modern favicon (`<link rel="icon">`). |
| `favicon-180.png` | Apple touch icon (`<link rel="apple-touch-icon">`). |
| `favicon-512.png` | PWA / large app icon. |

### Logo placement rules
- Every page gets the logo in the top-left of the header, linking to the home/dashboard.
- Header height ~56–64px; render the logo at ~36–44px tall (it scales automatically).
- Login / portal entry screens: center the logo above the form at ~120px tall.
- Since the nav background is navy, use `logo-white.png` there. On white headers use `logo.png`.
- Add favicon links to the `<head>` of every page:

```html
<link rel="icon" href="/assets/brand/favicon.ico" sizes="any">
<link rel="icon" type="image/png" href="/assets/brand/favicon-32.png" sizes="32x32">
<link rel="apple-touch-icon" href="/assets/brand/favicon-180.png">
```

---

## 4. Scope
Apply this system to all MDconcierge surfaces: the admin portal, onboarding portal,
and case-status portal. InjuredGuide.com may reuse the same system if desired, but
treat it as a separate decision.
