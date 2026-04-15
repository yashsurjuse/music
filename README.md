# Simple Music Player

A lightweight browser-based music player with search, queue management, playlists, lyrics view, and persistent local state.

## Features

- Search tracks and play directly in the browser
- Queue support with next/previous controls
- Playlist creation and editing
- Liked songs list
- Lyrics panel with line highlighting and click-to-seek behavior
- Repeat mode and playback progress controls
- Local persistence for playlists, liked songs, and last playback state

## Project Structure

- `index.html` - app markup
- `style.css` - styles and layout
- `script.js` - player logic and API integration

## Run Locally

Because this is a static frontend app, you can run it with any simple local web server.

Example with Python:

```bash
python3 -m http.server 5500
```

Then open:

```text
http://localhost:5500
```

## Notes

- No build step is required.
- Data is stored in browser `localStorage`.
