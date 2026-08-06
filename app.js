(function startFormationStudio() {
  "use strict";

  const {
    clamp,
    formatTime,
    getLatestKeyframeTime,
    getPositionAtTime,
    hasPointerMoved,
    isValidProjectData,
    normalizeKeyframes,
    upsertKeyframe,
  } = window.ChoreoCore;

  const MAX_DANCERS = 50;
  const STORAGE_KEY = "formation-studio-project-v1";
  const PALETTE = [
    "#7156d9",
    "#e0527d",
    "#249e8c",
    "#e58a32",
    "#4479d9",
    "#a74eb5",
    "#d55545",
    "#5f8e3e",
    "#2b96b8",
    "#8b6a45",
  ];

  const elements = {
    addDancerButton: document.querySelector("#add-dancer-button"),
    audioFileButton: document.querySelector("#audio-file-button"),
    audioDetails: document.querySelector("#audio-details"),
    audioDuration: document.querySelector("#audio-duration"),
    audioInput: document.querySelector("#audio-input"),
    audioName: document.querySelector("#audio-name"),
    audioPlayer: document.querySelector("#audio-player"),
    currentTime: document.querySelector("#current-time"),
    coordinateEditor: document.querySelector("#coordinate-editor"),
    dancerCount: document.querySelector("#dancer-count"),
    dancerList: document.querySelector("#dancer-list"),
    durationInput: document.querySelector("#duration-input"),
    emptyStage: document.querySelector("#empty-stage"),
    exportButton: document.querySelector("#export-button"),
    importInput: document.querySelector("#import-input"),
    importButton: document.querySelector("#import-button"),
    keyframeList: document.querySelector("#keyframe-list"),
    keyframeTrack: document.querySelector("#keyframe-track"),
    markerLayer: document.querySelector("#marker-layer"),
    playButton: document.querySelector("#play-button"),
    playIcon: document.querySelector("#play-icon"),
    projectTitle: document.querySelector("#project-title"),
    removeAudioButton: document.querySelector("#remove-audio-button"),
    recordCoordinatesButton: document.querySelector("#record-coordinates-button"),
    restartButton: document.querySelector("#restart-button"),
    saveStatus: document.querySelector("#save-status"),
    selectionText: document.querySelector("#selection-text"),
    stage: document.querySelector("#stage"),
    timeline: document.querySelector("#timeline"),
    toast: document.querySelector("#toast"),
    totalTime: document.querySelector("#total-time"),
    videoDetails: document.querySelector("#video-details"),
    videoDuration: document.querySelector("#video-duration"),
    videoFileButton: document.querySelector("#video-file-button"),
    videoInput: document.querySelector("#video-input"),
    videoName: document.querySelector("#video-name"),
    videoPlayer: document.querySelector("#video-player"),
    videoPlayerWrap: document.querySelector("#video-player-wrap"),
    videoVolumeInput: document.querySelector("#video-volume-input"),
    removeVideoButton: document.querySelector("#remove-video-button"),
    volumeInput: document.querySelector("#volume-input"),
    xInput: document.querySelector("#x-input"),
    yInput: document.querySelector("#y-input"),
  };

  const state = {
    currentTime: 0,
    dancerCounter: 0,
    dancers: [],
    duration: 60,
    isPlaying: false,
    markerElements: new Map(),
    playbackOrigin: 0,
    playbackStartedAt: 0,
    projectTitle: "Untitled choreography",
    rafId: null,
    selectedDancerId: null,
    audioUrl: null,
    videoUrl: null,
  };

  let saveTimer = null;
  let toastTimer = null;

  function getSelectedDancer() {
    return state.dancers.find((dancer) => dancer.id === state.selectedDancerId) || null;
  }

  function getLoadedMediaPlayers() {
    const players = [];
    if (state.audioUrl) players.push(elements.audioPlayer);
    if (state.videoUrl) players.push(elements.videoPlayer);
    return players;
  }

  function getMasterMediaPlayer() {
    return getLoadedMediaPlayers()
      .filter((player) => Number.isFinite(player.duration) && player.duration > 0)
      .sort((left, right) => right.duration - left.duration)[0] || null;
  }

  function updateDurationFromMedia(allowKeyframeFloor = false) {
    const durations = getLoadedMediaPlayers()
      .map((player) => player.duration)
      .filter((duration) => Number.isFinite(duration) && duration > 0);
    const hasMedia = state.audioUrl !== null || state.videoUrl !== null;
    elements.durationInput.disabled = hasMedia;
    if (durations.length === 0) return true;

    const mediaDuration = Math.max(...durations);
    const latestFrame = getLatestKeyframeTime(state.dancers);
    if (!allowKeyframeFloor && mediaDuration < latestFrame) return false;
    return updateDuration(Math.max(mediaDuration, allowKeyframeFloor ? latestFrame : 0));
  }

  function createDefaultPosition(index) {
    const angle = index * 2.3999632297;
    const ring = Math.min(24, 4 + Math.sqrt(index + 1) * 5.5);
    return {
      x: clamp(50 + Math.cos(angle) * ring, 5, 95),
      y: clamp(50 + Math.sin(angle) * ring, 7, 90),
    };
  }

  function addDancer() {
    if (state.dancers.length >= MAX_DANCERS) {
      showToast("The stage supports up to 50 dancers.");
      return;
    }

    state.dancerCounter += 1;
    const position = createDefaultPosition(state.dancers.length);
    const dancer = {
      id: `dancer-${Date.now()}-${state.dancerCounter}`,
      number: state.dancerCounter,
      name: `Dancer ${state.dancerCounter}`,
      color: PALETTE[(state.dancerCounter - 1) % PALETTE.length],
      keyframes: [{ time: state.currentTime, x: position.x, y: position.y }],
    };

    state.dancers.push(dancer);
    state.selectedDancerId = dancer.id;
    syncAfterDataChange();
    state.markerElements.get(dancer.id)?.focus();
    showToast(`${dancer.name} added at ${formatTime(state.currentTime)}.`);
  }

  function removeDancer(dancerId) {
    const dancer = state.dancers.find((item) => item.id === dancerId);
    if (!dancer) return;
    if (!window.confirm(`Remove ${dancer.name} and all of its recorded positions?`)) return;

    const removedIndex = state.dancers.findIndex((item) => item.id === dancerId);
    state.dancers = state.dancers.filter((item) => item.id !== dancerId);
    state.markerElements.get(dancerId)?.remove();
    state.markerElements.delete(dancerId);
    if (state.selectedDancerId === dancerId) {
      state.selectedDancerId = state.dancers[Math.min(removedIndex, state.dancers.length - 1)]?.id || null;
    }
    syncAfterDataChange();
    if (state.selectedDancerId) state.markerElements.get(state.selectedDancerId)?.focus();
    else elements.addDancerButton.focus();
    showToast(`${dancer.name} removed.`);
  }

  function selectDancer(dancerId) {
    if (!state.dancers.some((dancer) => dancer.id === dancerId)) return;
    state.selectedDancerId = dancerId;
    renderSelection();
    renderDancerList();
    renderMarkerPositions();
  }

  function ensureMarkerElement(dancer) {
    if (state.markerElements.has(dancer.id)) return state.markerElements.get(dancer.id);

    const marker = document.createElement("button");
    marker.type = "button";
    marker.className = "dancer-marker";
    marker.dataset.dancerId = dancer.id;
    marker.style.setProperty("--marker-color", dancer.color);
    marker.textContent = dancer.number;
    marker.setAttribute("aria-label", `${dancer.name}. Drag to set position at the current time.`);

    marker.addEventListener("pointerdown", startMarkerDrag);
    marker.addEventListener("click", () => selectDancer(dancer.id));
    marker.addEventListener("keydown", handleMarkerKeydown);

    elements.markerLayer.append(marker);
    state.markerElements.set(dancer.id, marker);
    return marker;
  }

  function renderMarkerPositions() {
    const activeIds = new Set(state.dancers.map((dancer) => dancer.id));
    for (const [id, marker] of state.markerElements.entries()) {
      if (!activeIds.has(id)) {
        marker.remove();
        state.markerElements.delete(id);
      }
    }

    state.dancers.forEach((dancer) => {
      const marker = ensureMarkerElement(dancer);
      const position = getPositionAtTime(dancer.keyframes, state.currentTime);
      if (!position) return;
      marker.style.left = `${position.x}%`;
      marker.style.top = `${position.y}%`;
      marker.classList.toggle("is-selected", dancer.id === state.selectedDancerId);
      marker.setAttribute("aria-label", `${dancer.name} at ${Math.round(position.x)} percent across and ${Math.round(position.y)} percent down.`);
    });

    elements.emptyStage.classList.toggle("is-hidden", state.dancers.length > 0);
  }

  function positionFromPointer(event) {
    const rect = elements.stage.getBoundingClientRect();
    return {
      x: clamp(((event.clientX - rect.left) / rect.width) * 100, 2.5, 97.5),
      y: clamp(((event.clientY - rect.top) / rect.height) * 100, 4, 94),
    };
  }

  function startMarkerDrag(event) {
    if (event.button !== 0) return;
    event.preventDefault();
    const marker = event.currentTarget;
    const dancerId = marker.dataset.dancerId;
    pausePlayback();
    selectDancer(dancerId);
    marker.classList.add("is-dragging");
    marker.setPointerCapture(event.pointerId);

    const pointerStart = { x: event.clientX, y: event.clientY };
    let didMove = false;
    let latestPosition = getPositionAtTime(getSelectedDancer().keyframes, state.currentTime);

    function move(moveEvent) {
      if (!didMove) {
        didMove = hasPointerMoved(pointerStart, { x: moveEvent.clientX, y: moveEvent.clientY });
        if (!didMove) return;
      }
      latestPosition = positionFromPointer(moveEvent);
      marker.style.left = `${latestPosition.x}%`;
      marker.style.top = `${latestPosition.y}%`;
    }

    function finish(finishEvent) {
      marker.classList.remove("is-dragging");
      marker.removeEventListener("pointermove", move);
      marker.removeEventListener("pointerup", finish);
      marker.removeEventListener("pointercancel", cancel);
      if (marker.hasPointerCapture(finishEvent.pointerId)) marker.releasePointerCapture(finishEvent.pointerId);
      if (didMove) recordPosition(dancerId, latestPosition);
      else renderMarkerPositions();
    }

    function cancel(cancelEvent) {
      marker.classList.remove("is-dragging");
      marker.removeEventListener("pointermove", move);
      marker.removeEventListener("pointerup", finish);
      marker.removeEventListener("pointercancel", cancel);
      if (marker.hasPointerCapture(cancelEvent.pointerId)) marker.releasePointerCapture(cancelEvent.pointerId);
      renderMarkerPositions();
    }

    marker.addEventListener("pointermove", move);
    marker.addEventListener("pointerup", finish);
    marker.addEventListener("pointercancel", cancel);
  }

  function handleMarkerKeydown(event) {
    const dancerId = event.currentTarget.dataset.dancerId;
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      removeDancer(dancerId);
      return;
    }

    const direction = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    }[event.key];
    if (!direction) return;

    event.preventDefault();
    pausePlayback();
    selectDancer(dancerId);
    const dancer = getSelectedDancer();
    const currentPosition = getPositionAtTime(dancer.keyframes, state.currentTime);
    const step = event.shiftKey ? 5 : 1;
    recordPosition(dancerId, {
      x: clamp(currentPosition.x + direction[0] * step, 2.5, 97.5),
      y: clamp(currentPosition.y + direction[1] * step, 4, 94),
    });
  }

  function recordPosition(dancerId, position) {
    const dancer = state.dancers.find((item) => item.id === dancerId);
    if (!dancer) return;
    dancer.keyframes = upsertKeyframe(dancer.keyframes, {
      time: state.currentTime,
      x: position.x,
      y: position.y,
    });
    syncAfterDataChange();
    showToast(`Position recorded at ${formatTime(state.currentTime)}.`);
  }

  function removeKeyframe(dancerId, frameTime) {
    const dancer = state.dancers.find((item) => item.id === dancerId);
    if (!dancer || dancer.keyframes.length <= 1) return;
    dancer.keyframes = dancer.keyframes.filter((frame) => Math.abs(frame.time - frameTime) > 0.015);
    syncAfterDataChange();
  }

  function renderDancerList() {
    elements.dancerList.replaceChildren();
    elements.dancerCount.textContent = `${state.dancers.length} / ${MAX_DANCERS}`;
    elements.addDancerButton.disabled = state.dancers.length >= MAX_DANCERS;

    if (state.dancers.length === 0) {
      const empty = document.createElement("p");
      empty.className = "dancer-empty";
      empty.textContent = "No dancers yet.";
      elements.dancerList.append(empty);
      return;
    }

    state.dancers.forEach((dancer) => {
      const row = document.createElement("div");
      row.className = "dancer-row";
      row.classList.toggle("is-selected", dancer.id === state.selectedDancerId);

      const selectButton = document.createElement("button");
      selectButton.type = "button";
      selectButton.className = "dancer-row-main";
      selectButton.addEventListener("click", () => selectDancer(dancer.id));

      const swatch = document.createElement("span");
      swatch.className = "dancer-swatch";
      swatch.style.setProperty("--dancer-color", dancer.color);
      swatch.textContent = dancer.number;

      const copy = document.createElement("span");
      copy.className = "dancer-row-copy";
      const name = document.createElement("strong");
      name.textContent = dancer.name;
      const frames = document.createElement("small");
      frames.textContent = `${dancer.keyframes.length} position${dancer.keyframes.length === 1 ? "" : "s"}`;
      copy.append(name, frames);
      selectButton.append(swatch, copy);

      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.className = "remove-dancer";
      removeButton.textContent = "×";
      removeButton.setAttribute("aria-label", `Remove ${dancer.name}`);
      removeButton.addEventListener("click", () => removeDancer(dancer.id));

      row.append(selectButton, removeButton);
      elements.dancerList.append(row);
    });
  }

  function renderSelection() {
    const dancer = getSelectedDancer();
    elements.keyframeList.replaceChildren();
    elements.keyframeTrack.replaceChildren();

    if (!dancer) {
      elements.selectionText.textContent = "No dancer selected";
      elements.coordinateEditor.classList.add("is-hidden");
      return;
    }

    const currentPosition = getPositionAtTime(dancer.keyframes, state.currentTime);
    elements.selectionText.textContent = `${dancer.name} · ${dancer.keyframes.length} recorded position${dancer.keyframes.length === 1 ? "" : "s"}`;
    elements.coordinateEditor.classList.remove("is-hidden");
    elements.xInput.value = currentPosition.x.toFixed(1);
    elements.yInput.value = currentPosition.y.toFixed(1);
    normalizeKeyframes(dancer.keyframes).forEach((frame) => {
      const dot = document.createElement("span");
      dot.className = "keyframe-dot";
      dot.style.left = `${(frame.time / state.duration) * 100}%`;
      elements.keyframeTrack.append(dot);

      const chip = document.createElement("span");
      chip.className = "keyframe-chip";
      chip.title = `x ${frame.x.toFixed(1)}, y ${frame.y.toFixed(1)}`;
      chip.append(document.createTextNode(formatTime(frame.time)));

      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "×";
      remove.disabled = dancer.keyframes.length <= 1;
      remove.setAttribute("aria-label", `Delete position at ${formatTime(frame.time)}`);
      remove.addEventListener("click", () => removeKeyframe(dancer.id, frame.time));
      chip.append(remove);
      elements.keyframeList.append(chip);
    });
  }

  function setCurrentTime(nextTime, options = {}) {
    state.currentTime = clamp(nextTime, 0, state.duration);
    elements.timeline.value = state.currentTime;
    elements.currentTime.textContent = formatTime(state.currentTime);
    renderMarkerPositions();
    const selected = getSelectedDancer();
    if (selected && document.activeElement !== elements.xInput && document.activeElement !== elements.yInput) {
      const position = getPositionAtTime(selected.keyframes, state.currentTime);
      elements.xInput.value = position.x.toFixed(1);
      elements.yInput.value = position.y.toFixed(1);
    }

    if (options.syncMedia !== false) {
      getLoadedMediaPlayers().forEach((player) => {
        if (Number.isFinite(player.duration)) {
          player.currentTime = clamp(state.currentTime, 0, player.duration);
        }
      });
    }
  }

  async function startPlayback() {
    if (state.isPlaying) return;
    if (state.currentTime >= state.duration - 0.01) setCurrentTime(0);

    const mediaPlayers = getLoadedMediaPlayers();
    try {
      await Promise.all(mediaPlayers.map((player) => {
        player.currentTime = clamp(state.currentTime, 0, player.duration || state.duration);
        if (Number.isFinite(player.duration) && state.currentTime >= player.duration - 0.01) return Promise.resolve();
        return player.play();
      }));
    } catch (error) {
      mediaPlayers.forEach((player) => player.pause());
      showToast("The browser could not play one of the loaded media files.");
      return;
    }

    state.isPlaying = true;
    state.playbackStartedAt = performance.now();
    state.playbackOrigin = state.currentTime;
    updatePlayButton();
    state.rafId = requestAnimationFrame(playbackTick);
  }

  function playbackTick(now) {
    if (!state.isPlaying) return;

    const masterPlayer = getMasterMediaPlayer();
    const clockTime = state.playbackOrigin + (now - state.playbackStartedAt) / 1000;
    const nextTime = masterPlayer && !masterPlayer.paused && !masterPlayer.ended
      ? masterPlayer.currentTime
      : clockTime;

    getLoadedMediaPlayers().forEach((player) => {
      if (player === masterPlayer || player.paused || player.ended || !Number.isFinite(player.duration)) return;
      const expectedTime = clamp(nextTime, 0, player.duration);
      if (Math.abs(player.currentTime - expectedTime) > 0.1) player.currentTime = expectedTime;
    });

    setCurrentTime(nextTime, { syncMedia: false });
    if (nextTime >= state.duration - 0.005) {
      setCurrentTime(state.duration, { syncMedia: false });
      pausePlayback();
      return;
    }
    state.rafId = requestAnimationFrame(playbackTick);
  }

  function pausePlayback() {
    const wasPlaying = state.isPlaying;
    const masterPlayer = getMasterMediaPlayer();
    const mediaTime = wasPlaying && masterPlayer && Number.isFinite(masterPlayer.currentTime)
      ? masterPlayer.currentTime
      : null;
    if (state.rafId !== null) cancelAnimationFrame(state.rafId);
    state.rafId = null;
    state.isPlaying = false;
    getLoadedMediaPlayers().forEach((player) => {
      if (!player.paused) player.pause();
    });
    if (mediaTime !== null) setCurrentTime(mediaTime, { syncMedia: false });
    updatePlayButton();
  }

  function togglePlayback() {
    if (state.isPlaying) pausePlayback();
    else startPlayback();
  }

  function updatePlayButton() {
    elements.playIcon.textContent = state.isPlaying ? "❚❚" : "▶";
    elements.playButton.setAttribute("aria-label", state.isPlaying ? "Pause choreography" : "Play choreography");
  }

  function updateDuration(nextDuration, options = {}) {
    const latestFrame = getLatestKeyframeTime(state.dancers);
    const requested = clamp(nextDuration, 1, 3600);
    if (requested < latestFrame) {
      elements.durationInput.value = Math.ceil(state.duration);
      showToast(`Timeline must include the last position at ${formatTime(latestFrame)}.`);
      return false;
    }

    state.duration = requested;
    state.currentTime = clamp(state.currentTime, 0, state.duration);
    elements.timeline.max = state.duration;
    elements.durationInput.value = Math.round(state.duration * 100) / 100;
    elements.totalTime.textContent = formatTime(state.duration);
    setCurrentTime(state.currentTime, { syncMedia: false });
    renderSelection();
    if (options.save !== false) queueSave();
    return true;
  }

  function handleAudioFile(file) {
    if (!file) return;
    const validExtension = /\.(mp3|wav)$/i.test(file.name);
    const validType = ["audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/wave"].includes(file.type);
    if (!validExtension && !validType) {
      showToast("Please choose an MP3 or WAV file.");
      elements.audioInput.value = "";
      return;
    }

    pausePlayback();
    if (state.audioUrl) URL.revokeObjectURL(state.audioUrl);
    state.audioUrl = URL.createObjectURL(file);
    elements.audioPlayer.src = state.audioUrl;
    elements.audioName.textContent = file.name;
    elements.audioDuration.textContent = "Reading audio…";
    elements.audioDetails.classList.remove("is-hidden");
    elements.durationInput.disabled = true;
    elements.audioPlayer.load();
  }

  function removeAudio(announce = true) {
    pausePlayback();
    const audioUrl = state.audioUrl;
    state.audioUrl = null;
    elements.audioPlayer.removeAttribute("src");
    elements.audioPlayer.load();
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    elements.audioInput.value = "";
    elements.audioDetails.classList.add("is-hidden");
    elements.audioName.textContent = "";
    elements.audioDuration.textContent = "";
    updateDurationFromMedia(true);
    if (announce) showToast("Audio removed. Choreography positions were kept.");
  }

  function handleVideoFile(file) {
    if (!file) return;
    const validExtension = /\.(mp4|webm|mov)$/i.test(file.name);
    const validType = ["video/mp4", "video/webm", "video/quicktime"].includes(file.type);
    if (!validExtension && !validType) {
      showToast("Please choose an MP4, WebM, or MOV file.");
      elements.videoInput.value = "";
      return;
    }

    pausePlayback();
    if (state.videoUrl) URL.revokeObjectURL(state.videoUrl);
    state.videoUrl = URL.createObjectURL(file);
    elements.videoPlayer.src = state.videoUrl;
    elements.videoName.textContent = file.name;
    elements.videoDuration.textContent = "Reading video…";
    elements.videoDetails.classList.remove("is-hidden");
    elements.videoPlayerWrap.classList.remove("is-hidden");
    elements.durationInput.disabled = true;
    elements.videoPlayer.load();
  }

  function removeVideo(announce = true) {
    pausePlayback();
    const videoUrl = state.videoUrl;
    state.videoUrl = null;
    elements.videoPlayer.removeAttribute("src");
    elements.videoPlayer.load();
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    elements.videoInput.value = "";
    elements.videoDetails.classList.add("is-hidden");
    elements.videoPlayerWrap.classList.add("is-hidden");
    elements.videoName.textContent = "";
    elements.videoDuration.textContent = "";
    updateDurationFromMedia(true);
    if (announce) showToast("Video removed. Choreography positions were kept.");
  }

  function serializeProject() {
    return {
      version: 1,
      projectTitle: state.projectTitle,
      duration: state.duration,
      dancerCounter: state.dancerCounter,
      dancers: state.dancers.map((dancer) => ({
        id: dancer.id,
        number: dancer.number,
        name: dancer.name,
        color: dancer.color,
        keyframes: normalizeKeyframes(dancer.keyframes),
      })),
    };
  }

  function applyProject(project, announce = true) {
    if (!isValidProjectData(project, MAX_DANCERS)) throw new Error("Invalid choreography file");
    pausePlayback();
    if (state.audioUrl) removeAudio(false);
    if (state.videoUrl) removeVideo(false);
    state.projectTitle = String(project.projectTitle || "Untitled choreography").slice(0, 120);
    state.duration = clamp(project.duration, 1, 3600);
    const highestDancerNumber = project.dancers.reduce((highest, dancer) => Math.max(highest, Number(dancer.number) || 0), 0);
    state.dancerCounter = Math.max(Number(project.dancerCounter) || 0, project.dancers.length, highestDancerNumber);
    state.dancers = project.dancers.map((dancer, index) => ({
      id: String(dancer.id || `imported-${Date.now()}-${index}`),
      number: Number(dancer.number) || index + 1,
      name: String(dancer.name || `Dancer ${index + 1}`).slice(0, 80),
      color: /^#[0-9a-f]{6}$/i.test(dancer.color) ? dancer.color : PALETTE[index % PALETTE.length],
      keyframes: normalizeKeyframes(dancer.keyframes),
    }));
    const latest = getLatestKeyframeTime(state.dancers);
    state.duration = Math.max(state.duration, latest || 1);
    state.selectedDancerId = state.dancers[0]?.id || null;
    state.currentTime = 0;
    state.markerElements.forEach((marker) => marker.remove());
    state.markerElements.clear();
    elements.projectTitle.value = state.projectTitle;
    elements.timeline.max = state.duration;
    elements.durationInput.value = Math.round(state.duration * 100) / 100;
    elements.totalTime.textContent = formatTime(state.duration);
    renderAll();
    queueSave();
    if (announce) showToast("Choreography plan imported.");
  }

  function exportProject() {
    const payload = JSON.stringify(serializeProject(), null, 2);
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const safeName = state.projectTitle.trim().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "choreography";
    link.href = url;
    link.download = `${safeName}.formation.json`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showToast("Plan exported. Audio and video files are not included.");
  }

  async function importProject(file) {
    if (!file) return;
    try {
      const project = JSON.parse(await file.text());
      applyProject(project);
    } catch (error) {
      showToast("That file is not a valid Formation Studio plan.");
    } finally {
      elements.importInput.value = "";
    }
  }

  function queueSave() {
    elements.saveStatus.textContent = "Saving…";
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(serializeProject()));
        elements.saveStatus.textContent = "Saved locally";
      } catch (error) {
        elements.saveStatus.textContent = "Local save unavailable";
      }
    }, 180);
  }

  function restoreLocalProject() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      const project = JSON.parse(raw);
      if (!isValidProjectData(project, MAX_DANCERS)) return false;
      applyProject(project, false);
      return true;
    } catch (error) {
      return false;
    }
  }

  function showToast(message) {
    elements.toast.textContent = message;
    elements.toast.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => elements.toast.classList.remove("is-visible"), 2600);
  }

  function syncAfterDataChange() {
    renderAll();
    queueSave();
  }

  function renderAll() {
    renderDancerList();
    renderSelection();
    setCurrentTime(state.currentTime, { syncMedia: false });
    elements.totalTime.textContent = formatTime(state.duration);
  }

  function bindEvents() {
    elements.addDancerButton.addEventListener("click", addDancer);
    elements.playButton.addEventListener("click", togglePlayback);
    elements.restartButton.addEventListener("click", () => {
      pausePlayback();
      setCurrentTime(0);
    });
    elements.timeline.addEventListener("input", (event) => {
      const wasPlaying = state.isPlaying;
      setCurrentTime(Number(event.target.value));
      if (wasPlaying) {
        state.playbackOrigin = state.currentTime;
        state.playbackStartedAt = performance.now();
      }
    });
    elements.durationInput.addEventListener("change", (event) => updateDuration(Number(event.target.value)));
    elements.audioInput.addEventListener("change", (event) => handleAudioFile(event.target.files[0]));
    elements.audioFileButton.addEventListener("click", () => elements.audioInput.click());
    elements.removeAudioButton.addEventListener("click", () => removeAudio());
    elements.volumeInput.addEventListener("input", (event) => {
      elements.audioPlayer.volume = Number(event.target.value);
    });
    elements.audioPlayer.addEventListener("loadedmetadata", () => {
      const audioLength = elements.audioPlayer.duration;
      if (Number.isFinite(audioLength) && audioLength > 0) {
        if (!updateDurationFromMedia()) {
          const latestFrame = getLatestKeyframeTime(state.dancers);
          removeAudio(false);
          showToast(`That audio ends before the last position at ${formatTime(latestFrame)}.`);
          return;
        }
        elements.audioDuration.textContent = `${formatTime(audioLength)} · synchronized to playhead`;
        showToast("Audio loaded and timeline length updated.");
      }
    });
    elements.audioPlayer.addEventListener("error", () => {
      if (!state.audioUrl) return;
      removeAudio(false);
      showToast("The audio file could not be read by this browser.");
    });
    elements.videoInput.addEventListener("change", (event) => handleVideoFile(event.target.files[0]));
    elements.videoFileButton.addEventListener("click", () => elements.videoInput.click());
    elements.removeVideoButton.addEventListener("click", () => removeVideo());
    elements.videoVolumeInput.addEventListener("input", (event) => {
      elements.videoPlayer.volume = Number(event.target.value);
    });
    elements.videoPlayer.addEventListener("click", togglePlayback);
    elements.videoPlayer.addEventListener("loadedmetadata", () => {
      const videoLength = elements.videoPlayer.duration;
      if (Number.isFinite(videoLength) && videoLength > 0) {
        if (!updateDurationFromMedia()) {
          const latestFrame = getLatestKeyframeTime(state.dancers);
          removeVideo(false);
          showToast(`That video ends before the last position at ${formatTime(latestFrame)}.`);
          return;
        }
        elements.videoDuration.textContent = `${formatTime(videoLength)} · synchronized to playhead`;
        showToast("Video loaded and timeline length updated.");
      }
    });
    elements.videoPlayer.addEventListener("error", () => {
      if (!state.videoUrl) return;
      removeVideo(false);
      showToast("The video file could not be read by this browser.");
    });
    elements.exportButton.addEventListener("click", exportProject);
    elements.importButton.addEventListener("click", () => elements.importInput.click());
    elements.importInput.addEventListener("change", (event) => importProject(event.target.files[0]));
    elements.projectTitle.addEventListener("input", (event) => {
      state.projectTitle = event.target.value.slice(0, 120);
      queueSave();
    });
    elements.recordCoordinatesButton.addEventListener("click", () => {
      const dancer = getSelectedDancer();
      if (!dancer) return;
      const x = Number(elements.xInput.value);
      const y = Number(elements.yInput.value);
      if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 100 || y < 0 || y > 100) {
        showToast("X and Y must each be between 0 and 100.");
        return;
      }
      recordPosition(dancer.id, { x, y });
      state.markerElements.get(dancer.id)?.focus();
    });
    window.addEventListener("beforeunload", () => {
      pausePlayback();
      if (state.audioUrl) URL.revokeObjectURL(state.audioUrl);
      if (state.videoUrl) URL.revokeObjectURL(state.videoUrl);
    });
  }

  function initialize() {
    elements.audioPlayer.volume = Number(elements.volumeInput.value);
    elements.videoPlayer.volume = Number(elements.videoVolumeInput.value);
    bindEvents();
    if (!restoreLocalProject()) {
      updateDuration(state.duration, { save: false });
      renderAll();
      queueSave();
    }
  }

  initialize();
})();
