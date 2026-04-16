(() => {
  const PLAYLIST_KEY = "music_app_playlists_v1";
  const LIKED_KEY = "music_app_liked_songs_v1";
  const LIKED_PLAYLIST_ID = "__liked_songs__";
  const SEARCH_API = "https://maus.qqdl.site/search/?s=";
  const TRACK_API = "https://katze.qqdl.site/track/?quality=LOSSLESS&id=";
  const INFO_API = "https://maus.qqdl.site/info/?id=";
  const CORS_PROXY = "https://api.allorigins.win/raw?url=";
  const COLORS = [
    "#ffb3ba", "#ffccb3", "#ffffb3", "#b3e5b3", "#b3d9ff",
    "#ffb3e6", "#ffcc99", "#ffff99", "#99e699", "#99ccff",
    "#4db3ff", "#b366ff", "#ff6699", "#cc6600", "#669933",
    "#336666", "#999999", "#ff6666", "#ff9999", "#99ff99",
    "#6666ff", "#cc00cc", "#ff0066", "#ff6600", "#66cc00",
  ];

  const state = {
    results: [],
    playlistSearchResults: [],
    queue: [],
    currentIndex: -1,
    repeat: false,
    favorites: new Set(),
    searchAbortController: null,
    playlistSearchAbortController: null,
    view: "search",
    playlists: [],
    selectedPlaylistId: null,
    addingTrackIds: new Set(),
    lyricsVisible: false,
    lyricsCache: new Map(),
    lyricsRequestId: 0,
    lyricsLines: [],
    activeLyricsIndex: -1,
    eqAnimationTimer: null,
    queueLocked: true,
    playlistLocked: true,
    isEditMode: false,
    likedSongs: [],
  };

  const audio = new Audio();
  audio.preload = "metadata";

  const el = {
    wrapper: document.getElementById("wrapper"),
    coverArt: document.getElementById("coverArt"),
    musicIcon: document.getElementById("musicIcon"),
    songTitle: document.getElementById("songTitle"),
    songArtist: document.getElementById("songArtist"),
    currentTime: document.getElementById("currentTime"),
    duration: document.getElementById("duration"),
    progressBar: document.getElementById("progressBar"),
    playPauseButton: document.getElementById("playPauseButton"),
    prevButton: document.getElementById("prevButton"),
    nextButton: document.getElementById("nextButton"),
    repeatButton: document.getElementById("repeatButton"),
    searchInput: document.getElementById("searchInput"),
    searchResults: document.getElementById("searchResults"),
    queueListContainer: document.getElementById("queueListContainer"),
    nowPlayingHeart: document.getElementById("nowPlayingHeart"),
    eqVisualizer: document.getElementById("eqVisualizer"),
    lyricsButton: document.getElementById("lyricsButton"),
    lyricsContent: document.getElementById("lyricsContent"),

    openQueueBtn: document.getElementById("openQueueBtn"),
    openPlaylistsBtn: document.getElementById("openPlaylistsBtn"),
    backToSearchFromQueueBtn: document.getElementById("backToSearchFromQueueBtn"),
    backToSearchBtn: document.getElementById("backToSearchBtn"),
    backToPlaylistsBtn: document.getElementById("backToPlaylistsBtn"),
    backToEditorBtn: document.getElementById("backToEditorBtn"),

    searchView: document.getElementById("searchView"),
    queueView: document.getElementById("queueView"),
    playlistListView: document.getElementById("playlistListView"),
    playlistDetailView: document.getElementById("playlistDetailView"),
    playlistAddSongView: document.getElementById("playlistAddSongView"),
    lyricsView: document.getElementById("lyricsView"),

    createPlaylistBtn: document.getElementById("createPlaylistBtn"),
    playlistListContainer: document.getElementById("playlistListContainer"),
    playlistTracksList: document.getElementById("playlistTracksList"),
    addSongToPlaylistBtn: document.getElementById("addSongToPlaylistBtn"),
    finishAddingSongsBtn: document.getElementById("finishAddingSongsBtn"),
    playlistSearchInput: document.getElementById("playlistSearchInput"),
    playlistSearchResults: document.getElementById("playlistSearchResults"),

    playlistTitleDisplay: document.getElementById("playlistTitleDisplay"),
    playlistDescDisplay: document.getElementById("playlistDescDisplay"),
    playlistColorDot: document.getElementById("playlistColorDot"),
    playlistTitleInput: document.getElementById("playlistTitleInput"),
    playlistDescInput: document.getElementById("playlistDescInput"),
    playlistViewMode: document.getElementById("playlistViewMode"),
    playlistEditMode: document.getElementById("playlistEditMode"),
    toggleEditModeBtn: document.getElementById("toggleEditModeBtn"),
    shufflePlaylistBtn: document.getElementById("shufflePlaylistBtn"),
    lockPlaylistBtn: document.getElementById("lockPlaylistBtn"),
    lockQueueBtn: document.getElementById("lockQueueBtn"),
    colorPickerContainer: document.getElementById("colorPickerContainer"),
    loadingOverlay: document.getElementById("loadingOverlay"),
    loadingText: document.getElementById("loadingText"),
  };

  let loadingPopupCount = 0;
  let loadingTimeoutId = null;

  const showLoadingPopup = (message = "Loading...") => {
    if (!el.loadingOverlay || !el.loadingText) return;

    loadingPopupCount += 1;

    if (loadingPopupCount === 1) {
      el.loadingText.textContent = message;
      el.loadingOverlay.classList.add("visible");
      el.loadingOverlay.setAttribute("aria-hidden", "false");

      loadingTimeoutId = window.setTimeout(() => {
        el.loadingText.textContent = "Timed out. Try reloading.";
      }, 30000);
    }
  };

  const hideLoadingPopup = () => {
    if (!el.loadingOverlay || !el.loadingText) return;

    loadingPopupCount = Math.max(loadingPopupCount - 1, 0);
    if (loadingPopupCount > 0) return;

    if (loadingTimeoutId) {
      clearTimeout(loadingTimeoutId);
      loadingTimeoutId = null;
    }

    el.loadingOverlay.classList.remove("visible");
    el.loadingOverlay.setAttribute("aria-hidden", "true");
    el.loadingText.textContent = "Loading...";
  };

  const formatTime = (seconds) => {
    if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = String(Math.floor(seconds % 60)).padStart(2, "0");
    return `${mins}:${secs}`;
  };

  const toTrack = (raw) => ({
    trackId: Number(raw.trackId || raw.id || Date.now() + Math.random()),
    trackName: raw.trackName || raw.title || "Unknown",
    artistName: raw.artistName || raw.artist?.name || raw.artists?.[0]?.name || "Unknown",
    artworkUrl100:
      raw.artworkUrl100 ||
      (raw.album?.cover
        ? `https://resources.tidal.com/images/${String(raw.album.cover).replace(/-/g, "/")}/640x640.jpg`
        : ""),
    previewUrl: raw.previewUrl || raw.streamUrl || "",
    duration: Number(raw.duration || 0),
  });

  const decodeBase64Json = (value) => {
    try {
      return JSON.parse(atob(value));
    } catch {
      return null;
    }
  };

  const buildProxyUrl = (url) => `${CORS_PROXY}${encodeURIComponent(url)}`;

  const fetchJsonWithCorsFallback = async (url, signal) => {
    try {
      const response = await fetch(url, signal ? { signal } : undefined);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (primaryError) {
      if (signal?.aborted) throw primaryError;
      const fallbackResponse = await fetch(buildProxyUrl(url), signal ? { signal } : undefined);
      if (!fallbackResponse.ok) throw primaryError;
      return await fallbackResponse.json();
    }
  };

  const fetchTrackStreamUrl = async (trackId) => {
    try {
      const payload = await fetchJsonWithCorsFallback(`${TRACK_API}${encodeURIComponent(trackId)}`);
      const manifest = decodeBase64Json(payload?.data?.manifest || "");
      return manifest?.urls?.[0] || "";
    } catch {
      return "";
    }
  };

  const fetchTrackInfo = async (trackId) => {
    try {
      const payload = await fetchJsonWithCorsFallback(`${INFO_API}${encodeURIComponent(trackId)}`);
      return payload?.data || null;
    } catch {
      return null;
    }
  };

  const persistPlaylists = () => {
    localStorage.setItem(PLAYLIST_KEY, JSON.stringify(state.playlists));
  };

  const persistLikedSongs = () => {
    localStorage.setItem(LIKED_KEY, JSON.stringify(state.likedSongs));
  };

  const loadPlaylists = () => {
    try {
      const parsed = JSON.parse(localStorage.getItem(PLAYLIST_KEY) || "[]");
      if (Array.isArray(parsed)) {
        state.playlists = parsed.map((p) => ({
          id: p.id || crypto.randomUUID(),
          name: p.name || "Playlist",
          description: p.description || "",
          color: p.color || "#8b9099",
          tracks: Array.isArray(p.tracks) ? p.tracks.map(toTrack) : [],
        }));
      }
    } catch {
      state.playlists = [];
    }
  };

  const loadLikedSongs = () => {
    try {
      const parsed = JSON.parse(localStorage.getItem(LIKED_KEY) || "[]");
      state.likedSongs = Array.isArray(parsed) ? parsed.map(toTrack) : [];
    } catch {
      state.likedSongs = [];
    }
  };

  const isLiked = (trackId) =>
    state.likedSongs.some((track) => Number(track.trackId) === Number(trackId));

  const updateLikedTrack = (track) => {
    const index = state.likedSongs.findIndex((item) => Number(item.trackId) === Number(track.trackId));
    if (index >= 0) {
      state.likedSongs.splice(index, 1);
      persistLikedSongs();
      return false;
    }

    state.likedSongs.unshift(toTrack(track));
    persistLikedSongs();
    return true;
  };

  const refreshPlaylistViews = () => {
    renderPlaylistList();
    if (state.selectedPlaylistId === LIKED_PLAYLIST_ID || getSelectedPlaylist()) {
      renderPlaylistDetail();
    }
  };

  const openConfirmModal = (message, onConfirm) => {
    const overlay = document.getElementById("modalOverlay");
    const modalContent = document.getElementById("modalContent");
    const modalButtonContainer = document.getElementById("modalButtonContainer");

    modalContent.textContent = message;
    modalButtonContainer.innerHTML = `
      <button class="modal-secondary" type="button" id="modalCancelButton">Cancel</button>
      <button id="modalButton" type="button">Delete</button>
    `;

    const close = () => {
      overlay.classList.remove("visible");
      modalButtonContainer.innerHTML = '<button id="modalButton">OK</button>';
    };

    document.getElementById("modalCancelButton").onclick = close;
    document.getElementById("modalButton").onclick = () => {
      onConfirm();
      close();
    };

    overlay.classList.add("visible");
  };

  const getSelectedPlaylist = () =>
    state.selectedPlaylistId === LIKED_PLAYLIST_ID
      ? {
          id: LIKED_PLAYLIST_ID,
          name: "Liked Songs",
          description: `${state.likedSongs.length} songs`,
          color: "#9a9a9a",
          tracks: state.likedSongs,
          locked: true,
        }
      : state.playlists.find((p) => p.id === state.selectedPlaylistId) || null;

  const escapeHtml = (str) =>
    String(str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");

  const setView = (name) => {
    state.view = name;
    const views = [
      [el.searchView, "search"],
      [el.queueView, "queue"],
      [el.playlistListView, "playlist-list"],
      [el.playlistDetailView, "playlist-detail"],
      [el.playlistAddSongView, "playlist-add"],
      [el.lyricsView, "lyrics"],
    ];

    views.forEach(([node, nodeName]) => {
      const active = nodeName === name;
      node.classList.toggle("view-active", active);
      node.classList.toggle("view-hidden", !active);
    });
  };

  const updateControlState = () => {
    const hasTrack = Boolean(audio.src);
    [el.playPauseButton, el.prevButton, el.nextButton, el.repeatButton, el.lyricsButton].forEach((button) => {
      button.disabled = !hasTrack;
    });
  };

  const setPlayingIcon = (isPlaying) => {
    const icon = el.playPauseButton.querySelector("i");
    icon.className = isPlaying ? "ri-pause-circle-fill" : "ri-play-circle-fill";
  };

  const startEqAnimation = () => {
    const bars = el.eqVisualizer.querySelectorAll(".eq-bar");
    if (!bars.length) return;

    const tick = () => {
      if (audio.paused) return;
      bars.forEach((bar) => {
        const scale = 0.18 + Math.random() * 0.9;
        bar.style.transform = `scaleY(${scale.toFixed(2)})`;
      });
      state.eqAnimationTimer = window.setTimeout(tick, 90);
    };

    if (state.eqAnimationTimer) {
      clearTimeout(state.eqAnimationTimer);
    }
    tick();
  };

  const stopEqAnimation = () => {
    if (state.eqAnimationTimer) {
      clearTimeout(state.eqAnimationTimer);
      state.eqAnimationTimer = null;
    }

    el.eqVisualizer.querySelectorAll(".eq-bar").forEach((bar) => {
      bar.style.transform = "scaleY(0.1)";
    });
  };

  const setSongInfo = (track) => {
    if (!track) {
      el.songTitle.textContent = "Not Playing";
      el.songArtist.textContent = "Try searching on the right";
      el.musicIcon.style.display = "block";
      el.nowPlayingHeart.classList.remove("ri-heart-fill");
      el.nowPlayingHeart.classList.add("ri-heart-line");
      el.nowPlayingHeart.style.opacity = "0.3";
      el.nowPlayingHeart.style.color = "";
      const img = el.coverArt.querySelector("img");
      if (img) img.remove();
      updateControlState();
      return;
    }

    el.songTitle.textContent = track.trackName;
    el.songArtist.textContent = track.artistName;

    let img = el.coverArt.querySelector("img");
    if (!img) {
      img = document.createElement("img");
      el.coverArt.prepend(img);
    }

    img.src = track.artworkUrl100.replace(/100x100bb/g, "512x512bb");
    img.alt = `${track.trackName} cover`;
    el.musicIcon.style.display = "none";

    const active = isLiked(track.trackId);
    el.nowPlayingHeart.classList.toggle("ri-heart-fill", active);
    el.nowPlayingHeart.classList.toggle("ri-heart-line", !active);
    el.nowPlayingHeart.style.opacity = active ? "1" : "0.3";
    el.nowPlayingHeart.style.color = active ? "var(--accent)" : "";
  };

  const setActiveTrackInLists = () => {
    const current = state.queue[state.currentIndex];
    const currentId = current?.trackId;

    document.querySelectorAll(".result-item[data-track-id]").forEach((node) => {
      const id = Number(node.dataset.trackId);
      node.classList.toggle("active", currentId && id === Number(currentId));
    });
  };

  const createTrackNode = (track, opts = {}) => {
    const item = document.createElement("div");
    item.className = "result-item";
    item.dataset.trackId = String(track.trackId);

    const favClass = isLiked(track.trackId)
      ? "favorite-btn ri-heart-fill"
      : "favorite-btn ri-heart-line";

    const showDelete = opts.showDelete ? '<i class="ri-delete-bin-6-line remove-track-btn"></i>' : "";
    const showFav = opts.showFavorite ? `<i class="${favClass}"></i>` : "";

    item.innerHTML = `
      <div class="result-art">
        ${
          track.artworkUrl100
            ? `<img src="${escapeHtml(track.artworkUrl100)}" alt="${escapeHtml(track.trackName)}" loading="lazy" />`
            : '<i class="ri-music-2-line"></i>'
        }
      </div>
      <div class="result-text">
        <div class="result-title">${escapeHtml(track.trackName)}</div>
        <div class="result-artist">${escapeHtml(track.artistName)}</div>
      </div>
      ${showFav}
      ${showDelete}
    `;

    if (typeof opts.onClick === "function") {
      item.addEventListener("click", (event) => {
        if (event.target.closest(".remove-track-btn") || event.target.closest(".favorite-btn")) {
          return;
        }
        opts.onClick(track);
      });
    }

    const favBtn = item.querySelector(".favorite-btn");
    if (favBtn) {
      favBtn.addEventListener("click", () => {
        const liked = updateLikedTrack(track);
        favBtn.className = liked
          ? "favorite-btn ri-heart-fill"
          : "favorite-btn ri-heart-line";
        refreshPlaylistViews();
      });
    }

    const removeBtn = item.querySelector(".remove-track-btn");
    if (removeBtn && typeof opts.onDelete === "function") {
      removeBtn.addEventListener("click", () => opts.onDelete(track));
    }

    return item;
  };

  const renderSearchResults = () => {
    el.searchResults.innerHTML = "";

    if (!state.results.length) {
      el.searchResults.innerHTML = `
        <div class="lyrics-status-container pulse-vibe" style="pointer-events:none; position:relative; min-height:220px;">
          <i class="ri-search-line"></i>
          <span>Try searching \"test\"</span>
        </div>
      `;
      return;
    }

    state.results.forEach((track) => {
      const node = createTrackNode(track, {
        showFavorite: true,
        onClick: async (picked) => {
          state.queue = [...state.results];
          state.currentIndex = state.queue.findIndex((t) => t.trackId === picked.trackId);
          renderQueue();
          await playCurrent();
        },
      });
      el.searchResults.appendChild(node);
    });

    setActiveTrackInLists();
  };

  const renderQueue = () => {
    el.queueListContainer.innerHTML = "";

    if (!state.queue.length) {
      el.queueListContainer.innerHTML = '<div class="empty-state-msg">Queue is empty</div>';
      updateControlState();
      return;
    }

    state.queue.forEach((track, index) => {
      const node = createTrackNode(track, {
        onClick: async () => {
          state.currentIndex = index;
          await playCurrent();
        },
        onDelete: () => {
          state.queue.splice(index, 1);
          if (state.currentIndex >= state.queue.length) {
            state.currentIndex = state.queue.length - 1;
          }
          renderQueue();
          if (state.currentIndex >= 0) playCurrent();
          else {
            audio.pause();
            audio.removeAttribute("src");
            setSongInfo(null);
            updateControlState();
          }
        },
        showDelete: true,
      });
      el.queueListContainer.appendChild(node);
    });

    setActiveTrackInLists();
  };

  const renderPlaylistList = () => {
    const createBtn = el.createPlaylistBtn;
    el.playlistListContainer.innerHTML = "";
    if (createBtn) el.playlistListContainer.appendChild(createBtn);

    const likedCard = document.createElement("div");
    likedCard.className = "result-item liked-playlist-card";
    likedCard.innerHTML = `
      <div class="result-art liked-playlist-art">
        <i class="ri-heart-3-fill"></i>
      </div>
      <div class="result-text">
        <div class="result-title">Liked Songs</div>
        <div class="result-artist">${state.likedSongs.length} songs</div>
      </div>
    `;
    likedCard.addEventListener("click", () => {
      state.selectedPlaylistId = LIKED_PLAYLIST_ID;
      state.isEditMode = false;
      renderPlaylistDetail();
      setView("playlist-detail");
    });
    el.playlistListContainer.appendChild(likedCard);

    state.playlists.forEach((playlist) => {
      const item = document.createElement("div");
      item.className = "result-item playlist-card";
      item.innerHTML = `
        <div class="result-art" style="background:${escapeHtml(playlist.color)}33;border:1px solid ${escapeHtml(playlist.color)}66;">
          <i class="ri-music-2-line"></i>
        </div>
        <div class="result-text">
          <div class="result-title">${escapeHtml(playlist.name)}</div>
          <div class="result-artist">${playlist.tracks.length} songs</div>
        </div>
        <button class="playlist-delete-btn" type="button" aria-label="Delete playlist">
          <i class="ri-close-line"></i>
        </button>
      `;
      item.addEventListener("click", () => {
        state.selectedPlaylistId = playlist.id;
        state.isEditMode = false;
        renderPlaylistDetail();
        setView("playlist-detail");
      });
      item.querySelector(".playlist-delete-btn").addEventListener("click", (event) => {
        event.stopPropagation();
        openConfirmModal(`Delete playlist \"${playlist.name}\"?`, () => {
          state.playlists = state.playlists.filter((p) => p.id !== playlist.id);
          if (state.selectedPlaylistId === playlist.id) {
            state.selectedPlaylistId = null;
            setView("playlist-list");
          }
          persistPlaylists();
          renderPlaylistList();
        });
      });
      el.playlistListContainer.appendChild(item);
    });
  };

  const renderPlaylistDetail = () => {
    const playlist = getSelectedPlaylist();
    if (!playlist) {
      setView("playlist-list");
      return;
    }

    el.playlistTitleDisplay.textContent = playlist.name;
    el.playlistDescDisplay.textContent = playlist.description || "No description";
    el.playlistColorDot.style.background = playlist.color;

    el.playlistTitleInput.value = playlist.name;
    el.playlistDescInput.value = playlist.description;

    const isLikedPlaylist = playlist.id === LIKED_PLAYLIST_ID;
    el.playlistColorDot.style.display = isLikedPlaylist ? "none" : "inline-block";
    el.playlistViewMode.style.display = "flex";
    el.playlistEditMode.style.display = state.isEditMode && !isLikedPlaylist ? "flex" : "none";
    el.toggleEditModeBtn.style.display = isLikedPlaylist ? "none" : "inline-flex";
    el.shufflePlaylistBtn.style.display = isLikedPlaylist ? "none" : "inline-flex";
    el.lockPlaylistBtn.style.display = isLikedPlaylist ? "none" : "inline-flex";
    el.addSongToPlaylistBtn.style.display = isLikedPlaylist ? "none" : "flex";
    el.toggleEditModeBtn.className = state.isEditMode
      ? "ri-check-line playlist-edit-toggle"
      : "ri-pencil-line playlist-edit-toggle";

    if (state.isEditMode && el.colorPickerContainer) {
      el.colorPickerContainer.innerHTML = "";
      COLORS.forEach((color) => {
        const swatch = document.createElement("div");
        swatch.className = "color-swatch";
        swatch.style.background = color;
        if (color === playlist.color) swatch.classList.add("selected");
        swatch.addEventListener("click", () => {
          playlist.color = color;
          el.playlistColorDot.style.background = color;
          document.querySelectorAll(".color-swatch").forEach((s) => s.classList.remove("selected"));
          swatch.classList.add("selected");
          persistPlaylists();
        });
        el.colorPickerContainer.appendChild(swatch);
      });
    }

    if (isLikedPlaylist) {
      el.playlistDescDisplay.textContent = `${playlist.tracks.length} songs you liked`;
      el.playlistColorDot.style.background = "#9a9a9a";
    }

    el.playlistTracksList.innerHTML = "";
    if (!playlist.tracks.length) {
      el.playlistTracksList.innerHTML = '<div class="empty-state-msg">No tracks yet</div>';
      return;
    }

    playlist.tracks.forEach((track) => {
      const node = createTrackNode(track, {
        onClick: async (picked) => {
          state.queue = [...playlist.tracks];
          state.currentIndex = state.queue.findIndex((t) => t.trackId === picked.trackId);
          renderQueue();
          await playCurrent();
        },
        onDelete: (picked) => {
          if (playlist.id === LIKED_PLAYLIST_ID) {
            state.likedSongs = state.likedSongs.filter((t) => t.trackId !== picked.trackId);
            persistLikedSongs();
            refreshPlaylistViews();
            return;
          }

          playlist.tracks = playlist.tracks.filter((t) => t.trackId !== picked.trackId);
          persistPlaylists();
          renderPlaylistDetail();
          renderPlaylistList();
        },
        showDelete: true,
      });
      el.playlistTracksList.appendChild(node);
    });

    setActiveTrackInLists();
  };

  const renderPlaylistAddResults = () => {
    el.playlistSearchResults.innerHTML = "";

    if (!state.playlistSearchResults.length) {
      el.playlistSearchResults.innerHTML = `
        <div class="lyrics-status-container pulse-vibe" style="pointer-events:none; position:relative; min-height:220px;">
          <i class="ri-search-eye-line"></i>
          <span>Search songs to add</span>
        </div>
      `;
      return;
    }

    state.playlistSearchResults.forEach((track) => {
      const node = createTrackNode(track, {
        onClick: (picked) => {
          if (state.addingTrackIds.has(picked.trackId)) state.addingTrackIds.delete(picked.trackId);
          else state.addingTrackIds.add(picked.trackId);
          node.classList.toggle("selected-item", state.addingTrackIds.has(picked.trackId));
          el.finishAddingSongsBtn.style.display = state.addingTrackIds.size ? "inline-block" : "none";
        },
      });
      node.classList.toggle("selected-item", state.addingTrackIds.has(track.trackId));
      el.playlistSearchResults.appendChild(node);
    });
  };

  const searchTracks = async (query, target = "main") => {
    const normalized = query.trim();
    const abortKey = target === "main" ? "searchAbortController" : "playlistSearchAbortController";

    if (state[abortKey]) state[abortKey].abort();

    if (!normalized) {
      if (target === "main") {
        state.results = [];
        renderSearchResults();
      } else {
        state.playlistSearchResults = [];
        renderPlaylistAddResults();
      }
      return;
    }

    const controller = new AbortController();
    state[abortKey] = controller;
    showLoadingPopup("Searching...");

    try {
      const data = await fetchJsonWithCorsFallback(
        `${SEARCH_API}${encodeURIComponent(normalized)}`,
        controller.signal
      );
      const items = data?.data?.items || [];
      const tracks = items.filter((x) => x.allowStreaming !== false).slice(0, 35).map(toTrack);

      if (target === "main") {
        state.results = tracks;
        renderSearchResults();
      } else {
        state.playlistSearchResults = tracks;
        renderPlaylistAddResults();
      }
    } catch (error) {
      if (error.name === "AbortError") return;
      if (target === "main") {
        state.results = [];
        renderSearchResults();
      } else {
        state.playlistSearchResults = [];
        renderPlaylistAddResults();
      }
    } finally {
      hideLoadingPopup();
    }
  };

  const renderLyricsText = (text) => {
    el.lyricsContent.innerHTML = "";
    const rawLines = String(text || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    const parsedLines = rawLines
      .map((line) => {
        const match = line.match(/^\[(\d{1,2}):(\d{2})(?:\.(\d{1,2}))?\]\s*(.*)$/);
        if (!match) {
          return { time: null, text: line };
        }

        const minutes = Number(match[1]);
        const seconds = Number(match[2]);
        const hundredths = Number(match[3] || 0);
        return {
          time: minutes * 60 + seconds + hundredths / 100,
          text: match[4].trim(),
        };
      })
      .filter((line) => line.text);

    state.lyricsLines = parsedLines;
    state.activeLyricsIndex = -1;

    if (!parsedLines.length) {
      el.lyricsContent.innerHTML = `
        <div class="lyrics-status-container" style="position:relative;min-height:220px;">
          <i class="ri-chat-quote-line"></i>
          <span>Lyrics unavailable for this track</span>
        </div>
      `;
      return;
    }

    parsedLines.forEach((line, index) => {
      const row = document.createElement("div");
      row.className = "lyric-line future";
      row.textContent = line.text;
      row.dataset.index = String(index);
      if (index === 0) row.classList.add("active");
      row.addEventListener("click", () => {
        const hasTimedLyrics = state.lyricsLines.some((entry) => entry.time != null);
        if (hasTimedLyrics && line.time != null) {
          audio.currentTime = Math.max(line.time, 0);
          updateLyricsPlayback(audio.currentTime);
        } else {
          const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 30;
          const step = duration / Math.max(state.lyricsLines.length, 1);
          audio.currentTime = Math.max(index * step, 0);
          updateLyricsPlayback(audio.currentTime);
        }

        if (audio.paused) {
          audio.play().catch(() => {});
        }

        el.lyricsContent.querySelectorAll(".lyric-line").forEach((n) => n.classList.remove("active"));
        row.classList.add("active");
      });
      el.lyricsContent.appendChild(row);
    });
  };

  const updateLyricsPlayback = (currentTime) => {
    if (!state.lyricsLines.length) return;

    const hasTimedLyrics = state.lyricsLines.some((line) => line.time != null);
    let nextIndex = -1;

    if (hasTimedLyrics) {
      for (let index = 0; index < state.lyricsLines.length; index += 1) {
        const line = state.lyricsLines[index];
        if (line.time == null) continue;
        if (currentTime >= line.time) nextIndex = index;
        else break;
      }
    } else {
      const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 30;
      const step = duration / Math.max(state.lyricsLines.length, 1);
      nextIndex = Math.min(state.lyricsLines.length - 1, Math.max(0, Math.floor(currentTime / step)));
    }

    if (nextIndex === state.activeLyricsIndex) return;
    state.activeLyricsIndex = nextIndex;

    const lyricNodes = el.lyricsContent.querySelectorAll(".lyric-line");
    lyricNodes.forEach((node, index) => {
      const isActive = index === nextIndex;
      const isPast = nextIndex >= 0 && index < nextIndex;
      const isFuture = nextIndex >= 0 && index > nextIndex;
      node.classList.toggle("active", isActive);
      node.classList.toggle("past", isPast);
      node.classList.toggle("future", isFuture || nextIndex < 0);
    });

    const activeNode = lyricNodes[nextIndex];
    if (activeNode) {
      activeNode.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  };

  const loadLyrics = async (track) => {
    if (!track) return;

    const key = `${track.artistName}::${track.trackName}`.toLowerCase();
    if (state.lyricsCache.has(key)) {
      renderLyricsText(state.lyricsCache.get(key));
      return;
    }

    const requestId = ++state.lyricsRequestId;
    el.lyricsContent.innerHTML = `
      <div class="lyrics-status-container" style="position:relative;min-height:220px;">
        <div class="loading-wave"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>
        <span>Loading lyrics...</span>
      </div>
    `;

    const normalizeName = (value) =>
      String(value)
        .replace(/\s*\(.*?\)\s*/g, " ")
        .replace(/\s*\[.*?\]\s*/g, " ")
        .replace(/feat\.?|ft\.?/gi, " ")
        .replace(/[^\w\s']/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    const sources = [
      async () => {
        const url = `https://lrclib.net/api/get?artist_name=${encodeURIComponent(normalizeName(track.artistName))}&track_name=${encodeURIComponent(normalizeName(track.trackName))}`;
        const response = await fetch(url);
        if (!response.ok) return "";
        const data = await response.json();
        return data?.syncedLyrics || data?.plainLyrics || "";
      },
      async () => {
        const url = `https://api.lyrics.ovh/v1/${encodeURIComponent(track.artistName)}/${encodeURIComponent(track.trackName)}`;
        const response = await fetch(url);
        const data = await response.json();
        return data?.lyrics || "";
      },
    ];

    try {
      let lyrics = "";
      for (const source of sources) {
        lyrics = await source();
        if (lyrics) break;
      }

      lyrics = String(lyrics).trim();

      if (requestId !== state.lyricsRequestId) return;

      state.lyricsCache.set(key, lyrics);
      renderLyricsText(lyrics);
    } catch {
      if (requestId !== state.lyricsRequestId) return;
      renderLyricsText("");
    }
  };

  const playCurrent = async () => {
    const track = state.queue[state.currentIndex];
    if (!track?.trackId) return;

    showLoadingPopup("Loading track...");

    try {
      const info = await fetchTrackInfo(track.trackId);
      if (info) {
        track.trackName = info.title || track.trackName;
        track.artistName = info.artist?.name || track.artistName;
        if (info.album?.cover) {
          track.artworkUrl100 = `https://resources.tidal.com/images/${String(info.album.cover).replace(/-/g, "/")}/640x640.jpg`;
        }
      }

      if (!track.previewUrl) {
        track.previewUrl = await fetchTrackStreamUrl(track.trackId);
      }

      if (!track.previewUrl) return;

      audio.src = track.previewUrl;
      setSongInfo(track);
      setActiveTrackInLists();
      loadLyrics(track);

      try {
        await audio.play();
      } catch {
        setPlayingIcon(false);
        el.eqVisualizer.classList.remove("playing");
      }

      updateControlState();
    } finally {
      hideLoadingPopup();
    }
  };

  const createPlaylist = () => {
    const number = state.playlists.length + 1;
    const playlist = {
      id: crypto.randomUUID(),
      name: `Playlist ${number}`,
      description: "",
      color: "#80858e",
      tracks: [],
    };
    state.playlists.unshift(playlist);
    state.selectedPlaylistId = playlist.id;
    persistPlaylists();
    renderPlaylistList();
    renderPlaylistDetail();
    setView("playlist-detail");
  };

  const addSelectedTracksToPlaylist = () => {
    const playlist = getSelectedPlaylist();
    if (!playlist) return;

    const toAdd = state.playlistSearchResults.filter((t) => state.addingTrackIds.has(t.trackId));
    const existing = new Set(playlist.tracks.map((t) => t.trackId));

    toAdd.forEach((track) => {
      if (!existing.has(track.trackId)) playlist.tracks.push(track);
    });

    persistPlaylists();
    state.addingTrackIds.clear();
    state.playlistSearchResults = [];
    el.playlistSearchInput.value = "";
    el.finishAddingSongsBtn.style.display = "none";
    renderPlaylistDetail();
    setView("playlist-detail");
  };

  const shufflePlaylist = async () => {
    const playlist = getSelectedPlaylist();
    if (!playlist?.tracks.length) return;

    const shuffled = [...playlist.tracks]
      .map((value) => ({ value, sort: Math.random() }))
      .sort((a, b) => a.sort - b.sort)
      .map(({ value }) => value);

    state.queue = shuffled;
    state.currentIndex = 0;
    renderQueue();
    await playCurrent();
    setView("queue");
  };

  let mainSearchDebounce;
  el.searchInput.addEventListener("input", (event) => {
    clearTimeout(mainSearchDebounce);
    mainSearchDebounce = setTimeout(() => searchTracks(event.target.value, "main"), 260);
  });

  let playlistSearchDebounce;
  el.playlistSearchInput.addEventListener("input", (event) => {
    clearTimeout(playlistSearchDebounce);
    playlistSearchDebounce = setTimeout(() => searchTracks(event.target.value, "playlist"), 260);
  });

  el.playPauseButton.addEventListener("click", async () => {
    if (!audio.src) return;

    if (audio.paused) {
      try {
        await audio.play();
      } catch {
        setPlayingIcon(false);
      }
      return;
    }

    audio.pause();
  });

  el.prevButton.addEventListener("click", async () => {
    if (!state.queue.length || !audio.src) return;
    state.currentIndex = (state.currentIndex - 1 + state.queue.length) % state.queue.length;
    await playCurrent();
  });

  el.nextButton.addEventListener("click", async () => {
    if (!state.queue.length || !audio.src) return;
    state.currentIndex = (state.currentIndex + 1) % state.queue.length;
    await playCurrent();
  });

  el.repeatButton.addEventListener("click", () => {
    if (!audio.src) return;
    state.repeat = !state.repeat;
    el.repeatButton.classList.toggle("active", state.repeat);
  });

  el.lyricsButton.addEventListener("click", () => {
    if (!audio.src) return;
    state.lyricsVisible = !state.lyricsVisible;
    setView(state.lyricsVisible ? "lyrics" : "search");
    el.wrapper.classList.toggle("lyrics-mode", state.lyricsVisible);
    el.lyricsButton.classList.toggle("active", state.lyricsVisible);
  });

  el.openQueueBtn.addEventListener("click", () => setView("queue"));
  el.openPlaylistsBtn.addEventListener("click", () => {
    renderPlaylistList();
    setView("playlist-list");
  });
  el.backToSearchFromQueueBtn.addEventListener("click", () => setView("search"));
  el.backToSearchBtn.addEventListener("click", () => setView("search"));
  el.backToPlaylistsBtn.addEventListener("click", () => setView("playlist-list"));
  el.backToEditorBtn.addEventListener("click", () => setView("playlist-detail"));

  el.createPlaylistBtn.addEventListener("click", createPlaylist);
  el.addSongToPlaylistBtn.addEventListener("click", () => {
    state.addingTrackIds.clear();
    el.finishAddingSongsBtn.style.display = "none";
    state.playlistSearchResults = [];
    el.playlistSearchInput.value = "";
    renderPlaylistAddResults();
    setView("playlist-add");
  });

  el.finishAddingSongsBtn.addEventListener("click", addSelectedTracksToPlaylist);

  el.toggleEditModeBtn.addEventListener("click", () => {
    const playlist = getSelectedPlaylist();
    if (!playlist) return;

    if (state.isEditMode) {
      playlist.name = el.playlistTitleInput.value.trim() || playlist.name;
      playlist.description = el.playlistDescInput.value.trim();
      persistPlaylists();
      renderPlaylistList();
    }

    state.isEditMode = !state.isEditMode;
    renderPlaylistDetail();
  });

  el.shufflePlaylistBtn.addEventListener("click", shufflePlaylist);

  el.lockQueueBtn.addEventListener("click", () => {
    state.queueLocked = !state.queueLocked;
    el.lockQueueBtn.className = `${state.queueLocked ? "ri-lock-line" : "ri-lock-unlock-line"} playlist-edit-toggle`;
  });

  el.lockPlaylistBtn.addEventListener("click", () => {
    state.playlistLocked = !state.playlistLocked;
    el.lockPlaylistBtn.className = `${state.playlistLocked ? "ri-lock-line" : "ri-lock-unlock-line"} playlist-edit-toggle`;
  });

  el.nowPlayingHeart.addEventListener("click", () => {
    const current = state.queue[state.currentIndex];
    if (!current) return;
    const active = updateLikedTrack(current);
    refreshPlaylistViews();
    el.nowPlayingHeart.classList.toggle("ri-heart-fill", active);
    el.nowPlayingHeart.classList.toggle("ri-heart-line", !active);
    el.nowPlayingHeart.style.opacity = active ? "1" : "0.3";
    el.nowPlayingHeart.style.color = active ? "var(--accent)" : "";
  });

  audio.addEventListener("timeupdate", () => {
    const current = audio.currentTime || 0;
    const total = audio.duration || 0;

    el.currentTime.textContent = formatTime(current);
    el.duration.textContent = formatTime(total);

    const progress = total ? (current / total) * 100 : 0;
    el.progressBar.value = String(progress);
    el.progressBar.style.background = `linear-gradient(to right, var(--accent) ${progress}%, rgba(var(--cb), 0.2) ${progress}%)`;

    updateLyricsPlayback(current);

  });

  audio.addEventListener("loadedmetadata", () => {
    el.duration.textContent = formatTime(audio.duration);
  });

  audio.addEventListener("play", () => {
    setPlayingIcon(true);
    el.eqVisualizer.classList.add("playing");
    startEqAnimation();
    updateControlState();
  });

  audio.addEventListener("pause", () => {
    setPlayingIcon(false);
    el.eqVisualizer.classList.remove("playing");
    stopEqAnimation();
    updateControlState();
  });

  audio.addEventListener("ended", async () => {
    if (!state.queue.length) return;
    if (state.repeat) {
      await playCurrent();
      return;
    }

    state.currentIndex = (state.currentIndex + 1) % state.queue.length;
    await playCurrent();
  });

  el.progressBar.addEventListener("input", () => {
    const total = audio.duration || 0;
    if (!total) return;
    audio.currentTime = (Number(el.progressBar.value) / 100) * total;
  });

  el.progressBar.addEventListener("pointerdown", () => {
    el.progressBar.classList.add("visible");
  });

  el.progressBar.addEventListener("pointerup", () => {
    setTimeout(() => el.progressBar.classList.remove("visible"), 180);
  });

  loadPlaylists();
  loadLikedSongs();
  setSongInfo(null);
  renderSearchResults();
  renderQueue();
  renderPlaylistList();
  renderPlaylistAddResults();
  updateControlState();
  setView("search");

  localStorage.removeItem("music_app_player_state_v1");

  el.currentTime.textContent = "0:00";
  el.duration.textContent = "0:00";
})();
