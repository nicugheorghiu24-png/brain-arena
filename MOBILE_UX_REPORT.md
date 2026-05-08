# Brain Arena — Mobile UX Report

This report describes what is **statically true** about the mobile
layout based on a code review of every page's Tailwind classes plus
the existing layout structure. It is **not** a hands-on device test —
that requires running through the manual checklist in `BETA_TESTING.md`
on a real iPhone / Android.

## Method

- Read every `app/**/*.tsx` file with viewport-affecting Tailwind
  classes (`sm:`, `md:`, `lg:`, `grid-cols-*`, fixed widths).
- Cross-reference against the App Router structure to confirm each
  page mounts inside the same root layout (`app/layout.tsx`) and uses
  consistent breakpoints.
- Code review — no DevTools, no actual device testing.

## Strong points (verifiable from code)

- **Top-level pages** (`/`, `/dashboard`, `/games`, `/leaderboard`,
  `/profile`) all wrap content in `mx-auto max-w-6xl px-4 sm:px-6`.
  No fixed-pixel containers above the breakpoint.
- **Navbar** has a dedicated mobile menu (`md:hidden` toggle), with
  the desktop nav links + login/register CTAs hidden under
  `md:flex`. Touch target on the toggle is 40×40 px (`h-10 w-10`).
- **Game Hub** uses `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` for
  the game tiles — single column on phones.
- **Login / Register** forms use `max-w-md` with full-width inputs
  and `p-4` padding on `<input>` — comfortable touch targets (~48 px
  tall, > the 44 px Apple HIG minimum).
- **Buttons** across the app use `px-4 py-2` to `px-8 py-5`. Primary
  CTAs are `py-4` or larger — comfortable touch targets.
- **Dashboard** stat grid is `grid-cols-2 md:grid-cols-4` so phones
  show 2 columns of stats; tablet/desktop expands to 4.
- **Leaderboard** table collapses to a single-column list under
  `md:`; tier/W-L columns are `hidden md:block` and the row instead
  shows them inline beneath the username.

## Confirmed weak points (still flagged in `KNOWN_LIMITATIONS.md`)

- **Chess board sidebar stacks below the board** on portrait phones.
  Reviewing `/chess/page.tsx`, the layout uses
  `lg:grid-cols-[1fr_360px]` so the sidebar (clocks, history,
  controls) only sits beside the board on `lg+`. On mobile the player
  has to scroll between board and clocks.
- **Profile page** uses `flex flex-col gap-6 md:flex-row` for the
  header card; phone shows the avatar block on top, stats below. Reads
  fine but the "Match history" subsection is dense — could use larger
  spacing.
- **Toast** is `fixed bottom-6 right-6 max-w-sm` — fine on tablet+,
  but on a phone the right margin can clip to the screen edge depending
  on safe-area insets. iPhone with the home indicator at the bottom
  may see the toast partly obscured.
- **Long usernames** (>16 chars) on the leaderboard row truncate via
  `truncate` — confirmed in `app/leaderboard/page.tsx:226-238`.
- **Form errors** show inline beneath the form via
  `border-red-400/30 bg-red-500/10 px-3 py-2 text-sm` — readable, but
  the error doesn't auto-scroll into view if the user has scrolled
  past the form mid-submit.

## Cannot verify without a real device

- Whether iOS Safari's auto-zoom-on-input fires (it does for any
  `<input>` with `font-size < 16px`; our inputs use the default Tailwind
  size which is 16px so this should be fine).
- Whether the chess board's drag-to-move gesture conflicts with iOS
  swipe-to-go-back at the screen edges.
- Whether the Socket.IO websocket survives an iOS Safari background
  → foreground cycle.
- Whether the rendered toast height pushes against the iPhone home
  indicator.
- Whether button hover effects (we use `hover:-translate-y-0.5` and
  glow shadows) flicker or stick on touch devices that emulate hover.

## Recommended manual mobile checks before launch

1. iPhone 13/14/15 portrait Safari: full register → play a math
   sprint → check dashboard updates.
2. Android Chrome portrait: same flow + a chess match against a
   second device.
3. iPad Mini portrait: dashboard layout transitions cleanly.
4. Test landscape orientation on a phone for the chess page in
   particular — the `lg:grid-cols-[1fr_360px]` *might* trigger on
   landscape iPhone and put the sidebar beside the board, or it
   might not.
5. Test the Navbar mobile menu opens/closes on tap and that all links
   route correctly.
