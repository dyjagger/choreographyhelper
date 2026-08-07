(function startFormationStudio() {
  "use strict";

  const {
    MAX_DANCER_COUNTER,
    TIME_EPSILON,
    areDocumentSnapshotsEqual,
    clamp,
    createUniqueLocalDancerId,
    createHistory,
    formatTime,
    getLatestKeyframeTime,
    getNextAvailableDancerNumber,
    getPositionAtTime,
    hasPointerMoved,
    isValidProjectData,
    normalizeDancerName,
    normalizeKeyframes,
    normalizeProjectTitle,
    pushHistory,
    redoHistory,
    shouldPauseAfterPlaybackStartSettles,
    undoHistory,
    upsertKeyframe,
    displayToStagePosition,
    normalizeStageOrientation,
    stageToDisplayPosition,
  } = window.ChoreoCore;

  const MAX_DANCERS = 50;
  const HISTORY_LIMIT = 50;
  const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
  const MIN_STAGE_ZOOM = 0.5;
  const MAX_STAGE_ZOOM = 3;
  const STAGE_ZOOM_STEP = 0.25;
  const STORAGE_KEY = "formation-studio-project-v1";
  const THEME_STORAGE_KEY = "formation-studio-theme";
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
    addDancerForm: document.querySelector("#add-dancer-form"),
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
    dancerNameEditor: document.querySelector("#dancer-name-editor"),
    dancerNameInput: document.querySelector("#dancer-name-input"),
    durationInput: document.querySelector("#duration-input"),
    emptyStage: document.querySelector("#empty-stage"),
    exportButton: document.querySelector("#export-button"),
    frontBottomButton: document.querySelector("#front-bottom-button"),
    frontTopButton: document.querySelector("#front-top-button"),
    importInput: document.querySelector("#import-input"),
    importButton: document.querySelector("#import-button"),
    keyframeList: document.querySelector("#keyframe-list"),
    keyframeTrack: document.querySelector("#keyframe-track"),
    markerLayer: document.querySelector("#marker-layer"),
    newDancerNameInput: document.querySelector("#new-dancer-name"),
    newProjectButton: document.querySelector("#new-project-button"),
    playButton: document.querySelector("#play-button"),
    playIcon: document.querySelector("#play-icon"),
    projectTitle: document.querySelector("#project-title"),
    redoButton: document.querySelector("#redo-button"),
    replaceLocalSaveButton: document.querySelector("#replace-local-save-button"),
    removeAudioButton: document.querySelector("#remove-audio-button"),
    recordCoordinatesButton: document.querySelector("#record-coordinates-button"),
    restartButton: document.querySelector("#restart-button"),
    saveStatus: document.querySelector("#save-status"),
    selectionText: document.querySelector("#selection-text"),
    stage: document.querySelector("#stage"),
    stageViewport: document.querySelector("#stage-viewport"),
    audiencePositionLabel: document.querySelector("#audience-position-label"),
    timeline: document.querySelector("#timeline"),
    themeToggle: document.querySelector("#theme-toggle"),
    themeToggleIcon: document.querySelector("#theme-toggle-icon"),
    themeToggleText: document.querySelector("#theme-toggle-text"),
    timeInput: document.querySelector("#time-input"),
    toast: document.querySelector("#toast"),
    totalTime: document.querySelector("#total-time"),
    undoButton: document.querySelector("#undo-button"),
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
    zoomInButton: document.querySelector("#zoom-in-button"),
    zoomLevel: document.querySelector("#zoom-level"),
    zoomOutButton: document.querySelector("#zoom-out-button"),
    zoomResetButton: document.querySelector("#zoom-reset-button"),
  };

  const state = {
    activeKeyframeTime: null,
    currentTime: 0,
    dancerCounter: 0,
    dancers: [],
    duration: 60,
    history: createHistory(HISTORY_LIMIT),
    isPlaying: false,
    isStartingPlayback: false,
    markerElements: new Map(),
    playbackOrigin: 0,
    playbackRequestId: 0,
    playbackStartedAt: 0,
    projectTitle: "Untitled choreography",
    rafId: null,
    selectedDancerId: null,
    stageOrientation: "front-bottom",
    stageZoom: 1,
    storageWriteBlocked: false,
    audioUrl: null,
    videoUrl: null,
  };

  let saveTimer = null;
  let toastTimer = null;
  let projectTitleEditSnapshot = null;
  const stageTouchPointers = new Map();
  let stagePinchGesture = null;
  let stageResizeObserver = null;

  function applyTheme(theme, persist = false) {
    const nextTheme = theme === "dark" ? "dark" : "light";
    const isDark = nextTheme === "dark";
    document.documentElement.dataset.theme = nextTheme;
    elements.themeToggle.setAttribute("aria-pressed", String(isDark));
    elements.themeToggle.setAttribute("aria-label", `Switch to ${isDark ? "light" : "dark"} mode`);
    elements.themeToggle.title = `Switch to ${isDark ? "light" : "dark"} mode`;
    elements.themeToggleIcon.textContent = isDark ? "☀" : "☾";
    elements.themeToggleText.textContent = isDark ? "Light mode" : "Dark mode";
    if (!persist) return;
    try {
      localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    } catch (error) {
      showToast("Theme changed for this visit. Browser storage is unavailable.");
    }
  }

  function toggleTheme() {
    const nextTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    applyTheme(nextTheme, true);
  }

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

  function captureDocumentSnapshot() {
    return {
      project: serializeProject(),
      currentTime: state.currentTime,
      selectedDancerId: state.selectedDancerId,
    };
  }

  function updateHistoryControls() {
    const undoEntry = state.history.past.at(-1) || null;
    const redoEntry = state.history.future[0] || null;
    elements.undoButton.disabled = !undoEntry;
    elements.redoButton.disabled = !redoEntry;
    elements.undoButton.setAttribute("aria-label", undoEntry ? `Undo ${undoEntry.label}` : "Undo");
    elements.redoButton.setAttribute("aria-label", redoEntry ? `Redo ${redoEntry.label}` : "Redo");
    elements.undoButton.title = undoEntry ? `Undo ${undoEntry.label}` : "Nothing to undo";
    elements.redoButton.title = redoEntry ? `Redo ${redoEntry.label}` : "Nothing to redo";
  }

  function replaceDocumentData(project, options = {}) {
    state.projectTitle = normalizeProjectTitle(project.projectTitle);
    state.stageOrientation = normalizeStageOrientation(project.stageOrientation);
    state.duration = clamp(project.duration, 1, 3600);
    const highestDancerNumber = project.dancers.reduce((highest, dancer, index) => {
      const candidate = Number(dancer.number);
      const safeNumber = Number.isSafeInteger(candidate) && candidate > 0 && candidate <= 1000000
        ? candidate
        : index + 1;
      return Math.max(highest, safeNumber);
    }, 0);
    state.dancerCounter = Math.max(Number(project.dancerCounter) || 0, project.dancers.length, highestDancerNumber);
    state.dancers = project.dancers.map((dancer, index) => {
      const candidateNumber = Number(dancer.number);
      const number = Number.isSafeInteger(candidateNumber) && candidateNumber > 0 && candidateNumber <= 1000000
        ? candidateNumber
        : index + 1;
      return {
        id: dancer.id,
        number,
        name: normalizeDancerName(dancer.name, `Dancer ${number}`),
        color: /^#[0-9a-f]{6}$/i.test(dancer.color) ? dancer.color : PALETTE[index % PALETTE.length],
        keyframes: normalizeKeyframes(dancer.keyframes),
      };
    });
    const latest = getLatestKeyframeTime(state.dancers);
    state.duration = Math.max(state.duration, latest || 1);
    const loadedMediaDurations = getLoadedMediaPlayers()
      .map((player) => player.duration)
      .filter((duration) => Number.isFinite(duration) && duration > 0);
    if (loadedMediaDurations.length > 0) state.duration = Math.max(state.duration, ...loadedMediaDurations);
    const requestedSelection = options.selectedDancerId;
    state.selectedDancerId = state.dancers.some((dancer) => dancer.id === requestedSelection)
      ? requestedSelection
      : state.dancers[0]?.id || null;
    state.currentTime = clamp(options.currentTime ?? 0, 0, state.duration);
    state.markerElements.forEach((marker) => marker.remove());
    state.markerElements.clear();
  }

  function commitDocumentEdit(label, mutation, options = {}) {
    const before = options.beforeSnapshot || captureDocumentSnapshot();
    const mutationResult = mutation();
    const after = captureDocumentSnapshot();
    if (mutationResult === false || areDocumentSnapshotsEqual(before, after)) {
      if (options.render !== false) {
        renderAll();
        setCurrentTime(state.currentTime);
      }
      updateHistoryControls();
      return false;
    }
    state.history = pushHistory(state.history, { label, snapshot: before });
    if (options.render === false) queueSave();
    else syncAfterDataChange();
    updateHistoryControls();
    return true;
  }

  function focusSelectedMarkerOrAdd() {
    const marker = state.selectedDancerId ? state.markerElements.get(state.selectedDancerId) : null;
    (marker || elements.addDancerButton).focus();
  }

  function restoreDocumentSnapshot(snapshot, options = {}) {
    pausePlayback();
    replaceDocumentData(snapshot.project, snapshot);
    renderAll();
    setCurrentTime(state.currentTime);
    queueSave();
    updateHistoryControls();
    if (options.restoreFocus) focusSelectedMarkerOrAdd();
  }

  function undoDocumentEdit(options = {}) {
    const entry = state.history.past.at(-1);
    if (!entry) return;
    const result = undoHistory(state.history, {
      label: entry.label,
      snapshot: captureDocumentSnapshot(),
    });
    state.history = result.history;
    restoreDocumentSnapshot(result.entry.snapshot, options);
    showToast(`Undid ${entry.label}.`);
  }

  function redoDocumentEdit(options = {}) {
    const entry = state.history.future[0];
    if (!entry) return;
    const result = redoHistory(state.history, {
      label: entry.label,
      snapshot: captureDocumentSnapshot(),
    });
    state.history = result.history;
    restoreDocumentSnapshot(result.entry.snapshot, options);
    showToast(`Redid ${entry.label}.`);
  }

  function createDefaultPosition(index) {
    const angle = index * 2.3999632297;
    const ring = Math.min(24, 4 + Math.sqrt(index + 1) * 5.5);
    return {
      x: clamp(50 + Math.cos(angle) * ring, 5, 95),
      y: clamp(50 + Math.sin(angle) * ring, 7, 90),
    };
  }

  function startNewProject() {
    const shouldReset = window.confirm(
      "Start a new project? This clears the title, dancers, recorded positions, and playhead. You can undo it. Loaded audio and video will stay in place.",
    );
    if (!shouldReset) return;

    pausePlayback();
    const mediaDurations = getLoadedMediaPlayers()
      .map((player) => player.duration)
      .filter((duration) => Number.isFinite(duration) && duration > 0);
    const freshDuration = clamp(mediaDurations.length > 0
      ? Math.max(...mediaDurations)
      : state.audioUrl || state.videoUrl
        ? state.duration
        : 60, 1, 3600);

    const changed = commitDocumentEdit("start new project", () => {
      state.projectTitle = "Untitled choreography";
      state.dancerCounter = 0;
      state.dancers = [];
      state.duration = freshDuration;
      state.currentTime = 0;
      state.selectedDancerId = null;
      state.stageOrientation = "front-bottom";
      state.markerElements.forEach((marker) => marker.remove());
      state.markerElements.clear();
    });
    setCurrentTime(0);
    elements.addDancerButton.focus();
    showToast(changed ? "New project started. Undo is available." : "This project is already blank.");
  }

  function addDancer() {
    if (state.dancers.length >= MAX_DANCERS) {
      showToast("The stage supports up to 50 dancers.");
      return;
    }
    const numberAllocation = getNextAvailableDancerNumber(state.dancers, state.dancerCounter, MAX_DANCER_COUNTER);
    if (!numberAllocation) {
      showToast("No safe dancer number is available in this plan.");
      return;
    }

    let dancer = null;
    commitDocumentEdit("add dancer", () => {
      state.dancerCounter = numberAllocation.dancerCounter;
      const position = createDefaultPosition(state.dancers.length);
      dancer = {
        id: createUniqueLocalDancerId(state.dancers, numberAllocation.number),
        number: numberAllocation.number,
        name: normalizeDancerName(elements.newDancerNameInput.value, `Dancer ${numberAllocation.number}`),
        color: PALETTE[(numberAllocation.number - 1) % PALETTE.length],
        keyframes: [{ time: state.currentTime, x: position.x, y: position.y }],
      };
      state.dancers.push(dancer);
      state.selectedDancerId = dancer.id;
    });
    elements.newDancerNameInput.value = "";
    state.markerElements.get(dancer.id)?.focus();
    showToast(`${dancer.name} added at ${formatTime(state.currentTime)}.`);
  }

  function removeDancer(dancerId) {
    const dancer = state.dancers.find((item) => item.id === dancerId);
    if (!dancer) return;
    if (!window.confirm(`Remove ${dancer.name} and all of its recorded positions?`)) return;

    commitDocumentEdit(`remove ${dancer.name}`, () => {
      const removedIndex = state.dancers.findIndex((item) => item.id === dancerId);
      state.dancers = state.dancers.filter((item) => item.id !== dancerId);
      state.markerElements.get(dancerId)?.remove();
      state.markerElements.delete(dancerId);
      if (state.selectedDancerId === dancerId) {
        state.selectedDancerId = state.dancers[Math.min(removedIndex, state.dancers.length - 1)]?.id || null;
      }
    });
    if (state.selectedDancerId) state.markerElements.get(state.selectedDancerId)?.focus();
    else elements.addDancerButton.focus();
    showToast(`${dancer.name} removed.`);
  }

  function findDancerListButton(dancerId) {
    return [...elements.dancerList.querySelectorAll(".dancer-row-main")]
      .find((button) => button.dataset.dancerId === dancerId) || null;
  }

  function selectDancer(dancerId, options = {}) {
    if (!state.dancers.some((dancer) => dancer.id === dancerId)) return;
    state.selectedDancerId = dancerId;
    renderSelection();
    renderDancerList();
    renderMarkerPositions();
    if (options.restoreListFocus) findDancerListButton(dancerId)?.focus();
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
      const displayedPosition = stageToDisplayPosition(position, state.stageOrientation);
      marker.style.left = `${displayedPosition.x}%`;
      marker.style.top = `${displayedPosition.y}%`;
      marker.classList.toggle("is-selected", dancer.id === state.selectedDancerId);
      marker.setAttribute("aria-pressed", String(dancer.id === state.selectedDancerId));
      marker.setAttribute("aria-label", `${dancer.name} at ${Math.round(displayedPosition.x)} percent across and ${Math.round(displayedPosition.y)} percent down.`);
    });

    elements.emptyStage.classList.toggle("is-hidden", state.dancers.length > 0);
  }

  function positionFromPointer(event) {
    const rect = elements.stage.getBoundingClientRect();
    return displayToStagePosition({
      x: clamp(((event.clientX - rect.left) / rect.width) * 100, 2.5, 97.5),
      y: clamp(((event.clientY - rect.top) / rect.height) * 100, 4, 96),
    }, state.stageOrientation);
  }

  function setStageOrientation(orientation) {
    const nextOrientation = normalizeStageOrientation(orientation);
    if (nextOrientation === state.stageOrientation) return;
    commitDocumentEdit("change stage orientation", () => {
      state.stageOrientation = nextOrientation;
    });
    showToast(nextOrientation === "front-top" ? "Front of stage moved to the top." : "Front of stage moved to the bottom.");
  }

  function getStageViewportCentre() {
    const rect = elements.stageViewport.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }

  function getNormalizedStagePoint(clientPoint) {
    const rect = elements.stage.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return { x: 0.5, y: 0.5 };
    return {
      x: clamp((clientPoint.x - rect.left) / rect.width, 0, 1),
      y: clamp((clientPoint.y - rect.top) / rect.height, 0, 1),
    };
  }

  function layoutStageSurface() {
    const viewportRect = elements.stageViewport.getBoundingClientRect();
    if (viewportRect.width <= 0 || viewportRect.height <= 0) return;
    const width = viewportRect.width * state.stageZoom;
    const height = viewportRect.height * state.stageZoom;
    elements.stage.style.width = `${width}px`;
    elements.stage.style.height = `${height}px`;
    elements.stage.style.left = `${Math.max(0, (viewportRect.width - width) / 2)}px`;
    elements.stage.style.top = `${Math.max(0, (viewportRect.height - height) / 2)}px`;
    elements.stage.style.setProperty("--stage-zoom", state.stageZoom);
    elements.zoomLevel.textContent = `${Math.round(state.stageZoom * 100)}%`;
    elements.zoomOutButton.disabled = state.stageZoom <= MIN_STAGE_ZOOM;
    elements.zoomInButton.disabled = state.stageZoom >= MAX_STAGE_ZOOM;
  }

  function positionNormalizedStagePoint(normalizedPoint, clientPoint) {
    const stageRect = elements.stage.getBoundingClientRect();
    const desiredClientX = stageRect.left + normalizedPoint.x * stageRect.width;
    const desiredClientY = stageRect.top + normalizedPoint.y * stageRect.height;
    elements.stageViewport.scrollLeft += desiredClientX - clientPoint.x;
    elements.stageViewport.scrollTop += desiredClientY - clientPoint.y;
  }

  function setStageZoom(nextZoom, options = {}) {
    const zoom = Math.round(clamp(nextZoom, MIN_STAGE_ZOOM, MAX_STAGE_ZOOM) * 100) / 100;
    const anchor = options.anchor || getStageViewportCentre();
    const normalizedPoint = options.normalizedPoint || getNormalizedStagePoint(anchor);
    state.stageZoom = zoom;
    layoutStageSurface();
    positionNormalizedStagePoint(normalizedPoint, anchor);
  }

  function relayoutStageSurface() {
    const anchor = getStageViewportCentre();
    const normalizedPoint = getNormalizedStagePoint(anchor);
    layoutStageSurface();
    positionNormalizedStagePoint(normalizedPoint, anchor);
  }

  function handleStageWheel(event) {
    event.preventDefault();
    const factor = Math.exp(-event.deltaY * 0.0015);
    setStageZoom(state.stageZoom * factor, { anchor: { x: event.clientX, y: event.clientY } });
  }

  function getTouchPair() {
    return [...stageTouchPointers.values()].slice(0, 2);
  }

  function getTouchPairGeometry() {
    const [first, second] = getTouchPair();
    if (!first || !second) return null;
    return {
      distance: Math.hypot(second.x - first.x, second.y - first.y),
      midpoint: { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 },
    };
  }

  function handleStageTouchPointerDown(event) {
    if (event.pointerType !== "touch" || event.target.closest(".dancer-marker")) return;
    stageTouchPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    elements.stageViewport.setPointerCapture(event.pointerId);
    if (stageTouchPointers.size !== 2) return;
    const geometry = getTouchPairGeometry();
    if (!geometry || geometry.distance <= 0) return;
    pausePlayback();
    stagePinchGesture = {
      distance: geometry.distance,
      zoom: state.stageZoom,
      normalizedPoint: getNormalizedStagePoint(geometry.midpoint),
    };
  }

  function handleStageTouchPointerMove(event) {
    if (!stageTouchPointers.has(event.pointerId)) return;
    stageTouchPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (!stagePinchGesture || stageTouchPointers.size < 2) return;
    event.preventDefault();
    const geometry = getTouchPairGeometry();
    if (!geometry || geometry.distance <= 0) return;
    setStageZoom(stagePinchGesture.zoom * (geometry.distance / stagePinchGesture.distance), {
      anchor: geometry.midpoint,
      normalizedPoint: stagePinchGesture.normalizedPoint,
    });
  }

  function finishStageTouchPointer(event) {
    if (!stageTouchPointers.has(event.pointerId)) return;
    stageTouchPointers.delete(event.pointerId);
    if (elements.stageViewport.hasPointerCapture(event.pointerId)) {
      elements.stageViewport.releasePointerCapture(event.pointerId);
    }
    if (stageTouchPointers.size < 2) stagePinchGesture = null;
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
      const displayedPosition = stageToDisplayPosition(latestPosition, state.stageOrientation);
      marker.style.left = `${displayedPosition.x}%`;
      marker.style.top = `${displayedPosition.y}%`;
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
    const displayedCurrentPosition = stageToDisplayPosition(currentPosition, state.stageOrientation);
    const displayedPosition = stageToDisplayPosition(currentPosition, state.stageOrientation);
    const step = event.shiftKey ? 5 : 1;
    recordPosition(dancerId, displayToStagePosition({
      x: clamp(displayedPosition.x + direction[0] * step, 2.5, 97.5),
      y: clamp(displayedPosition.y + direction[1] * step, 4, 96),
    }, state.stageOrientation));
  }

  function recordPosition(dancerId, position) {
    const dancer = state.dancers.find((item) => item.id === dancerId);
    if (!dancer) return;
    const changed = commitDocumentEdit(`move ${dancer.name}`, () => {
      dancer.keyframes = upsertKeyframe(dancer.keyframes, {
        time: state.currentTime,
        x: position.x,
        y: position.y,
      });
    });
    if (changed) showToast(`Position recorded at ${formatTime(state.currentTime)}.`);
  }

  function removeKeyframe(dancerId, frameTime) {
    const dancer = state.dancers.find((item) => item.id === dancerId);
    if (!dancer || dancer.keyframes.length <= 1) return;
    const changed = commitDocumentEdit(`delete ${dancer.name} position`, () => {
      dancer.keyframes = dancer.keyframes.filter((frame) => Math.abs(frame.time - frameTime) > TIME_EPSILON);
    });
    if (!changed) return;
    const nearestFrame = dancer.keyframes.reduce((nearest, frame) => {
      return !nearest || Math.abs(frame.time - frameTime) < Math.abs(nearest.time - frameTime) ? frame : nearest;
    }, null);
    const keyframeButton = [...elements.keyframeList.querySelectorAll(".keyframe-jump")]
      .find((button) => button.dataset.keyframeIdentity === `${dancer.id}:${nearestFrame.time.toFixed(3)}`);
    (keyframeButton || state.markerElements.get(dancer.id))?.focus();
  }

  function renameSelectedDancer() {
    const dancer = getSelectedDancer();
    if (!dancer) return;
    const nextName = normalizeDancerName(elements.dancerNameInput.value, `Dancer ${dancer.number}`);
    const previousName = dancer.name;
    const changed = commitDocumentEdit(`rename ${previousName}`, () => {
      dancer.name = nextName;
    });
    elements.dancerNameInput.value = changed ? nextName : dancer.name;
    if (changed) showToast(`${previousName} renamed to ${nextName}.`);
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
      selectButton.dataset.dancerId = dancer.id;
      selectButton.setAttribute("aria-pressed", String(dancer.id === state.selectedDancerId));
      selectButton.addEventListener("click", () => selectDancer(dancer.id, { restoreListFocus: true }));

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

      const editButton = document.createElement("button");
      editButton.type = "button";
      editButton.className = "edit-dancer";
      editButton.textContent = "✎";
      editButton.setAttribute("aria-label", `Edit ${dancer.name}'s name`);
      editButton.addEventListener("click", () => {
        selectDancer(dancer.id);
        elements.dancerNameInput.focus();
        elements.dancerNameInput.select();
      });

      row.append(selectButton, editButton, removeButton);
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
      elements.dancerNameEditor.classList.add("is-hidden");
      return;
    }

    const currentPosition = getPositionAtTime(dancer.keyframes, state.currentTime);
    elements.selectionText.textContent = `${dancer.name} · ${dancer.keyframes.length} recorded position${dancer.keyframes.length === 1 ? "" : "s"}`;
    elements.coordinateEditor.classList.remove("is-hidden");
    elements.dancerNameEditor.classList.remove("is-hidden");
    if (document.activeElement !== elements.dancerNameInput) elements.dancerNameInput.value = dancer.name;
    elements.xInput.value = displayedCurrentPosition.x.toFixed(1);
    elements.yInput.value = displayedCurrentPosition.y.toFixed(1);
    normalizeKeyframes(dancer.keyframes).forEach((frame) => {
      const displayedFrame = stageToDisplayPosition(frame, state.stageOrientation);
      const dot = document.createElement("span");
      dot.className = "keyframe-dot";
      dot.style.left = `${(frame.time / state.duration) * 100}%`;
      dot.dataset.keyframeTime = frame.time;
      elements.keyframeTrack.append(dot);

      const chip = document.createElement("span");
      chip.className = "keyframe-chip";
      chip.title = `x ${displayedFrame.x.toFixed(1)}, y ${displayedFrame.y.toFixed(1)}`;
      chip.dataset.keyframeTime = frame.time;
      chip.dataset.keyframeIdentity = `${dancer.id}:${frame.time.toFixed(3)}`;

      const jump = document.createElement("button");
      jump.type = "button";
      jump.className = "keyframe-jump";
      jump.dataset.dancerId = dancer.id;
      jump.dataset.keyframeIdentity = chip.dataset.keyframeIdentity;
      jump.textContent = formatTime(frame.time);
      jump.setAttribute("aria-label", `Go to ${dancer.name} position at ${formatTime(frame.time)}`);
      jump.addEventListener("click", () => {
        pausePlayback();
        setCurrentTime(frame.time);
      });

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "remove-keyframe";
      remove.dataset.dancerId = dancer.id;
      remove.dataset.keyframeIdentity = chip.dataset.keyframeIdentity;
      remove.textContent = "×";
      remove.disabled = dancer.keyframes.length <= 1;
      remove.setAttribute("aria-label", `Delete position at ${formatTime(frame.time)}`);
      remove.addEventListener("click", () => removeKeyframe(dancer.id, frame.time));
      chip.append(jump, remove);
      elements.keyframeList.append(chip);
    });
    updateKeyframeActiveState(true);
  }

  function updateKeyframeActiveState(force = false) {
    const selected = getSelectedDancer();
    const activeFrame = selected?.keyframes.find((frame) => Math.abs(frame.time - state.currentTime) <= TIME_EPSILON);
    const activeTime = activeFrame?.time ?? null;
    if (!force && activeTime === state.activeKeyframeTime) return;
    state.activeKeyframeTime = activeTime;
    document.querySelectorAll("[data-keyframe-time]").forEach((item) => {
      const isCurrent = activeTime !== null && Math.abs(Number(item.dataset.keyframeTime) - activeTime) <= TIME_EPSILON;
      item.classList.toggle("is-current", isCurrent);
      if (item.classList.contains("keyframe-chip")) {
        const jump = item.querySelector(".keyframe-jump");
        if (isCurrent) jump?.setAttribute("aria-current", "true");
        else jump?.removeAttribute("aria-current");
      }
    });
  }

  function setCurrentTime(nextTime, options = {}) {
    state.currentTime = clamp(nextTime, 0, state.duration);
    elements.timeline.value = state.currentTime;
    elements.currentTime.textContent = formatTime(state.currentTime);
    if (document.activeElement !== elements.timeInput) {
      elements.timeInput.value = Math.round(state.currentTime * 1000) / 1000;
    }
    renderMarkerPositions();
    const selected = getSelectedDancer();
    if (selected && document.activeElement !== elements.xInput && document.activeElement !== elements.yInput) {
      const position = getPositionAtTime(selected.keyframes, state.currentTime);
      const displayedPosition = stageToDisplayPosition(position, state.stageOrientation);
      elements.xInput.value = displayedPosition.x.toFixed(1);
      elements.yInput.value = displayedPosition.y.toFixed(1);
    }

    if (options.syncMedia !== false) {
      getLoadedMediaPlayers().forEach((player) => {
        if (Number.isFinite(player.duration)) {
          player.currentTime = clamp(state.currentTime, 0, player.duration);
        }
      });
    }
    updateKeyframeActiveState();
  }

  async function startPlayback() {
    if (state.isPlaying || state.isStartingPlayback) return;
    if (state.currentTime >= state.duration - 0.01) setCurrentTime(0);

    const mediaPlayers = getLoadedMediaPlayers();
    if (mediaPlayers.some((player) => !Number.isFinite(player.duration) || player.duration <= 0)) {
      showToast("Wait for the loaded media details before playing.");
      return;
    }

    const requestId = state.playbackRequestId + 1;
    state.playbackRequestId = requestId;
    state.isStartingPlayback = true;
    updatePlayButton();
    try {
      await Promise.all(mediaPlayers.map((player) => {
        player.currentTime = clamp(state.currentTime, 0, player.duration);
        if (state.currentTime >= player.duration - 0.01) return Promise.resolve();
        return player.play();
      }));
    } catch (error) {
      if (shouldPauseAfterPlaybackStartSettles(
        requestId,
        state.playbackRequestId,
        state.isPlaying,
        state.isStartingPlayback,
      )) {
        mediaPlayers.forEach((player) => player.pause());
      }
      if (state.playbackRequestId === requestId) {
        state.isStartingPlayback = false;
        updatePlayButton();
        showToast("The browser could not play one of the loaded media files.");
      }
      return;
    }

    if (state.playbackRequestId !== requestId) {
      if (shouldPauseAfterPlaybackStartSettles(
        requestId,
        state.playbackRequestId,
        state.isPlaying,
        state.isStartingPlayback,
      )) {
        mediaPlayers.forEach((player) => player.pause());
      }
      return;
    }

    state.isStartingPlayback = false;
    state.isPlaying = true;
    state.playbackStartedAt = performance.now();
    const masterPlayer = getMasterMediaPlayer();
    if (masterPlayer && !masterPlayer.ended) state.currentTime = masterPlayer.currentTime;
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
    const mediaTime = wasPlaying && masterPlayer && !masterPlayer.ended && !masterPlayer.paused && Number.isFinite(masterPlayer.currentTime)
      ? masterPlayer.currentTime
      : state.currentTime;
    state.playbackRequestId += 1;
    state.isStartingPlayback = false;
    if (state.rafId !== null) cancelAnimationFrame(state.rafId);
    state.rafId = null;
    state.isPlaying = false;
    getLoadedMediaPlayers().forEach((player) => {
      if (!player.paused) player.pause();
    });
    setCurrentTime(mediaTime, { syncMedia: false });
    updatePlayButton();
  }

  function togglePlayback() {
    if (state.isPlaying || state.isStartingPlayback) pausePlayback();
    else startPlayback();
  }

  function updatePlayButton() {
    elements.playIcon.textContent = state.isStartingPlayback ? "…" : state.isPlaying ? "❚❚" : "▶";
    const label = state.isStartingPlayback
      ? "Cancel playback start"
      : state.isPlaying
        ? "Pause choreography"
        : "Play choreography";
    elements.playButton.setAttribute("aria-label", label);
  }

  function updateDuration(nextDuration, options = {}) {
    const latestFrame = getLatestKeyframeTime(state.dancers);
    const numericDuration = Number(nextDuration);
    if (!Number.isFinite(numericDuration)) {
      elements.durationInput.value = Math.round(state.duration * 100) / 100;
      showToast("Timeline length must be a number from 1 to 3600 seconds.");
      return false;
    }
    const requested = clamp(numericDuration, 1, 3600);
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
      version: 2,
      projectTitle: normalizeProjectTitle(state.projectTitle),
      duration: state.duration,
      dancerCounter: state.dancerCounter,
      stageOrientation: state.stageOrientation,
      dancers: state.dancers.map((dancer) => ({
        id: dancer.id,
        number: dancer.number,
        name: dancer.name,
        color: dancer.color,
        keyframes: normalizeKeyframes(dancer.keyframes),
      })),
    };
  }

  function applyProject(project, options = {}) {
    if (!isValidProjectData(project, MAX_DANCERS)) throw new Error("Invalid choreography file");
    pausePlayback();
    replaceDocumentData(project, {
      currentTime: options.currentTime ?? 0,
      selectedDancerId: options.selectedDancerId,
    });
    if (options.clearHistory) state.history = createHistory(HISTORY_LIMIT);
    renderAll();
    setCurrentTime(state.currentTime);
    updateHistoryControls();
    if (options.save !== false) queueSave();
  }

  function exportProject() {
    const project = serializeProject();
    const payload = JSON.stringify(project, null, 2);
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const safeName = project.projectTitle.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "choreography";
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
      if (Number(file.size) > MAX_IMPORT_BYTES) {
        showToast("That plan is too large to import safely.");
        return;
      }
      const project = JSON.parse(await file.text());
      if (!isValidProjectData(project, MAX_DANCERS)) throw new Error("Invalid choreography file");
      const title = normalizeProjectTitle(project.projectTitle);
      const shouldImport = window.confirm(
        `Replace this choreography with “${title}” (${project.dancers.length} dancers)? You can undo this import. Loaded media will stay in place.`,
      );
      if (!shouldImport) return;

      pausePlayback();
      const changed = commitDocumentEdit("import plan", () => {
        replaceDocumentData(project, { currentTime: 0 });
      });
      if (changed) {
        setCurrentTime(0);
        showToast("Plan imported. Loaded audio and video were kept; undo is available.");
      }
    } catch (error) {
      showToast("That file is not a valid Formation Studio plan.");
    } finally {
      elements.importInput.value = "";
    }
  }

  function setSaveStatus(message, isError = false) {
    elements.saveStatus.textContent = message;
    elements.saveStatus.classList.toggle("is-error", isError);
  }

  function flushSave() {
    clearTimeout(saveTimer);
    saveTimer = null;
    if (state.storageWriteBlocked) {
      setSaveStatus("Autosave paused: stored plan is unreadable", true);
      return false;
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(serializeProject()));
      setSaveStatus("Saved locally");
      return true;
    } catch (error) {
      setSaveStatus("Local save unavailable", true);
      return false;
    }
  }

  function queueSave() {
    if (state.storageWriteBlocked) {
      setSaveStatus("Autosave paused: stored plan is unreadable", true);
      return;
    }
    setSaveStatus("Saving…");
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flushSave, 180);
  }

  function restoreLocalProject() {
    let raw;
    try {
      raw = localStorage.getItem(STORAGE_KEY);
    } catch (error) {
      setSaveStatus("Local save unavailable", true);
      return "unavailable";
    }
    if (!raw) return "missing";

    try {
      const project = JSON.parse(raw);
      if (!isValidProjectData(project, MAX_DANCERS)) throw new Error("Invalid stored project");
      applyProject(project, { clearHistory: true, save: false });
      return "restored";
    } catch (error) {
      state.storageWriteBlocked = true;
      elements.replaceLocalSaveButton.classList.remove("is-hidden");
      setSaveStatus("Autosave paused: stored plan is unreadable", true);
      return "corrupt";
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
    if (document.activeElement !== elements.projectTitle) elements.projectTitle.value = state.projectTitle;
    elements.stage.dataset.orientation = state.stageOrientation;
    const isFrontTop = state.stageOrientation === "front-top";
    elements.frontTopButton.setAttribute("aria-pressed", String(isFrontTop));
    elements.frontBottomButton.setAttribute("aria-pressed", String(!isFrontTop));
    elements.audiencePositionLabel.textContent = isFrontTop ? "Audience above" : "Audience below";
    elements.timeline.max = state.duration;
    elements.timeInput.max = state.duration;
    if (document.activeElement !== elements.durationInput) {
      elements.durationInput.value = Math.round(state.duration * 100) / 100;
    }
    elements.durationInput.disabled = state.audioUrl !== null || state.videoUrl !== null;
    renderDancerList();
    renderSelection();
    setCurrentTime(state.currentTime, { syncMedia: false });
    elements.totalTime.textContent = formatTime(state.duration);
    updateHistoryControls();
  }

  function seekToExactTime(value) {
    const nextTime = Number(value);
    if (!Number.isFinite(nextTime) || nextTime < 0 || nextTime > state.duration) {
      elements.timeInput.value = Math.round(state.currentTime * 1000) / 1000;
      showToast(`Enter a time from 0 to ${Math.round(state.duration * 100) / 100} seconds.`);
      return;
    }
    pausePlayback();
    setCurrentTime(nextTime);
  }

  function beginProjectTitleEdit() {
    if (!projectTitleEditSnapshot) projectTitleEditSnapshot = captureDocumentSnapshot();
  }

  function updateProjectTitleFromInput() {
    state.projectTitle = elements.projectTitle.value.slice(0, 120);
  }

  function finishProjectTitleEdit() {
    if (!projectTitleEditSnapshot) return;
    const beforeSnapshot = projectTitleEditSnapshot;
    projectTitleEditSnapshot = null;
    state.projectTitle = normalizeProjectTitle(elements.projectTitle.value);
    elements.projectTitle.value = state.projectTitle;
    commitDocumentEdit("edit project title", () => {}, { beforeSnapshot, render: false });
  }

  function syncPendingTitleForExit() {
    state.projectTitle = normalizeProjectTitle(elements.projectTitle.value);
    elements.projectTitle.value = state.projectTitle;
  }

  function isNativeEditingTarget(target) {
    return target instanceof Element && (
      target.matches("input, textarea, select") ||
      target.isContentEditable
    );
  }

  function handleHistoryShortcut(event) {
    if (isNativeEditingTarget(event.target) || event.altKey || (!event.ctrlKey && !event.metaKey)) return;
    const key = event.key.toLowerCase();
    const wantsUndo = key === "z" && !event.shiftKey;
    const wantsRedo = (key === "z" && event.shiftKey) || key === "y";
    if (wantsUndo && state.history.past.length > 0) {
      event.preventDefault();
      undoDocumentEdit({ restoreFocus: true });
    } else if (wantsRedo && state.history.future.length > 0) {
      event.preventDefault();
      redoDocumentEdit({ restoreFocus: true });
    }
  }

  function bindEvents() {
    elements.addDancerForm.addEventListener("submit", (event) => {
      event.preventDefault();
      addDancer();
    });
    elements.frontTopButton.addEventListener("click", () => setStageOrientation("front-top"));
    elements.frontBottomButton.addEventListener("click", () => setStageOrientation("front-bottom"));
    elements.zoomOutButton.addEventListener("click", () => setStageZoom(state.stageZoom - STAGE_ZOOM_STEP));
    elements.zoomResetButton.addEventListener("click", () => setStageZoom(1));
    elements.zoomInButton.addEventListener("click", () => setStageZoom(state.stageZoom + STAGE_ZOOM_STEP));
    elements.stageViewport.addEventListener("wheel", handleStageWheel, { passive: false });
    elements.stageViewport.addEventListener("pointerdown", handleStageTouchPointerDown);
    elements.stageViewport.addEventListener("pointermove", handleStageTouchPointerMove);
    elements.stageViewport.addEventListener("pointerup", finishStageTouchPointer);
    elements.stageViewport.addEventListener("pointercancel", finishStageTouchPointer);
    elements.stageViewport.addEventListener("lostpointercapture", finishStageTouchPointer);
    elements.newProjectButton.addEventListener("click", startNewProject);
    elements.themeToggle.addEventListener("click", toggleTheme);
    elements.undoButton.addEventListener("click", undoDocumentEdit);
    elements.redoButton.addEventListener("click", redoDocumentEdit);
    elements.playButton.addEventListener("click", togglePlayback);
    elements.restartButton.addEventListener("click", () => {
      pausePlayback();
      setCurrentTime(0);
    });
    elements.timeline.addEventListener("input", (event) => {
      if (state.isStartingPlayback) pausePlayback();
      const wasPlaying = state.isPlaying;
      setCurrentTime(Number(event.target.value));
      if (wasPlaying) {
        state.playbackOrigin = state.currentTime;
        state.playbackStartedAt = performance.now();
      }
    });
    elements.timeInput.addEventListener("change", (event) => seekToExactTime(event.target.value));
    elements.timeInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        seekToExactTime(event.currentTarget.value);
        event.currentTarget.select();
      }
    });
    elements.durationInput.addEventListener("change", (event) => {
      const changed = commitDocumentEdit("change timeline length", () => {
        return updateDuration(Number(event.target.value), { save: false });
      });
      if (!changed) elements.durationInput.value = Math.round(state.duration * 100) / 100;
    });
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
    elements.replaceLocalSaveButton.addEventListener("click", () => {
      const shouldReplace = window.confirm("Replace the unreadable stored plan with the choreography currently on screen?");
      if (!shouldReplace) return;
      state.storageWriteBlocked = false;
      elements.replaceLocalSaveButton.classList.add("is-hidden");
      if (flushSave()) showToast("The local save was replaced with this choreography.");
    });
    elements.projectTitle.addEventListener("focus", beginProjectTitleEdit);
    elements.projectTitle.addEventListener("input", updateProjectTitleFromInput);
    elements.projectTitle.addEventListener("change", finishProjectTitleEdit);
    elements.projectTitle.addEventListener("blur", finishProjectTitleEdit);
    elements.dancerNameInput.addEventListener("change", renameSelectedDancer);
    elements.dancerNameInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        event.currentTarget.blur();
      } else if (event.key === "Escape") {
        event.preventDefault();
        event.currentTarget.value = getSelectedDancer()?.name || "";
        event.currentTarget.blur();
      }
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
      recordPosition(dancer.id, displayToStagePosition({ x, y }, state.stageOrientation));
      state.markerElements.get(dancer.id)?.focus();
    });
    window.addEventListener("keydown", handleHistoryShortcut);
    window.addEventListener("pagehide", () => {
      syncPendingTitleForExit();
      flushSave();
    });
    window.addEventListener("beforeunload", () => {
      syncPendingTitleForExit();
      flushSave();
      pausePlayback();
      if (state.audioUrl) URL.revokeObjectURL(state.audioUrl);
      if (state.videoUrl) URL.revokeObjectURL(state.videoUrl);
    });
  }

  function initialize() {
    applyTheme(document.documentElement.dataset.theme);
    elements.audioPlayer.volume = Number(elements.volumeInput.value);
    elements.videoPlayer.volume = Number(elements.videoVolumeInput.value);
    bindEvents();
    stageResizeObserver = new ResizeObserver(relayoutStageSurface);
    stageResizeObserver.observe(elements.stageViewport);
    requestAnimationFrame(layoutStageSurface);
    const restoreResult = restoreLocalProject();
    if (restoreResult !== "restored") {
      updateDuration(state.duration, { save: false });
      renderAll();
      if (restoreResult === "missing") queueSave();
    }
    updateHistoryControls();
  }

  initialize();
})();
