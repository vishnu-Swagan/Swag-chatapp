// SwagChat design tokens — "Iris" theme (trendy indigo on warm light)
// Previous strict-monochrome theme preserved at theme.mono-backup.ts
export const C = {
  surface: "#FFFFFF",      // main background
  onSurface: "#0F1222",    // near-black ink with a cool tint
  surface2: "#F6F7FB",     // cards / input fields — soft cool gray
  onSurface2: "#15182B",
  surface3: "#EEF0F8",     // pressed / nested surfaces
  onSurface3: "#1B1F33",
  inverse: "#6366F1",      // primary buttons + my chat bubbles → electric indigo
  onInverse: "#FFFFFF",
  brand: "#6366F1",        // brand accent (links, active tabs, highlights)
  border: "#E6E8F2",
  borderStrong: "#6366F1",
  divider: "#F0F1F7",
  muted: "#8A90A8",        // secondary text — cool gray, softer than before
  mutedDark: "#5A6078",
  error: "#EF4444",        // real red — errors are now visible (was gray!)
};

export const SP = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 };
export const R = { sm: 8, md: 14, lg: 22, pill: 999 }; // slightly rounder = friendlier

export const FS = { sm: 12, base: 14, lg: 16, xl: 20, xxl: 24 };
