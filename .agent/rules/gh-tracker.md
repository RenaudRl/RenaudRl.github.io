# GitHub Tracker - Core Policy

> **Objective**: Build a premium, high-performance GitHub tracking dashboard for personal and public use.

## 1. Technical Standards
- **Core**: Vanilla HTML/JS. No heavy frameworks unless requested.
- **Styling**: Vanilla CSS with modern features (Flexbox, Grid, Variables).
- **API**: GitHub REST API v3. 
- **Performance**: Optimize for fast loading and smooth animations.
- **Privacy**: No storage of Personal Access Tokens (PAT) on the server. Use `localStorage` if needed for client-side persistence.

## 2. Design Excellence (Obsidian Nexus Aesthetic)
- **Visuals**: Dark mode by default, glassmorphism, subtle gradients.
- **Typography**: High-quality Google Fonts (Outfit/Inter).
- **Animations**: Use CSS transitions and animations for state changes.
- **Responsive**: Mobile-first design that scales beautifully to desktop.

## 3. Operational Protocol
- **Code Quality**: Clean, documented, and modular.
- **Debugging**: Systematic approach. Logs at boundaries.
- **Planning**: Atomic steps, verb-first.

## 4. GitHub Integration
- Handle rate limits gracefully (show a prompt for PAT).
- Support for public repositories fetching.
- Integration of release stats, star counts, and language data.
