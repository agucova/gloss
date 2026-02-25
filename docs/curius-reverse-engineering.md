# Curius Extension Reverse Engineering Notes

This document contains findings from reverse engineering the Curius browser extension (v0.2.8.23) extracted from Firefox.

## Extension Structure

```
manifest.json          # Manifest v2 extension
newtab.html           # New tab override page
extension.html        # Popup UI
dist/
  background.js       # Background service worker
  extension.js        # Popup UI bundle
  newtab.js          # New tab page bundle
  helper.js          # Content script (injected into all pages)
  extension/static/
    content.css      # Highlight styling
    *.png            # Icons
```

## API Endpoints

Base URL: `https://curius.app`

### Authentication

- `POST /api/login` — Login endpoint
- Auth uses JWT tokens stored in cookies and localStorage
- Authorization header: `Bearer <jwt_token>`

### Links (Bookmarks)

- `POST /api/links` — Add a new link/bookmark
- `GET /api/links/url` — Get link by URL (check if already saved)
- `POST /api/links/url/network` — Get network (friends') links for a URL
- `DELETE /api/links/{id}` — Delete a link
- `POST /api/links/{id}/title` — Rename a link
- `POST /api/links/{id}` — Update link (toRead status)
- `POST /api/links/{id}/favorite` — Toggle favorite

### Highlights

- `POST /api/links/{id}/highlights` — Add highlight to a link
- `DELETE /api/links/{id}/highlights` — Delete highlight
- `PUT /api/links/{id}/highlight/comment` — Update highlight with comment

### Topics/Tags

- `GET /api/user/topics?uid={uid}` — Get user's topics
- `POST /api/links/{id}/classify` — Auto-classify link
- `POST /api/links/{id}/topics` — Add topic to link
- `DELETE /api/links/{id}/topics` — Remove topic from link
- `PUT /api/links/{id}/topics` — Upsert link topics

### Mentions

- `POST /api/links/{id}/mention` — Add user mention to link
- `PUT /api/links/{id}/mention` — Upsert user mentions

### Comments

- `POST /api/comments` — Add reply to a comment
- `DELETE /api/comments` — Delete a comment

### Users

- `GET /api/user` — Get current user info
- `GET /api/user/following/` — Get following list

## Data Structures

### Highlight Object

```typescript
interface Highlight {
	id: string;
	linkId: string;
	highlightText: string; // The actual highlighted text
	position: HighlightPosition; // Position data for re-rendering
	userId?: string;
}

interface HighlightPosition {
	rawHighlight: string; // The highlighted text
	leftContext: string; // Text to the left (for disambiguation)
	rightContext: string; // Text to the right (for disambiguation)
}
```

The position system uses **text-based matching** rather than DOM positions:

1. When creating a highlight, capture the selected text plus surrounding context
2. When rendering, search the page text for the highlight
3. Use `leftContext` and `rightContext` to disambiguate multiple matches
4. Fall back to fuzzy matching if exact match fails

### Link Object

```typescript
interface Link {
	id: string;
	url: string;
	title: string;
	link: string; // URL
	highlights: Highlight[];
	nHighlights: number;
	favorite: boolean;
	toRead: boolean;
	topics: Topic[];
	comments: Comment[];
	mentions: UserMention[];
	modifiedDate: string;
	users: User[]; // Users who saved this link
	snippets?: string[]; // Extracted snippets
}
```

### User Object

```typescript
interface User {
	id: string;
	firstName: string;
	lastName: string;
	userLink: string; // Profile URL slug
	twitter?: string;
	website?: string;
	createdDate: string;
	followingUsers?: User[];
}
```

## Highlight Rendering

### CSS Classes

```css
.curius-highlight {
	cursor: pointer !important;
}

.curius-own-highlight {
	background-color: #ffe600;
	border-radius: 4px;
}

.curius-other-highlight {
	background-color: rgba(255, 230, 0, 0.1);
	border-bottom: 1px solid #ffe600;
}

.curius-other-highlight:hover {
	background-color: rgba(255, 230, 0, 0.3);
}
```

### Color Generation

Friend highlights use HSL colors generated from the user's first name:

```javascript
function highlightColor(firstName, saturation = 55, lightness = 94) {
	let hash = 0;
	for (let i = 0; i < firstName.length; i++) {
		hash = firstName.charCodeAt(i) + ((hash << 5) - hash);
	}
	const hue = hash % 360;
	return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}
```

## Message Passing

Content script → Background script communication:

```typescript
// Add highlight
runtime.sendMessage({
  action: "addHighlight",
  highlight: {
    highlightText: string,
    position: HighlightPosition
  }
});

// Delete highlight
runtime.sendMessage({
  action: "deleteHighlight",
  highlightText: string
});

// Update highlight with comment
runtime.sendMessage({
  action: "updateHighlight",
  highlight: Highlight,
  commentText: string,
  toUids: string[]  // Tagged user IDs
});
```

## Technologies Used

- **React** — UI framework
- **Axios** — HTTP client (baseURL: curius.app, timeout: 3000ms)
- **Mixpanel** — Analytics (api_host: api-js.mixpanel.com)
- **Material-UI** — Component library
- **PDF.js** — PDF highlighting support
- **Yjs** — Collaborative editing (for real-time features?)
- **Webpack** — Bundler

## Key Behaviors

1. **New Tab Override**: Extension overrides new tab with Curius feed
2. **Context Menu**: Right-click "Save snippet to collection" (Ctrl+Shift+S)
3. **Keyboard Shortcut**: Alt+S opens popup
4. **Auto-save on highlight**: Selecting text shows save bubble
5. **Network fetch**: On page load, fetches friend highlights via `/api/links/url/network`

## Notes for Gloss Implementation

1. **Text-based positioning is robust** — Works across page changes/reloads
2. **Context matching with fallback** — Good UX even when page structure changes
3. **Friend highlights are fetched per-URL** — Could cache for performance
4. **JWT auth is straightforward** — Can implement similar flow
5. **Mixpanel tracking is extensive** — Consider privacy-focused alternative or none

## Migration Path for Curius Users

To support importing Curius data:

1. User authenticates with Curius (if API allows)
2. Fetch user's links via `/api/links`
3. Import highlights with position data
4. Our position format is compatible

Or scrape from curius.app/{userLink} if API access isn't available.
