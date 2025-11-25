# UI Improvements Plan

## 1. Dark/Light Mode Text Colors ✅
- All text uses CSS variables (--text-primary, --text-secondary)
- Buttons use proper contrast colors
- Forms and inputs adapt to theme

## 2. Mobile Profile Menu 🔧
**Add:**
- Hamburger menu button (top-right on mobile)
- Slide-out menu with:
  - Profile photo
  - User name & email
  - Logout button
  - Delete account button
  - All navigation items

## 3. Notification System 🔧
**Add:**
- Browser notification API
- Sound effect (notification.mp3 or beep)
- Toast popup on screen
- Badge counter updates

## 4. Layout Cleanup 🔧
**Improve:**
- Consistent spacing
- Better mobile responsiveness
- Cleaner card designs
- Organized sections

## Files to Update:
1. `static/css/style.css` - Add mobile menu styles
2. `static/js/app.js` - Add notification sound & browser notifications
3. `static/index.html` - Add hamburger menu HTML

## Implementation Order:
1. Mobile hamburger menu (HTML + CSS)
2. Notification sounds (JS)
3. Browser notifications (JS)
4. Final polish & testing
