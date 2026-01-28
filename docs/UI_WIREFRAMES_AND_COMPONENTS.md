# Planora GT — Wireframes & Components

Layout
- Shell: Left sidebar (groups/events), center content (chat/dashboard), right panel (details/tasks/budget)
- Mobile: bottom tab bar; slide-over panels for group info and tasks
- Dark/Light themes via CSS variables; prefers-color-scheme detection

Screens
1) Login/Register
   - Card centered, brand area, inputs, password rules, error toasts
2) Groups List (sidebar)
   - Search bar, groups with last message preview, unread badges
3) Chat Window (center)
   - Messages list (virtualized), composer with attachments, typing indicator
   - Message bubble variants: own vs others; timestamps; edit/delete menu
4) Group Info (right panel)
   - Members list (avatars), add/remove (PM only), tasks summary, budget summary, attachments
5) Event Dashboard
   - Cards: tasks progress, attendees, invites, expense summary, gallery, timeline
6) Tasks (per group and global)
   - List with filters; inline status toggle; drawer for details and comments
7) Budget
   - Table of items with estimated vs actual; upload receipts; category filter; CSV export button
8) Files/Gallery
   - Grid with thumbnails; type filter; preview modal
9) Poster Editor (Phase 2)
   - Toolbar (text, shapes, uploads), canvas, layers panel, templates drawer
10) Certificates (Phase 2)
   - Template upload/preview; CSV mapping; batch progress and downloads
11) Calendar (Phase 2)
   - Month/week views; tasks and events; add to Google/ICS

Components
- Primitives: Button, IconButton, Input, Select, Checkbox, Toggle, Badge, Avatar, Tooltip
- Feedback: Toast, Modal, Drawer, Spinner/Skeleton, EmptyState
- Lists: VirtualizedList, ListItem (with subtitle, meta), Tabs, Accordion
- Cards: StatCard, InfoCard, ChartCard
- Chat: MessageBubble, Composer, AttachmentPreview, TypingDots
- Data: Table (sticky header), Pagination, Filters, Tag
- Editor (Phase 2): Canvas, LayerItem, TransformHandles, ColorPicker

Motion
- Framer Motion presets: fade/slide for panels, scale/opacity for modals, list stagger for messages
- Micro-interactions: hover raise, press ripple (subtle), typing dots bounce

Accessibility
- Keyboard nav: tab order, ESC to close, focus outlines
- ARIA: roles/labels for modals, tabs, lists; alt text for images
- Contrast: WCAG AA; test light/dark variants

Design Tokens (Tailwind)
- Colors: `--brand`, `--brand-600`, `--brand-700`, neutrals; semantic tokens for `bg`, `text`, `card`, `border`
- Typography scale: 12/14/16/20/24/32/48
- Spacing: 4pt base; radii: 8/12; shadows: soft/elevated
