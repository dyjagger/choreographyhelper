(function startFormationStudio() {
  "use strict";

  const {
    MAX_DANCER_COUNTER,
    TIME_EPSILON,
    applyGroupDelta,
    areDocumentSnapshotsEqual,
    clamp,
    createUniqueLocalDancerId,
    createHistory,
    ensureTimeInTimelineViewport,
    formatTime,
    getDancerMarkerLabel,
    getHoldIntervals,
    getHoldStateAtTime,
    getLatestKeyframeTime,
    getPolylineLength,
    getNextAvailableDancerNumber,
    getPositionAtTime,
    getStageBoundsForDimensions,
    hasPointerMoved,
    isValidProjectData,
    normalizeDancerName,
    normalizeKeyframes,
    normalizeProjectTitle,
    normalizeTimelineViewport,
    orderPositionsAlongPath,
    prepareFormationPath,
    pushHistory,
    redoHistory,
    retimeHoldInterval,
    resizeStageDancers,
    samplePolyline,
    shouldPauseAfterPlaybackStartSettles,
    undoHistory,
    upsertKeyframe,
    upsertPositionKeyframe,
    displayToStagePosition,
    normalizeStageOrientation,
    normalizeStageSize,
    stageToDisplayPosition,
    timeToTimelinePercent,
    zoomTimelineViewport,
  } = window.ChoreoCore;
  const { createStoredZip, readStoredZip } = window.FormationPackage;

  const MAX_DANCERS = 50;
  const HISTORY_LIMIT = 50;
  const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
  const MAX_COMPLETE_PACKAGE_BYTES = 1024 * 1024 * 1024;
  const MIN_STAGE_ZOOM = 1;
  const MAX_STAGE_ZOOM = 3;
  const STAGE_ZOOM_STEP = 0.25;
  const TIMELINE_ZOOM_STEP = 1.25;
  const MAX_TIMELINE_ZOOM = 32;
  const MIN_TIMELINE_VIEW_SECONDS = 5;
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
    applyHoldEditButton: document.querySelector("#apply-hold-edit-button"),
    applyStageSizeButton: document.querySelector("#apply-stage-size-button"),
    applyTransitionEditButton: document.querySelector("#apply-transition-edit-button"),
    audioFileButton: document.querySelector("#audio-file-button"),
    audioDetails: document.querySelector("#audio-details"),
    audioDuration: document.querySelector("#audio-duration"),
    audioInput: document.querySelector("#audio-input"),
    audioName: document.querySelector("#audio-name"),
    audioPlayer: document.querySelector("#audio-player"),
    cancelHoldEditButton: document.querySelector("#cancel-hold-edit-button"),
    cancelStageSizeButton: document.querySelector("#cancel-stage-size-button"),
    currentTime: document.querySelector("#current-time"),
    cancelTransitionEditButton: document.querySelector("#cancel-transition-edit-button"),
    clearSelectionButton: document.querySelector("#clear-selection-button"),
    coordinateEditor: document.querySelector("#coordinate-editor"),
    dancerCount: document.querySelector("#dancer-count"),
    dancerList: document.querySelector("#dancer-list"),
    durationInput: document.querySelector("#duration-input"),
    emptyStage: document.querySelector("#empty-stage"),
    exportButton: document.querySelector("#export-button"),
    exportPackageButton: document.querySelector("#export-package-button"),
    frontBottomButton: document.querySelector("#front-bottom-button"),
    frontTopButton: document.querySelector("#front-top-button"),
    formationPathButton: document.querySelector("#formation-path-button"),
    formationPathLine: document.querySelector("#formation-path-line"),
    formationPathOverlay: document.querySelector("#formation-path-overlay"),
    formationPreviewLayer: document.querySelector("#formation-preview-layer"),
    holdEditBar: document.querySelector("#hold-edit-bar"),
    holdEditDetail: document.querySelector("#hold-edit-detail"),
    holdEditError: document.querySelector("#hold-edit-error"),
    holdEditTitle: document.querySelector("#hold-edit-title"),
    holdEndInput: document.querySelector("#hold-end-input"),
    holdEndFromPlayheadButton: document.querySelector("#hold-end-from-playhead-button"),
    holdPositionButton: document.querySelector("#hold-position-button"),
    holdPositionLabel: document.querySelector("#hold-position-label"),
    holdStartInput: document.querySelector("#hold-start-input"),
    holdStartFromPlayheadButton: document.querySelector("#hold-start-from-playhead-button"),
    holdTrack: document.querySelector("#hold-track"),
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
    selectAllButton: document.querySelector("#select-all-button"),
    selectionCount: document.querySelector("#selection-count"),
    selectionMarquee: document.querySelector("#selection-marquee"),
    selectionText: document.querySelector("#selection-text"),
    stage: document.querySelector("#stage"),
    stageDepthInput: document.querySelector("#stage-depth-input"),
    stageInstructions: document.querySelector("#stage-instructions"),
    stageResizeModeInputs: [...document.querySelectorAll('input[name="stage-resize-mode"]')],
    stageSizeButton: document.querySelector("#stage-size-button"),
    stageSizeEditBar: document.querySelector("#stage-size-edit-bar"),
    stageSizeEditDetail: document.querySelector("#stage-size-edit-detail"),
    stageSizeEditError: document.querySelector("#stage-size-edit-error"),
    stageSizeLabel: document.querySelector("#stage-size-label"),
    stageSizeOriginalOutline: document.querySelector("#stage-size-original-outline"),
    stageSurfaceExtent: document.querySelector("#stage-surface-extent"),
    stageViewport: document.querySelector("#stage-viewport"),
    stageWidthInput: document.querySelector("#stage-width-input"),
    audiencePositionLabel: document.querySelector("#audience-position-label"),
    timeline: document.querySelector("#timeline"),
    timelineFitButton: document.querySelector("#timeline-fit-button"),
    timelineWindowLabel: document.querySelector("#timeline-window-label"),
    timelineWrap: document.querySelector("#timeline-wrap"),
    timelineZoomInButton: document.querySelector("#timeline-zoom-in-button"),
    timelineZoomLevel: document.querySelector("#timeline-zoom-level"),
    timelineZoomOutButton: document.querySelector("#timeline-zoom-out-button"),
    transitionEditBar: document.querySelector("#transition-edit-bar"),
    transitionEditDetail: document.querySelector("#transition-edit-detail"),
    transitionEditTitle: document.querySelector("#transition-edit-title"),
    transitionGhostLayer: document.querySelector("#transition-ghost-layer"),
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
    activeStageTool: null,
    audioFile: null,
    audioVolume: 0.9,
    currentTime: 0,
    dancerCounter: 0,
    dancers: [],
    duration: 60,
    history: createHistory(HISTORY_LIMIT),
    holdEdit: null,
    isPlaying: false,
    isStartingPlayback: false,
    markerElements: new Map(),
    playbackOrigin: 0,
    playbackRequestId: 0,
    playbackStartedAt: 0,
    projectTitle: "Untitled choreography",
    rafId: null,
    selectedDancerId: null,
    selectedDancerIds: [],
    stageDepth: 1,
    stageOrientation: "front-bottom",
    stageSizeEdit: null,
    stageWidth: 1,
    stageZoom: 1,
    storageWriteBlocked: false,
    timelineViewport: { start: 0, end: 60 },
    transitionEdit: null,
    audioUrl: null,
    videoUrl: null,
    videoFile: null,
    videoVolume: 0.8,
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

  function getSelectedDancers() {
    const selectedIds = new Set(state.selectedDancerIds);
    return state.dancers.filter((dancer) => selectedIds.has(dancer.id));
  }

  function isDancerHolding(dancer, time = state.currentTime) {
    return Boolean(dancer && getHoldStateAtTime(dancer.keyframes, time).active);
  }

  function positionsMatch(left, right) {
    return Boolean(left && right) &&
      Math.abs(Number(left.x) - Number(right.x)) <= 0.0001 &&
      Math.abs(Number(left.y) - Number(right.y)) <= 0.0001;
  }

  function getMinimumTimelineSpan() {
    return Math.min(
      state.duration,
      Math.max(MIN_TIMELINE_VIEW_SECONDS, state.duration / MAX_TIMELINE_ZOOM),
    );
  }

  function getTimelineViewport() {
    return normalizeTimelineViewport(state.timelineViewport, state.duration, getMinimumTimelineSpan());
  }

  function timelineViewportsMatch(left, right) {
    return Math.abs(left.start - right.start) <= TIME_EPSILON &&
      Math.abs(left.end - right.end) <= TIME_EPSILON;
  }

  function isDocumentEditOpen() {
    return Boolean(state.transitionEdit || state.holdEdit || state.stageSizeEdit);
  }

  function isTransitionEditDirty() {
    return Boolean(state.transitionEdit?.originalKeyframes.size);
  }

  function isHoldEditDirty() {
    const edit = state.holdEdit;
    const dancer = edit && state.dancers.find((candidate) => candidate.id === edit.dancerId);
    return Boolean(dancer && JSON.stringify(normalizeKeyframes(dancer.keyframes)) !== JSON.stringify(edit.originalKeyframes));
  }

  function isStageSizeEditDirty() {
    const edit = state.stageSizeEdit;
    return Boolean(edit && edit.valid && (
      Math.abs(edit.draftWidth - edit.originalWidth) > 0.0001 ||
      Math.abs(edit.draftDepth - edit.originalDepth) > 0.0001
    ));
  }

  function getDocumentEditSaveMessage() {
    if (state.stageSizeEdit) return "Stage size preview not applied";
    if (state.holdEdit) return "Hold timing preview not applied";
    return "Transition preview not applied";
  }

  function requireFinishedTransitionEdit() {
    if (!isDocumentEditOpen()) return true;
    if (state.stageSizeEdit) {
      showToast("Apply or cancel the stage size edit first.");
      elements.applyStageSizeButton.focus();
      return false;
    }
    if (state.holdEdit) {
      showToast("Apply or cancel the hold edit first.");
      elements.applyHoldEditButton.focus();
      return false;
    }
    showToast("Apply or cancel the transition edit first.");
    elements.applyTransitionEditButton.focus();
    return false;
  }

  function renderTransitionGhosts() {
    const edit = state.transitionEdit;
    if (!edit) {
      elements.transitionGhostLayer.replaceChildren();
      return;
    }
    const ghosts = [...edit.originalPositions.entries()].flatMap(([dancerId, position]) => {
      const dancer = state.dancers.find((candidate) => candidate.id === dancerId);
      if (!dancer) return [];
      const displayedPosition = stageToDisplayPosition(position, state.stageOrientation);
      const ghost = document.createElement("span");
      ghost.className = "transition-position-ghost";
      ghost.style.left = `${displayedPosition.x}%`;
      ghost.style.top = `${displayedPosition.y}%`;
      ghost.style.setProperty("--marker-color", dancer.color);
      ghost.textContent = getDancerMarkerLabel(dancer.name, dancer.number);
      return [ghost];
    });
    elements.transitionGhostLayer.replaceChildren(...ghosts);
  }

  function renderTransitionEditMode() {
    const edit = state.transitionEdit;
    const isEditing = isDocumentEditOpen();
    const isDirty = isTransitionEditDirty();
    elements.transitionEditBar.classList.toggle("is-hidden", !edit);
    elements.stage.classList.toggle("is-transition-editing", isEditing);
    elements.stageInstructions.textContent = edit
      ? "Move dancers to preview this transition. Outlines show their original positions."
      : state.stageSizeEdit
        ? "Previewing the resized stage. The dashed outline shows the original boundary."
      : state.holdEdit
        ? "Adjust the hold times below. The formation remains unchanged until you apply."
        : "Select a time, then drag a dancer to record a position.";
    elements.recordCoordinatesButton.textContent = edit ? "Preview position" : "Record here";
    elements.applyTransitionEditButton.disabled = !isDirty;
    if (edit) {
      elements.transitionEditTitle.textContent = `Editing transition at ${formatTime(edit.time)}`;
      const changedCount = edit.originalKeyframes.size;
      elements.transitionEditDetail.textContent = changedCount === 0
        ? "Move dancers to preview the new formation. Outlines will show their original positions."
        : `${changedCount} dancer${changedCount === 1 ? "" : "s"} changed. Outlines show the original formation.`;
    }

    const alwaysUnlocked = [
      elements.projectTitle,
      elements.newProjectButton,
      elements.exportButton,
      elements.exportPackageButton,
      elements.importButton,
      elements.replaceLocalSaveButton,
      elements.frontTopButton,
      elements.frontBottomButton,
      elements.playButton,
      elements.restartButton,
      elements.audioFileButton,
      elements.removeAudioButton,
      elements.volumeInput,
      elements.videoFileButton,
      elements.removeVideoButton,
      elements.videoVolumeInput,
      elements.newDancerNameInput,
      elements.stageSizeButton,
    ];
    alwaysUnlocked.forEach((control) => {
      control.disabled = isEditing;
    });
    elements.timeline.disabled = Boolean(edit);
    elements.timeInput.disabled = Boolean(edit);
    elements.durationInput.disabled = isEditing || state.audioUrl !== null || state.videoUrl !== null;
    elements.addDancerButton.disabled = isEditing || state.dancers.length >= MAX_DANCERS;
    if (isEditing) {
      elements.undoButton.disabled = true;
      elements.redoButton.disabled = true;
      elements.holdPositionButton.disabled = true;
      const selectedDancer = getSelectedDancer();
      const holdState = selectedDancer && edit ? getHoldStateAtTime(selectedDancer.keyframes, edit.time) : null;
      const canEditSelectedPosition = Boolean(edit && selectedDancer) && (
        !holdState?.active || Math.abs(Number(holdState.event?.time) - edit.time) <= TIME_EPSILON
      );
      elements.xInput.disabled = !canEditSelectedPosition;
      elements.yInput.disabled = !canEditSelectedPosition;
      elements.recordCoordinatesButton.disabled = !canEditSelectedPosition;
      elements.coordinateEditor.title = canEditSelectedPosition
        ? "Preview this position, then apply the transition changes"
        : edit
          ? "End this dancer's earlier hold before changing this transition"
          : state.stageSizeEdit
            ? "Apply or cancel the stage size edit first"
            : "Apply or cancel the hold timing edit first";
      if (state.holdEdit || state.stageSizeEdit) {
        elements.selectAllButton.disabled = true;
        elements.clearSelectionButton.disabled = true;
        elements.formationPathButton.disabled = true;
      }
    }
    renderTransitionGhosts();
    renderHoldEditMode();
    renderStageSizeEditMode();
  }

  function startTransitionEdit(dancerId, frameTime) {
    const dancer = state.dancers.find((candidate) => candidate.id === dancerId);
    if (!dancer) return;
    if (state.holdEdit || state.stageSizeEdit) {
      requireFinishedTransitionEdit();
      return;
    }
    if (state.transitionEdit) {
      const isSameTransition = state.transitionEdit.sourceDancerId === dancerId &&
        Math.abs(state.transitionEdit.time - frameTime) <= TIME_EPSILON;
      if (isSameTransition) {
        state.markerElements.get(dancerId)?.focus();
        return;
      }
      if (isTransitionEditDirty()) {
        requireFinishedTransitionEdit();
        return;
      }
      cancelTransitionEdit({ announce: false });
    }

    pausePlayback();
    setSelectedDancerIds([dancerId], { primaryDancerId: dancerId, render: false });
    setCurrentTime(frameTime);
    state.transitionEdit = {
      beforeSnapshot: captureDocumentSnapshot(),
      originalKeyframes: new Map(),
      originalPositions: new Map(),
      sourceDancerId: dancerId,
      time: frameTime,
    };
    renderAll();
    setSaveStatus("Transition preview not applied");
    state.markerElements.get(dancerId)?.focus();
  }

  function previewTransitionPositions(positionEntries, options = {}) {
    const edit = state.transitionEdit;
    if (!edit) return false;
    const entryMap = new Map(positionEntries.map((entry) => [entry.dancerId, entry]));
    const affectedDancers = state.dancers.filter((dancer) => entryMap.has(dancer.id));
    if (affectedDancers.length === 0) return false;

    const blockedDancer = affectedDancers.find((dancer) => {
      const originalFrames = edit.originalKeyframes.get(dancer.id) || dancer.keyframes;
      const holdState = getHoldStateAtTime(originalFrames, edit.time);
      return holdState.active && Math.abs(Number(holdState.event?.time) - edit.time) > TIME_EPSILON;
    });
    if (blockedDancer) {
      showToast(`End ${blockedDancer.name}'s active hold before changing this transition.`);
      renderMarkerPositions();
      return false;
    }
    const relocatedResumeDancer = affectedDancers.find((dancer) => {
      const originalFrames = edit.originalKeyframes.get(dancer.id) || dancer.keyframes;
      const resume = getHoldIntervals(originalFrames).find((interval) => (
        interval.end !== null && Math.abs(interval.end - edit.time) <= TIME_EPSILON
      ));
      return resume && !positionsMatch(resume, entryMap.get(dancer.id));
    });
    if (relocatedResumeDancer) {
      showToast("Resume starts movement here. Edit the hold timing, or move later to set the destination.");
      renderMarkerPositions();
      return false;
    }

    affectedDancers.forEach((dancer) => {
      if (!edit.originalKeyframes.has(dancer.id)) {
        const originalFrames = normalizeKeyframes(dancer.keyframes);
        edit.originalKeyframes.set(dancer.id, originalFrames);
        edit.originalPositions.set(dancer.id, getPositionAtTime(originalFrames, edit.time));
      }
      const originalFrames = edit.originalKeyframes.get(dancer.id);
      const originalPosition = edit.originalPositions.get(dancer.id);
      const nextPosition = entryMap.get(dancer.id);
      if (positionsMatch(originalPosition, nextPosition)) {
        dancer.keyframes = normalizeKeyframes(originalFrames);
        edit.originalKeyframes.delete(dancer.id);
        edit.originalPositions.delete(dancer.id);
      } else {
        dancer.keyframes = upsertPositionKeyframe(originalFrames, edit.time, nextPosition);
      }
    });
    renderAll();
    setSaveStatus("Transition preview not applied");
    const subject = options.subject || (affectedDancers.length === 1 ? affectedDancers[0].name : `${affectedDancers.length} dancers`);
    showToast(`${subject} previewed at ${formatTime(edit.time)}. Apply changes when ready.`);
    return true;
  }

  function applyTransitionEdit() {
    const edit = state.transitionEdit;
    if (!edit) return;
    if (!isTransitionEditDirty()) {
      state.transitionEdit = null;
      renderAll();
      setSaveStatus("Saved locally");
      return;
    }
    const changedCount = edit.originalKeyframes.size;
    state.transitionEdit = null;
    const changed = commitDocumentEdit(
      `edit transition at ${formatTime(edit.time)}`,
      () => {},
      { beforeSnapshot: edit.beforeSnapshot },
    );
    if (changed) {
      showToast(`${changedCount} dancer${changedCount === 1 ? "" : "s"} updated at ${formatTime(edit.time)}.`);
      elements.undoButton.focus();
    }
  }

  function cancelTransitionEdit(options = {}) {
    const edit = state.transitionEdit;
    if (!edit) return;
    const wasDirty = isTransitionEditDirty();
    state.transitionEdit = null;
    replaceDocumentData(edit.beforeSnapshot.project, edit.beforeSnapshot);
    renderAll();
    setSaveStatus("Saved locally");
    if (options.announce !== false) showToast(wasDirty ? "Transition changes discarded." : "Transition editing closed.");
    state.markerElements.get(edit.sourceDancerId)?.focus();
  }

  function formatStageSize(value) {
    return Number.isInteger(Number(value)) ? String(Number(value)) : String(Math.round(Number(value) * 100) / 100);
  }

  function renderStageSizeEditMode() {
    const edit = state.stageSizeEdit;
    elements.stageSizeEditBar.classList.toggle("is-hidden", !edit);
    elements.stageSizeOriginalOutline.classList.toggle("is-hidden", !edit);
    elements.stageSizeLabel.textContent = `Stage size · ${formatStageSize(state.stageWidth)}× W × ${formatStageSize(state.stageDepth)}× D`;
    if (!edit) return;

    if (document.activeElement !== elements.stageWidthInput) {
      elements.stageWidthInput.value = formatStageSize(edit.draftWidth);
    }
    if (document.activeElement !== elements.stageDepthInput) {
      elements.stageDepthInput.value = formatStageSize(edit.draftDepth);
    }
    elements.stageResizeModeInputs.forEach((input) => {
      input.checked = input.value === edit.mode;
    });
    elements.stageSizeEditDetail.textContent = edit.mode === "stretch"
      ? "Stretch keeps every dancer at the same percentage of the stage, so formations expand or contract with it."
      : "Keep spacing preserves real distances. Added depth extends behind the dancers and width grows equally on both sides.";
    elements.stageSizeEditError.textContent = edit.error || "";
    elements.applyStageSizeButton.disabled = !isStageSizeEditDirty();
  }

  function getStageSizeEditError(result) {
    if (result?.reason === "outside-stage") {
      const dancerName = result.dancerName || "A dancer";
      const time = Number.isFinite(result.time) ? ` at ${formatTime(result.time)}` : "";
      return `${dancerName}'s position${time} will not fit. Increase the stage or choose Stretch to fill stage.`;
    }
    return "Enter width and depth values from 1 to 4.";
  }

  function previewStageSizeEdit() {
    const edit = state.stageSizeEdit;
    if (!edit) return;
    const width = Number(elements.stageWidthInput.value);
    const depth = Number(elements.stageDepthInput.value);
    const mode = elements.stageResizeModeInputs.find((input) => input.checked)?.value || edit.mode;
    const dimensionsAreValid = Number.isFinite(width) && width >= 1 && width <= 4 &&
      Number.isFinite(depth) && depth >= 1 && depth <= 4;

    replaceDocumentData(edit.beforeSnapshot.project, edit.beforeSnapshot);
    edit.mode = mode === "stretch" ? "stretch" : "keep-spacing";
    if (!dimensionsAreValid) {
      edit.valid = false;
      edit.error = getStageSizeEditError();
      renderAll();
      focusStageFront();
      setSaveStatus(getDocumentEditSaveMessage());
      return;
    }

    edit.draftWidth = normalizeStageSize(width);
    edit.draftDepth = normalizeStageSize(depth);
    state.stageWidth = edit.draftWidth;
    state.stageDepth = edit.draftDepth;
    const result = resizeStageDancers(
      edit.beforeSnapshot.project.dancers,
      { width: edit.originalWidth, depth: edit.originalDepth },
      { width: edit.draftWidth, depth: edit.draftDepth },
      edit.mode,
    );
    edit.valid = result.ok;
    edit.error = result.ok ? "" : getStageSizeEditError(result);
    if (result.ok) state.dancers = result.dancers;
    renderAll();
    focusStageFront();
    setSaveStatus(getDocumentEditSaveMessage());
  }

  function startStageSizeEdit() {
    if (!requireFinishedTransitionEdit()) return;
    pausePlayback();
    const beforeSnapshot = captureDocumentSnapshot();
    state.stageSizeEdit = {
      beforeSnapshot,
      originalWidth: state.stageWidth,
      originalDepth: state.stageDepth,
      draftWidth: state.stageWidth,
      draftDepth: state.stageDepth,
      mode: "keep-spacing",
      valid: true,
      error: "",
    };
    renderAll();
    focusStageFront();
    setSaveStatus(getDocumentEditSaveMessage());
    requestAnimationFrame(() => elements.stageDepthInput.focus());
  }

  function applyStageSizeEdit() {
    const edit = state.stageSizeEdit;
    if (!edit || !isStageSizeEditDirty()) return;
    const width = edit.draftWidth;
    const depth = edit.draftDepth;
    state.stageSizeEdit = null;
    const changed = commitDocumentEdit(
      `resize stage to ${formatStageSize(width)}× wide by ${formatStageSize(depth)}× deep`,
      () => {},
      { beforeSnapshot: edit.beforeSnapshot },
    );
    if (changed) {
      showToast(`Stage resized to ${formatStageSize(width)}× wide by ${formatStageSize(depth)}× deep.`);
      elements.stageSizeButton.focus();
    }
  }

  function cancelStageSizeEdit(options = {}) {
    const edit = state.stageSizeEdit;
    if (!edit) return;
    const wasDirty = isStageSizeEditDirty();
    state.stageSizeEdit = null;
    replaceDocumentData(edit.beforeSnapshot.project, edit.beforeSnapshot);
    renderAll();
    setSaveStatus("Saved locally");
    if (options.announce !== false) showToast(wasDirty ? "Stage size changes discarded." : "Stage size editing closed.");
    elements.stageSizeButton.focus();
  }

  function renderHoldEditMode() {
    const edit = state.holdEdit;
    elements.holdEditBar.classList.toggle("is-hidden", !edit);
    if (!edit) return;
    const dancer = state.dancers.find((candidate) => candidate.id === edit.dancerId);
    elements.holdEditTitle.textContent = `Editing ${dancer?.name || "dancer"} hold`;
    elements.holdStartInput.max = state.duration;
    elements.holdEndInput.max = state.duration;
    if (document.activeElement !== elements.holdStartInput) {
      elements.holdStartInput.value = Math.round(edit.draftStart * 1000) / 1000;
    }
    if (document.activeElement !== elements.holdEndInput) {
      elements.holdEndInput.value = edit.draftEnd === null ? "" : Math.round(edit.draftEnd * 1000) / 1000;
    }
    const originalEnd = edit.originalEnd === null ? "ongoing" : formatTime(edit.originalEnd);
    elements.holdEditDetail.textContent = edit.hasRelocatedResume
      ? `Original range ${formatTime(edit.originalStart)} to ${originalEnd}. This Resume also contains a formation; move Resume earlier to create travel time while keeping that arrival.`
      : `Original range ${formatTime(edit.originalStart)} to ${originalEnd}. Adjust either boundary; blank Resume keeps the hold ongoing.`;
    elements.holdEditError.textContent = edit.error || "";
    elements.applyHoldEditButton.disabled = !edit.valid || !isHoldEditDirty();
  }

  function getHoldEditError(reason, conflictTime) {
    if (reason === "resume-conflict") {
      return `Resume cannot share ${formatTime(conflictTime)} with a different formation. Choose an earlier or later time.`;
    }
    if (reason === "hold-conflict") {
      return `This range would overlap another Hold/Resume event near ${formatTime(conflictTime)}. Choose times between the neighbouring hold ranges.`;
    }
    if (reason === "hold-not-found" || reason === "resume-not-found") {
      return "That hold changed unexpectedly. Cancel and open it again.";
    }
    return `Hold start must be before Resume, with both times between 0 and ${Math.round(state.duration * 100) / 100} seconds.`;
  }

  function previewHoldEdit() {
    const edit = state.holdEdit;
    if (!edit) return;
    const dancer = state.dancers.find((candidate) => candidate.id === edit.dancerId);
    if (!dancer) {
      edit.valid = false;
      edit.error = "That dancer is no longer available.";
      renderHoldEditMode();
      return;
    }
    const startValue = elements.holdStartInput.value.trim();
    const endValue = elements.holdEndInput.value.trim();
    const nextStart = edit.startTouched ? (startValue === "" ? NaN : Number(startValue)) : edit.originalStart;
    const nextEnd = edit.endTouched ? (endValue === "" ? null : Number(endValue)) : edit.originalEnd;
    if (
      !Number.isFinite(nextStart) ||
      nextStart < 0 ||
      nextStart > state.duration ||
      (nextEnd !== null && (!Number.isFinite(nextEnd) || nextEnd > state.duration))
    ) {
      dancer.keyframes = normalizeKeyframes(edit.originalKeyframes);
      edit.valid = false;
      edit.error = getHoldEditError("invalid-range");
      renderAll();
      setSaveStatus("Hold timing preview not applied");
      return;
    }
    const result = retimeHoldInterval(
      edit.originalKeyframes,
      edit.originalStart,
      edit.originalEnd,
      nextStart,
      nextEnd,
    );
    if (!result.ok) {
      dancer.keyframes = normalizeKeyframes(edit.originalKeyframes);
      edit.valid = false;
      edit.error = getHoldEditError(result.reason, result.conflictTime);
      renderAll();
      setSaveStatus("Hold timing preview not applied");
      return;
    }
    dancer.keyframes = result.keyframes;
    edit.draftStart = nextStart;
    edit.draftEnd = nextEnd;
    edit.retainedArrival = result.retainedArrival;
    edit.valid = true;
    edit.error = "";
    renderAll();
    setSaveStatus("Hold timing preview not applied");
  }

  function setHoldBoundaryFromPlayhead(boundary) {
    const edit = state.holdEdit;
    if (!edit) return;
    const input = boundary === "start" ? elements.holdStartInput : elements.holdEndInput;
    input.value = Math.round(state.currentTime * 1000) / 1000;
    if (boundary === "start") edit.startTouched = true;
    else edit.endTouched = true;
    previewHoldEdit();
    input.focus();
    input.select();
  }

  function startHoldEdit(dancerId, interval, options = {}) {
    const dancer = state.dancers.find((candidate) => candidate.id === dancerId);
    if (!dancer || !interval) return;
    if (state.transitionEdit || state.stageSizeEdit) {
      requireFinishedTransitionEdit();
      return;
    }
    if (state.holdEdit) {
      const sameHold = state.holdEdit.dancerId === dancerId &&
        Math.abs(state.holdEdit.originalStart - interval.start) <= TIME_EPSILON;
      if (sameHold) {
        (options.focus === "end" ? elements.holdEndInput : elements.holdStartInput).focus();
        return;
      }
      requireFinishedTransitionEdit();
      return;
    }

    pausePlayback();
    setSelectedDancerIds([dancerId], { primaryDancerId: dancerId, render: false });
    const originalKeyframes = normalizeKeyframes(dancer.keyframes);
    const startFrame = originalKeyframes.find((frame) => (
      frame.hold === true && Math.abs(frame.time - interval.start) <= TIME_EPSILON
    ));
    const endFrame = interval.end === null ? null : originalKeyframes.find((frame) => (
      frame.hold === false && Math.abs(frame.time - interval.end) <= TIME_EPSILON
    ));
    state.holdEdit = {
      beforeSnapshot: captureDocumentSnapshot(),
      dancerId,
      originalKeyframes,
      originalStart: interval.start,
      originalEnd: interval.end,
      draftStart: interval.start,
      draftEnd: interval.end,
      hasRelocatedResume: Boolean(endFrame && startFrame && !positionsMatch(startFrame, endFrame)),
      retainedArrival: false,
      startTouched: false,
      endTouched: false,
      valid: true,
      error: "",
    };
    renderAll();
    setSaveStatus("Hold timing preview not applied");
    requestAnimationFrame(() => {
      const target = options.focus === "end" ? elements.holdEndInput : elements.holdStartInput;
      target.focus();
      target.select();
    });
  }

  function applyHoldEdit() {
    const edit = state.holdEdit;
    if (!edit || !edit.valid || !isHoldEditDirty()) return;
    const dancer = state.dancers.find((candidate) => candidate.id === edit.dancerId);
    const label = `edit ${dancer?.name || "dancer"} hold timing`;
    state.holdEdit = null;
    const changed = commitDocumentEdit(label, () => {}, { beforeSnapshot: edit.beforeSnapshot });
    if (changed) {
      showToast(edit.draftEnd === null
        ? "Hold updated and remains ongoing."
        : `Hold updated. Movement resumes at ${formatTime(edit.draftEnd)}.`);
      elements.undoButton.focus();
    }
  }

  function cancelHoldEdit(options = {}) {
    const edit = state.holdEdit;
    if (!edit) return;
    const wasDirty = isHoldEditDirty();
    state.holdEdit = null;
    replaceDocumentData(edit.beforeSnapshot.project, edit.beforeSnapshot);
    renderAll();
    setSaveStatus("Saved locally");
    if (options.announce !== false) showToast(wasDirty ? "Hold timing changes discarded." : "Hold editing closed.");
    const range = [...elements.holdTrack.querySelectorAll(".hold-range")].find((item) => (
      item.dataset.dancerId === edit.dancerId &&
      Math.abs(Number(item.dataset.holdStart) - edit.originalStart) <= TIME_EPSILON
    ));
    (range || state.markerElements.get(edit.dancerId))?.focus();
  }

  function setSelectedDancerIds(dancerIds, options = {}) {
    const availableIds = new Set(state.dancers.map((dancer) => dancer.id));
    const nextIds = [...new Set(Array.isArray(dancerIds) ? dancerIds : [])]
      .filter((dancerId) => availableIds.has(dancerId));
    const requestedPrimary = options.primaryDancerId;
    state.selectedDancerIds = nextIds;
    state.selectedDancerId = nextIds.includes(requestedPrimary)
      ? requestedPrimary
      : nextIds.at(-1) || null;
    if (options.render === false) return;
    renderSelection();
    renderDancerList();
    renderMarkerPositions();
    renderSelectionControls();
    renderTransitionEditMode();
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
      selectedDancerIds: [...state.selectedDancerIds],
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
    const previousDuration = state.duration;
    const previousViewport = getTimelineViewport();
    const wasFullTimeline = previousViewport.start <= TIME_EPSILON &&
      previousViewport.end >= previousDuration - TIME_EPSILON;
    state.projectTitle = normalizeProjectTitle(project.projectTitle);
    state.stageOrientation = normalizeStageOrientation(project.stageOrientation);
    state.stageWidth = normalizeStageSize(project.stageWidth ?? 1);
    state.stageDepth = normalizeStageSize(project.stageDepth ?? 1);
    state.audioVolume = clamp(project.audioVolume ?? 0.9, 0, 1);
    state.videoVolume = clamp(project.videoVolume ?? 0.8, 0, 1);
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
    state.timelineViewport = wasFullTimeline
      ? { start: 0, end: state.duration }
      : normalizeTimelineViewport(previousViewport, state.duration, getMinimumTimelineSpan());
    const hasExplicitSelection = Array.isArray(options.selectedDancerIds) || options.selectedDancerId !== undefined;
    const requestedSelections = Array.isArray(options.selectedDancerIds)
      ? options.selectedDancerIds
      : options.selectedDancerId
        ? [options.selectedDancerId]
        : [];
    const availableIds = new Set(state.dancers.map((dancer) => dancer.id));
    state.selectedDancerIds = [...new Set(requestedSelections)].filter((dancerId) => availableIds.has(dancerId));
    if (!hasExplicitSelection && state.dancers[0]) state.selectedDancerIds = [state.dancers[0].id];
    state.selectedDancerId = state.selectedDancerIds.includes(options.selectedDancerId)
      ? options.selectedDancerId
      : state.selectedDancerIds.at(-1) || null;
    state.currentTime = clamp(options.currentTime ?? 0, 0, state.duration);
    state.markerElements.forEach((marker) => marker.remove());
    state.markerElements.clear();
  }

  function commitDocumentEdit(label, mutation, options = {}) {
    if (isDocumentEditOpen() && options.allowDuringTimelineEdit !== true) {
      requireFinishedTransitionEdit();
      return false;
    }
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
    if (!requireFinishedTransitionEdit()) return;
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
    if (!requireFinishedTransitionEdit()) return;
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
    if (!requireFinishedTransitionEdit()) return;
    const shouldReset = window.confirm(
      "Start a new project? This permanently clears the choreography, loaded audio, and loaded video. Export anything you want to keep first.",
    );
    if (!shouldReset) return;

    pausePlayback();
    removeAudio(false);
    removeVideo(false);
    state.projectTitle = "Untitled choreography";
    state.dancerCounter = 0;
    state.dancers = [];
    state.duration = 60;
    state.timelineViewport = { start: 0, end: 60 };
    state.currentTime = 0;
    state.selectedDancerId = null;
    state.selectedDancerIds = [];
    state.stageOrientation = "front-bottom";
    state.stageWidth = 1;
    state.stageDepth = 1;
    state.audioVolume = 0.9;
    state.videoVolume = 0.8;
    state.activeStageTool = null;
    state.history = createHistory(HISTORY_LIMIT);
    projectTitleEditSnapshot = null;
    elements.stage.dataset.tool = "";
    clearFormationPathPreview();
    state.markerElements.forEach((marker) => marker.remove());
    state.markerElements.clear();
    renderAll();
    setCurrentTime(0);
    queueSave();
    elements.addDancerButton.focus();
    showToast("New project started. Previous choreography and media were cleared.");
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
      state.selectedDancerIds = [dancer.id];
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
      state.selectedDancerIds = state.selectedDancerIds.filter((selectedId) => selectedId !== dancerId);
      if (state.selectedDancerId === dancerId) state.selectedDancerId = state.selectedDancerIds.at(-1) || null;
      if (state.selectedDancerIds.length === 0) {
        const fallback = state.dancers[Math.min(removedIndex, state.dancers.length - 1)]?.id || null;
        state.selectedDancerId = fallback;
        state.selectedDancerIds = fallback ? [fallback] : [];
      }
    });
    if (state.selectedDancerId) state.markerElements.get(state.selectedDancerId)?.focus();
    else elements.addDancerButton.focus();
    showToast(`${dancer.name} removed.`);
  }

  function findDancerListButton(dancerId) {
    return [...elements.dancerList.querySelectorAll(".dancer-select-button")]
      .find((button) => button.dataset.dancerId === dancerId) || null;
  }

  function selectDancer(dancerId, options = {}) {
    if (!state.dancers.some((dancer) => dancer.id === dancerId)) return;
    if (state.holdEdit && state.holdEdit.dancerId !== dancerId) {
      requireFinishedTransitionEdit();
      return;
    }
    let nextIds;
    if (options.toggle) {
      nextIds = state.selectedDancerIds.includes(dancerId)
        ? state.selectedDancerIds.filter((selectedId) => selectedId !== dancerId)
        : [...state.selectedDancerIds, dancerId];
    } else if (options.additive) {
      nextIds = [...state.selectedDancerIds, dancerId];
    } else {
      nextIds = [dancerId];
    }
    setSelectedDancerIds(nextIds, { primaryDancerId: dancerId });
    if (options.restoreListFocus) findDancerListButton(dancerId)?.focus();
  }

  function ensureMarkerElement(dancer) {
    if (state.markerElements.has(dancer.id)) return state.markerElements.get(dancer.id);

    const marker = document.createElement("button");
    marker.type = "button";
    marker.className = "dancer-marker";
    marker.dataset.dancerId = dancer.id;
    marker.style.setProperty("--marker-color", dancer.color);
    marker.textContent = getDancerMarkerLabel(dancer.name, dancer.number);
    marker.setAttribute("aria-label", `${dancer.name}. Drag to set position at the current time.`);

    marker.addEventListener("pointerdown", startMarkerDrag);
    marker.addEventListener("keydown", handleMarkerKeydown);

    elements.markerLayer.append(marker);
    state.markerElements.set(dancer.id, marker);
    return marker;
  }

  function renderMarkerPositions() {
    const selectedIds = new Set(state.selectedDancerIds);
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
      marker.textContent = getDancerMarkerLabel(dancer.name, dancer.number);
      marker.style.left = `${displayedPosition.x}%`;
      marker.style.top = `${displayedPosition.y}%`;
      marker.classList.toggle("is-selected", selectedIds.has(dancer.id));
      marker.classList.toggle("is-primary", dancer.id === state.selectedDancerId);
      marker.classList.toggle("is-transition-draft", Boolean(state.transitionEdit?.originalKeyframes.has(dancer.id)));
      const isHolding = isDancerHolding(dancer);
      marker.classList.toggle("is-holding", isHolding);
      marker.setAttribute("aria-pressed", String(selectedIds.has(dancer.id)));
      marker.setAttribute("aria-label", `${dancer.name} at ${Math.round(displayedPosition.x)} percent across and ${Math.round(displayedPosition.y)} percent down.${isHolding ? " Holding position." : ""}`);
    });

    elements.emptyStage.classList.toggle("is-hidden", state.dancers.length > 0);
  }

  function displayPositionFromPointer(event, options = {}) {
    const rect = elements.stage.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    if (options.clampToStage === false) return { x, y };
    const bounds = getStageBoundsForDimensions({ width: state.stageWidth, depth: state.stageDepth });
    return { x: clamp(x, bounds.minX, bounds.maxX), y: clamp(y, bounds.minY, bounds.maxY) };
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

  function layoutStageSurface(attempt = 0) {
    const viewportRect = elements.stageViewport.getBoundingClientRect();
    if (viewportRect.width <= 0 || viewportRect.height <= 0) return;
    const viewportWidth = elements.stageViewport.clientWidth || viewportRect.width;
    const viewportHeight = elements.stageViewport.clientHeight || viewportRect.height;
    const edit = state.stageSizeEdit;
    const extentWidthMultiplier = edit ? Math.max(state.stageWidth, edit.originalWidth) : state.stageWidth;
    const extentDepthMultiplier = edit ? Math.max(state.stageDepth, edit.originalDepth) : state.stageDepth;
    const fitScale = 1 / Math.max(extentWidthMultiplier, extentDepthMultiplier);
    const displayScale = fitScale * state.stageZoom;
    const width = viewportWidth * state.stageWidth * displayScale;
    const height = viewportHeight * state.stageDepth * displayScale;
    const extentWidth = viewportWidth * extentWidthMultiplier * displayScale;
    const extentHeight = viewportHeight * extentDepthMultiplier * displayScale;
    const surfaceWidth = Math.max(viewportWidth, extentWidth);
    const surfaceHeight = Math.max(viewportHeight, extentHeight);
    const extentLeft = (surfaceWidth - extentWidth) / 2;
    const extentTop = (surfaceHeight - extentHeight) / 2;
    const stageLeft = extentLeft + (extentWidth - width) / 2;
    const stageTop = extentTop + (state.stageOrientation === "front-top" ? 0 : extentHeight - height);
    elements.stageSurfaceExtent.style.width = `${surfaceWidth}px`;
    elements.stageSurfaceExtent.style.height = `${surfaceHeight}px`;
    elements.stage.style.width = `${width}px`;
    elements.stage.style.height = `${height}px`;
    elements.stage.style.left = `${stageLeft}px`;
    elements.stage.style.top = `${stageTop}px`;
    elements.stage.style.setProperty("--stage-display-scale", displayScale);
    elements.stage.style.setProperty("--stage-grid-column-size", `${10 / state.stageWidth}%`);
    elements.stage.style.setProperty("--stage-grid-row-size", `${10 / state.stageDepth}%`);
    if (edit) {
      const originalWidth = viewportWidth * edit.originalWidth * displayScale;
      const originalHeight = viewportHeight * edit.originalDepth * displayScale;
      elements.stageSizeOriginalOutline.style.width = `${originalWidth}px`;
      elements.stageSizeOriginalOutline.style.height = `${originalHeight}px`;
      elements.stageSizeOriginalOutline.style.left = `${extentLeft + (extentWidth - originalWidth) / 2}px`;
      elements.stageSizeOriginalOutline.style.top = state.stageOrientation === "front-top"
        ? `${extentTop}px`
        : `${extentTop + extentHeight - originalHeight}px`;
    }
    elements.zoomLevel.textContent = `${Math.round(state.stageZoom * 100)}%`;
    elements.zoomOutButton.disabled = state.stageZoom <= MIN_STAGE_ZOOM;
    elements.zoomInButton.disabled = state.stageZoom >= MAX_STAGE_ZOOM;
    if (
      attempt < 3 &&
      (Math.abs(elements.stageViewport.clientWidth - viewportWidth) > 0.5 ||
        Math.abs(elements.stageViewport.clientHeight - viewportHeight) > 0.5)
    ) {
      layoutStageSurface(attempt + 1);
    }
  }

  function focusStageFront() {
    elements.stageViewport.scrollLeft = Math.max(0, (elements.stageViewport.scrollWidth - elements.stageViewport.clientWidth) / 2);
    elements.stageViewport.scrollTop = state.stageOrientation === "front-top"
      ? 0
      : Math.max(0, elements.stageViewport.scrollHeight - elements.stageViewport.clientHeight);
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
    if (event.pointerType !== "touch" || state.activeStageTool === "formation-path" || event.target.closest(".dancer-marker")) return;
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

  function clearFormationPathPreview() {
    elements.formationPathLine.setAttribute("points", "");
    elements.formationPathOverlay.classList.add("is-hidden");
    elements.formationPreviewLayer.replaceChildren();
  }

  function setActiveStageTool(tool) {
    const nextTool = state.activeStageTool === tool ? null : tool;
    if (nextTool === "formation-path" && state.selectedDancerIds.length < 2) {
      showToast("Select at least two dancers before drawing a formation path.");
      return;
    }
    state.activeStageTool = nextTool;
    elements.stage.dataset.tool = nextTool || "";
    if (!nextTool) clearFormationPathPreview();
    renderSelectionControls();
    if (nextTool === "formation-path") showToast("Draw a freeform path. Hold Shift while dragging to snap it straight.");
  }

  function createFormationPathPlan(rawPoints, options = {}) {
    const sourcePoints = options.forceStraight && rawPoints.length > 1
      ? [rawPoints[0], rawPoints.at(-1)]
      : rawPoints;
    const path = prepareFormationPath(sourcePoints, { straightThreshold: options.forceStraight ? 2 : 0 });
    const selectedDancers = getSelectedDancers();
    if (path.length < 2 || selectedDancers.length < 2) return null;
    const length = getPolylineLength(path);
    const spacing = length / (selectedDancers.length - 1);
    const sampledPositions = samplePolyline(path, selectedDancers.length);
    if (sampledPositions.length !== selectedDancers.length) return null;
    const currentPositions = selectedDancers.map((dancer) => {
      return stageToDisplayPosition(getPositionAtTime(dancer.keyframes, state.currentTime), state.stageOrientation);
    });
    const orderedIndices = orderPositionsAlongPath(currentPositions, path);
    return {
      path,
      spacing,
      entries: orderedIndices.map((dancerIndex, pathIndex) => ({
        dancerId: selectedDancers[dancerIndex].id,
        ...sampledPositions[pathIndex],
      })),
    };
  }

  function renderFormationPathPlan(plan) {
    if (!plan) {
      clearFormationPathPreview();
      return;
    }
    elements.formationPathLine.setAttribute("points", plan.path.map((point) => `${point.x},${point.y}`).join(" "));
    elements.formationPathOverlay.classList.remove("is-hidden");
    const dancerMap = new Map(state.dancers.map((dancer) => [dancer.id, dancer]));
    const previews = plan.entries.map((entry) => {
      const dancer = dancerMap.get(entry.dancerId);
      const preview = document.createElement("span");
      preview.className = "formation-preview-marker";
      preview.style.left = `${entry.x}%`;
      preview.style.top = `${entry.y}%`;
      preview.style.setProperty("--marker-color", dancer?.color || "#7156d9");
      preview.textContent = dancer ? getDancerMarkerLabel(dancer.name, dancer.number) : "";
      return preview;
    });
    elements.formationPreviewLayer.replaceChildren(...previews);
  }

  function startFormationPath(event) {
    if (state.activeStageTool !== "formation-path" || event.button !== 0) return;
    event.preventDefault();
    pausePlayback();
    const pointerStart = { x: event.clientX, y: event.clientY };
    const rawPoints = [displayPositionFromPointer(event)];
    let didMove = false;
    let latestPlan = null;
    elements.stage.setPointerCapture(event.pointerId);

    function move(moveEvent) {
      if (!didMove) {
        didMove = hasPointerMoved(pointerStart, { x: moveEvent.clientX, y: moveEvent.clientY });
        if (!didMove) return;
      }
      const point = displayPositionFromPointer(moveEvent);
      const previous = rawPoints.at(-1);
      if (Math.hypot(point.x - previous.x, point.y - previous.y) < 0.45) return;
      if (rawPoints.length < 500) rawPoints.push(point);
      latestPlan = createFormationPathPlan(rawPoints, { forceStraight: moveEvent.shiftKey });
      renderFormationPathPlan(latestPlan);
    }

    function cleanup(finishEvent) {
      elements.stage.removeEventListener("pointermove", move);
      elements.stage.removeEventListener("pointerup", finish);
      elements.stage.removeEventListener("pointercancel", cancel);
      if (elements.stage.hasPointerCapture(finishEvent.pointerId)) elements.stage.releasePointerCapture(finishEvent.pointerId);
    }

    function finish(finishEvent) {
      cleanup(finishEvent);
      if (!didMove || !latestPlan) {
        clearFormationPathPreview();
        showToast("Draw a longer path before releasing.");
        return;
      }
      if (latestPlan.spacing < 2.5) {
        clearFormationPathPreview();
        showToast("That path is too short to space the selected dancers safely.");
        return;
      }
      const positions = latestPlan.entries.map((entry) => ({
        dancerId: entry.dancerId,
        ...displayToStagePosition(entry, state.stageOrientation),
      }));
      recordGroupPositions(positions, { label: `align ${positions.length} dancers to path` });
      clearFormationPathPreview();
    }

    function cancel(cancelEvent) {
      cleanup(cancelEvent);
      clearFormationPathPreview();
    }

    elements.stage.addEventListener("pointermove", move);
    elements.stage.addEventListener("pointerup", finish);
    elements.stage.addEventListener("pointercancel", cancel);
  }

  function startSelectionMarquee(event) {
    if (
      state.activeStageTool ||
      event.button !== 0 ||
      event.pointerType === "touch" ||
      event.target.closest(".dancer-marker")
    ) return;
    event.preventDefault();
    const pointerStart = { x: event.clientX, y: event.clientY };
    const start = displayPositionFromPointer(event, { clampToStage: false });
    const addsToSelection = event.shiftKey || event.ctrlKey || event.metaKey;
    let didMove = false;
    let latest = start;
    elements.stage.setPointerCapture(event.pointerId);

    function renderMarquee() {
      const left = clamp(Math.min(start.x, latest.x), 0, 100);
      const top = clamp(Math.min(start.y, latest.y), 0, 100);
      const right = clamp(Math.max(start.x, latest.x), 0, 100);
      const bottom = clamp(Math.max(start.y, latest.y), 0, 100);
      elements.selectionMarquee.style.left = `${left}%`;
      elements.selectionMarquee.style.top = `${top}%`;
      elements.selectionMarquee.style.width = `${right - left}%`;
      elements.selectionMarquee.style.height = `${bottom - top}%`;
      elements.selectionMarquee.classList.remove("is-hidden");
    }

    function move(moveEvent) {
      if (!didMove) {
        didMove = hasPointerMoved(pointerStart, { x: moveEvent.clientX, y: moveEvent.clientY });
        if (!didMove) return;
      }
      latest = displayPositionFromPointer(moveEvent, { clampToStage: false });
      renderMarquee();
    }

    function cleanup(finishEvent) {
      elements.selectionMarquee.classList.add("is-hidden");
      elements.stage.removeEventListener("pointermove", move);
      elements.stage.removeEventListener("pointerup", finish);
      elements.stage.removeEventListener("pointercancel", cancel);
      if (elements.stage.hasPointerCapture(finishEvent.pointerId)) elements.stage.releasePointerCapture(finishEvent.pointerId);
    }

    function finish(finishEvent) {
      cleanup(finishEvent);
      if (!didMove) {
        if (!addsToSelection) setSelectedDancerIds([]);
        return;
      }
      const left = Math.min(start.x, latest.x);
      const right = Math.max(start.x, latest.x);
      const top = Math.min(start.y, latest.y);
      const bottom = Math.max(start.y, latest.y);
      const enclosedIds = state.dancers
        .filter((dancer) => {
          const position = stageToDisplayPosition(getPositionAtTime(dancer.keyframes, state.currentTime), state.stageOrientation);
          return position.x >= left && position.x <= right && position.y >= top && position.y <= bottom;
        })
        .map((dancer) => dancer.id);
      const nextIds = addsToSelection ? [...state.selectedDancerIds, ...enclosedIds] : enclosedIds;
      setSelectedDancerIds(nextIds, { primaryDancerId: enclosedIds.at(-1) });
    }

    function cancel(cancelEvent) {
      cleanup(cancelEvent);
    }

    elements.stage.addEventListener("pointermove", move);
    elements.stage.addEventListener("pointerup", finish);
    elements.stage.addEventListener("pointercancel", cancel);
  }

  function startMarkerDrag(event) {
    if (event.button !== 0 || state.activeStageTool === "formation-path") return;
    if (state.stageSizeEdit || state.holdEdit) {
      requireFinishedTransitionEdit();
      return;
    }
    event.preventDefault();
    const marker = event.currentTarget;
    const dancerId = marker.dataset.dancerId;
    const usesSelectionModifier = event.shiftKey || event.ctrlKey || event.metaKey;
    const usesTouchSelection = event.pointerType === "touch";
    const wasSelected = state.selectedDancerIds.includes(dancerId);
    const selectionBeforePointerDown = [...state.selectedDancerIds];

    if (usesSelectionModifier) {
      selectDancer(dancerId, { toggle: true });
      return;
    }

    pausePlayback();
    if (!wasSelected) selectDancer(dancerId);
    const selectedDancers = getSelectedDancers();
    const startingDisplayPositions = selectedDancers.map((dancer) => {
      const position = getPositionAtTime(dancer.keyframes, state.currentTime);
      return { dancerId: dancer.id, ...stageToDisplayPosition(position, state.stageOrientation) };
    });
    const draggedMarkers = selectedDancers
      .map((dancer) => state.markerElements.get(dancer.id))
      .filter(Boolean);
    draggedMarkers.forEach((selectedMarker) => selectedMarker.classList.add("is-dragging"));
    marker.setPointerCapture(event.pointerId);

    const pointerStart = { x: event.clientX, y: event.clientY };
    const pointerStartPosition = displayPositionFromPointer(event);
    let didMove = false;
    let latestDisplayPositions = startingDisplayPositions.map((position) => ({ ...position }));

    function move(moveEvent) {
      if (!didMove) {
        didMove = hasPointerMoved(pointerStart, { x: moveEvent.clientX, y: moveEvent.clientY });
        if (!didMove) return;
      }
      const pointerPosition = displayPositionFromPointer(moveEvent);
      const movedPositions = applyGroupDelta(startingDisplayPositions, {
        x: pointerPosition.x - pointerStartPosition.x,
        y: pointerPosition.y - pointerStartPosition.y,
      }, getStageBoundsForDimensions({ width: state.stageWidth, depth: state.stageDepth }));
      latestDisplayPositions = startingDisplayPositions.map((position, index) => ({
        dancerId: position.dancerId,
        ...movedPositions[index],
      }));
      latestDisplayPositions.forEach((position) => {
        const selectedMarker = state.markerElements.get(position.dancerId);
        if (!selectedMarker) return;
        selectedMarker.style.left = `${position.x}%`;
        selectedMarker.style.top = `${position.y}%`;
      });
    }

    function finish(finishEvent) {
      draggedMarkers.forEach((selectedMarker) => selectedMarker.classList.remove("is-dragging"));
      marker.removeEventListener("pointermove", move);
      marker.removeEventListener("pointerup", finish);
      marker.removeEventListener("pointercancel", cancel);
      if (marker.hasPointerCapture(finishEvent.pointerId)) marker.releasePointerCapture(finishEvent.pointerId);
      if (didMove) {
        recordGroupPositions(latestDisplayPositions.map((position) => ({
          dancerId: position.dancerId,
          ...displayToStagePosition(position, state.stageOrientation),
        })));
      } else if (usesTouchSelection) {
        if (wasSelected) selectDancer(dancerId, { toggle: true });
        else setSelectedDancerIds([...selectionBeforePointerDown, dancerId], { primaryDancerId: dancerId });
      } else if (!usesTouchSelection && state.selectedDancerIds.length > 1) {
        selectDancer(dancerId);
      } else {
        renderMarkerPositions();
      }
    }

    function cancel(cancelEvent) {
      draggedMarkers.forEach((selectedMarker) => selectedMarker.classList.remove("is-dragging"));
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
    if (state.stageSizeEdit || state.holdEdit) {
      requireFinishedTransitionEdit();
      return;
    }
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
    if (!state.selectedDancerIds.includes(dancerId)) selectDancer(dancerId);
    const selectedDancers = getSelectedDancers();
    const displayedPositions = selectedDancers.map((dancer) => ({
      dancerId: dancer.id,
      ...stageToDisplayPosition(getPositionAtTime(dancer.keyframes, state.currentTime), state.stageOrientation),
    }));
    const step = event.shiftKey ? 5 : 1;
    const movedPositions = applyGroupDelta(displayedPositions, {
      x: direction[0] * step,
      y: direction[1] * step,
    }, getStageBoundsForDimensions({ width: state.stageWidth, depth: state.stageDepth }));
    recordGroupPositions(displayedPositions.map((position, index) => ({
      dancerId: position.dancerId,
      ...displayToStagePosition(movedPositions[index], state.stageOrientation),
    })));
  }

  function recordGroupPositions(positionEntries, options = {}) {
    const entries = Array.isArray(positionEntries) ? positionEntries : [];
    if (state.stageSizeEdit || state.holdEdit) {
      requireFinishedTransitionEdit();
      return false;
    }
    if (state.transitionEdit) return previewTransitionPositions(entries, options);
    const entryMap = new Map(entries.map((entry) => [entry.dancerId, entry]));
    const affectedDancers = state.dancers.filter((dancer) => entryMap.has(dancer.id));
    if (affectedDancers.length === 0) return false;
    const relocatedResumeDancer = affectedDancers.find((dancer) => {
      const resume = getHoldIntervals(dancer.keyframes).find((interval) => (
        interval.end !== null && Math.abs(interval.end - state.currentTime) <= TIME_EPSILON
      ));
      return resume && !positionsMatch(resume, entryMap.get(dancer.id));
    });
    if (relocatedResumeDancer) {
      showToast("Resume starts movement here. Edit the hold timing, or move later to set the destination.");
      renderMarkerPositions();
      return false;
    }
    if (options.allowDuringHold !== true && affectedDancers.some((dancer) => isDancerHolding(dancer))) {
      showToast("End the active hold before moving the held dancer or group.");
      renderMarkerPositions();
      return false;
    }
    const label = options.label || (affectedDancers.length === 1 ? `move ${affectedDancers[0].name}` : `move ${affectedDancers.length} dancers`);
    const changed = commitDocumentEdit(label, () => {
      affectedDancers.forEach((dancer) => {
        const position = entryMap.get(dancer.id);
        dancer.keyframes = upsertPositionKeyframe(dancer.keyframes, state.currentTime, position);
      });
    });
    if (changed) {
      const subject = affectedDancers.length === 1 ? affectedDancers[0].name : `${affectedDancers.length} dancers`;
      showToast(`${subject} recorded at ${formatTime(state.currentTime)}.`);
    }
    return changed;
  }

  function toggleSelectedHold() {
    const selectedDancers = getSelectedDancers();
    if (selectedDancers.length === 0) return;
    pausePlayback();
    const holdStates = selectedDancers.map((dancer) => getHoldStateAtTime(dancer.keyframes, state.currentTime));
    const shouldEndHold = holdStates.every((holdState) => holdState.active);
    const changed = commitDocumentEdit(
      shouldEndHold ? `end hold for ${selectedDancers.length} dancer${selectedDancers.length === 1 ? "" : "s"}` : `hold ${selectedDancers.length} dancer${selectedDancers.length === 1 ? "" : "s"}`,
      () => {
        selectedDancers.forEach((dancer, index) => {
          const holdState = holdStates[index];
          if (!shouldEndHold && holdState.active) return;
          const position = getPositionAtTime(dancer.keyframes, state.currentTime);
          const frame = {
            time: state.currentTime,
            x: position.x,
            y: position.y,
          };
          if (!shouldEndHold) frame.hold = true;
          else if (Math.abs(holdState.event.time - state.currentTime) > TIME_EPSILON) frame.hold = false;
          dancer.keyframes = upsertKeyframe(dancer.keyframes, frame);
        });
      },
    );
    if (!changed) return;
    showToast(shouldEndHold
      ? `Hold ended at ${formatTime(state.currentTime)}. Movement can resume.`
      : `Position held from ${formatTime(state.currentTime)}. Move later and choose End hold to resume.`);
  }

  function recordPosition(dancerId, position) {
    return recordGroupPositions([{ dancerId, ...position }]);
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

  function renameDancer(dancerId, value) {
    const dancer = state.dancers.find((item) => item.id === dancerId);
    if (!dancer) return "";
    const nextName = normalizeDancerName(value, `Dancer ${dancer.number}`);
    const previousName = dancer.name;
    const changed = commitDocumentEdit(`rename ${previousName}`, () => {
      dancer.name = nextName;
    });
    if (changed) showToast(`${previousName} renamed to ${nextName}.`);
    return nextName;
  }

  function renderDancerList() {
    elements.dancerList.replaceChildren();
    elements.dancerCount.textContent = `${state.dancers.length} / ${MAX_DANCERS}`;
    elements.addDancerButton.disabled = state.dancers.length >= MAX_DANCERS;
    const selectedIds = new Set(state.selectedDancerIds);

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
      row.classList.toggle("is-selected", selectedIds.has(dancer.id));
      row.classList.toggle("is-primary", dancer.id === state.selectedDancerId);

      const main = document.createElement("div");
      main.className = "dancer-row-main";

      const selectButton = document.createElement("button");
      selectButton.type = "button";
      selectButton.className = "dancer-select-button";
      selectButton.dataset.dancerId = dancer.id;
      selectButton.setAttribute("aria-pressed", String(selectedIds.has(dancer.id)));
      selectButton.setAttribute("aria-label", `Select ${dancer.name}`);
      selectButton.addEventListener("click", (event) => selectDancer(dancer.id, {
        restoreListFocus: true,
        toggle: event.shiftKey || event.ctrlKey || event.metaKey,
      }));

      const swatch = document.createElement("span");
      swatch.className = "dancer-swatch";
      swatch.style.setProperty("--dancer-color", dancer.color);
      swatch.textContent = getDancerMarkerLabel(dancer.name, dancer.number);

      const copy = document.createElement("label");
      copy.className = "dancer-row-copy";
      const name = document.createElement("input");
      name.className = "dancer-name-inline";
      name.type = "text";
      name.maxLength = 80;
      name.autocomplete = "off";
      name.value = dancer.name;
      name.disabled = isDocumentEditOpen();
      name.setAttribute("aria-label", `Name for dancer ${dancer.number}`);
      name.title = "Edit dancer name";
      name.addEventListener("input", (event) => {
        const previewLabel = getDancerMarkerLabel(event.currentTarget.value, dancer.number);
        swatch.textContent = previewLabel;
        const marker = state.markerElements.get(dancer.id);
        if (marker) marker.textContent = previewLabel;
      });
      name.addEventListener("change", (event) => renameDancer(dancer.id, event.currentTarget.value));
      name.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        } else if (event.key === "Escape") {
          event.preventDefault();
          event.currentTarget.value = dancer.name;
          swatch.textContent = getDancerMarkerLabel(dancer.name, dancer.number);
          const marker = state.markerElements.get(dancer.id);
          if (marker) marker.textContent = getDancerMarkerLabel(dancer.name, dancer.number);
          event.currentTarget.blur();
        }
      });
      const frames = document.createElement("small");
      frames.textContent = `${dancer.keyframes.length} position${dancer.keyframes.length === 1 ? "" : "s"}`;
      copy.append(name, frames);
      selectButton.append(swatch);
      main.append(selectButton, copy);

      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.className = "remove-dancer";
      removeButton.textContent = "×";
      removeButton.disabled = isDocumentEditOpen();
      removeButton.setAttribute("aria-label", `Remove ${dancer.name}`);
      removeButton.addEventListener("click", () => removeDancer(dancer.id));

      row.append(main, removeButton);
      elements.dancerList.append(row);
    });
  }

  function renderSelectionControls() {
    const count = state.selectedDancerIds.length;
    if (count < 2 && state.activeStageTool === "formation-path") {
      state.activeStageTool = null;
      elements.stage.dataset.tool = "";
      clearFormationPathPreview();
    }
    elements.selectionCount.textContent = `${count} selected`;
    elements.selectAllButton.disabled = state.dancers.length === 0 || count === state.dancers.length;
    elements.clearSelectionButton.disabled = count === 0;
    elements.formationPathButton.disabled = count < 2;
    elements.formationPathButton.setAttribute("aria-pressed", String(state.activeStageTool === "formation-path"));
    elements.formationPathButton.classList.toggle("is-active", state.activeStageTool === "formation-path");
    updateHoldControl();
  }

  function updateHoldControl() {
    const selectedDancers = getSelectedDancers();
    const holdingCount = selectedDancers.filter((dancer) => isDancerHolding(dancer)).length;
    const allHolding = selectedDancers.length > 0 && holdingCount === selectedDancers.length;
    elements.holdPositionButton.disabled = selectedDancers.length === 0;
    elements.holdPositionButton.setAttribute("aria-pressed", String(allHolding));
    elements.holdPositionButton.classList.toggle("is-active", allHolding);
    elements.holdPositionLabel.textContent = allHolding
      ? "End hold"
      : holdingCount > 0
        ? "Hold selected"
        : "Hold position";
    elements.holdPositionButton.title = allHolding
      ? "Record the end of this hold at the current time (H)"
      : "Freeze selected dancers at the current time (H)";
    const singleHeldDancer = selectedDancers.length === 1 && allHolding;
    const singleResume = selectedDancers.length === 1 && getHoldIntervals(selectedDancers[0].keyframes).some((interval) => (
      interval.end !== null && Math.abs(interval.end - state.currentTime) <= TIME_EPSILON
    ));
    elements.xInput.disabled = singleHeldDancer || singleResume;
    elements.yInput.disabled = singleHeldDancer || singleResume;
    elements.recordCoordinatesButton.disabled = singleHeldDancer || singleResume;
    elements.coordinateEditor.title = singleHeldDancer
      ? "End this hold before changing the dancer's position"
      : singleResume
        ? "Resume starts movement here. Edit the hold timing or move later to set the destination"
        : "";
  }

  function updateTimelineControls() {
    const viewport = getTimelineViewport();
    state.timelineViewport = viewport;
    const span = viewport.end - viewport.start;
    const zoom = state.duration / span;
    const isFull = span >= state.duration - TIME_EPSILON;
    const isMaximum = span <= getMinimumTimelineSpan() + TIME_EPSILON;
    elements.timeline.min = viewport.start;
    elements.timeline.max = viewport.end;
    elements.timeline.value = clamp(state.currentTime, viewport.start, viewport.end);
    elements.timelineZoomLevel.value = zoom < 10 ? `${Math.round(zoom * 10) / 10}×` : `${Math.round(zoom)}×`;
    elements.timelineWindowLabel.textContent = isFull
      ? "Full timeline"
      : `${formatTime(viewport.start)}–${formatTime(viewport.end)}`;
    elements.timelineZoomOutButton.disabled = isFull;
    elements.timelineFitButton.disabled = isFull;
    elements.timelineZoomInButton.disabled = isMaximum;
  }

  function setTimelineViewport(nextViewport) {
    const current = getTimelineViewport();
    const next = normalizeTimelineViewport(nextViewport, state.duration, getMinimumTimelineSpan());
    if (timelineViewportsMatch(current, next)) {
      updateTimelineControls();
      return false;
    }
    state.timelineViewport = next;
    renderSelection();
    updateTimelineControls();
    updateKeyframeActiveState(true);
    return true;
  }

  function zoomTimelineAt(anchorTime, factor) {
    setTimelineViewport(zoomTimelineViewport(
      getTimelineViewport(),
      anchorTime,
      factor,
      state.duration,
      getMinimumTimelineSpan(),
    ));
  }

  function zoomTimelineFromPlayhead(factor) {
    const viewport = getTimelineViewport();
    const anchor = clamp(state.currentTime, viewport.start, viewport.end);
    zoomTimelineAt(anchor, factor);
  }

  function renderHoldTrack(dancer) {
    const intervals = getHoldIntervals(dancer.keyframes);
    const viewport = getTimelineViewport();
    const ranges = intervals.flatMap((interval) => {
      const end = interval.end ?? state.duration;
      const visibleStart = Math.max(interval.start, viewport.start);
      const visibleEnd = Math.min(end, viewport.end);
      if (visibleEnd < visibleStart - TIME_EPSILON) return [];
      const range = document.createElement("button");
      range.type = "button";
      range.className = "hold-range";
      range.style.left = `${timeToTimelinePercent(visibleStart, viewport, state.duration, getMinimumTimelineSpan())}%`;
      range.style.width = `${Math.max(0, timeToTimelinePercent(visibleEnd, viewport, state.duration, getMinimumTimelineSpan()) - timeToTimelinePercent(visibleStart, viewport, state.duration, getMinimumTimelineSpan()))}%`;
      range.classList.toggle("is-clipped-start", interval.start < viewport.start - TIME_EPSILON);
      range.classList.toggle("is-clipped-end", end > viewport.end + TIME_EPSILON);
      range.classList.toggle("is-editing", Boolean(
        state.holdEdit?.dancerId === dancer.id &&
        Math.abs(state.holdEdit.originalStart - interval.start) <= TIME_EPSILON
      ));
      range.dataset.dancerId = dancer.id;
      range.dataset.holdStart = interval.start;
      range.dataset.holdEnd = interval.end ?? "";
      range.title = interval.end === null
        ? `Edit hold from ${formatTime(interval.start)} onward`
        : `Edit hold from ${formatTime(interval.start)} to ${formatTime(interval.end)}`;
      range.setAttribute("aria-label", range.title);
      range.addEventListener("click", () => startHoldEdit(dancer.id, interval));
      return [range];
    });
    elements.holdTrack.replaceChildren(...ranges);
    updateHoldTimelineActiveState();
    return intervals;
  }

  function updateHoldTimelineActiveState() {
    elements.holdTrack.querySelectorAll(".hold-range").forEach((range) => {
      const start = Number(range.dataset.holdStart);
      const end = range.dataset.holdEnd === "" ? state.duration : Number(range.dataset.holdEnd);
      range.classList.toggle("is-current", state.currentTime >= start - TIME_EPSILON && state.currentTime < end - TIME_EPSILON);
    });
  }

  function renderSelection() {
    const dancer = getSelectedDancer();
    const selectedDancers = getSelectedDancers();
    elements.keyframeList.replaceChildren();
    elements.keyframeTrack.replaceChildren();
    elements.holdTrack.replaceChildren();

    if (!dancer) {
      elements.selectionText.textContent = "No dancer selected";
      elements.coordinateEditor.classList.add("is-hidden");
      return;
    }

    const holdIntervals = renderHoldTrack(dancer);

    if (selectedDancers.length > 1) {
      elements.selectionText.textContent = `${selectedDancers.length} dancers selected · drag any selected dancer to move the group`;
      elements.coordinateEditor.classList.add("is-hidden");
      return;
    }

    const currentPosition = getPositionAtTime(dancer.keyframes, state.currentTime);
    const displayedCurrentPosition = stageToDisplayPosition(currentPosition, state.stageOrientation);
    elements.selectionText.textContent = `${dancer.name} · ${dancer.keyframes.length} recorded position${dancer.keyframes.length === 1 ? "" : "s"}`;
    elements.coordinateEditor.classList.remove("is-hidden");
    elements.xInput.value = displayedCurrentPosition.x.toFixed(1);
    elements.yInput.value = displayedCurrentPosition.y.toFixed(1);
    const holdStartTimes = new Set(holdIntervals.map((interval) => interval.start.toFixed(3)));
    const holdEndTimes = new Set(holdIntervals.filter((interval) => interval.end !== null).map((interval) => interval.end.toFixed(3)));
    normalizeKeyframes(dancer.keyframes).forEach((frame) => {
      const frameIdentity = frame.time.toFixed(3);
      const holdEvent = holdStartTimes.has(frameIdentity) ? "start" : holdEndTimes.has(frameIdentity) ? "end" : null;
      const holdInterval = holdEvent === "start"
        ? holdIntervals.find((interval) => Math.abs(interval.start - frame.time) <= TIME_EPSILON)
        : holdEvent === "end"
          ? holdIntervals.find((interval) => interval.end !== null && Math.abs(interval.end - frame.time) <= TIME_EPSILON)
          : null;
      const displayedFrame = stageToDisplayPosition(frame, state.stageOrientation);
      const framePercent = timeToTimelinePercent(frame.time, getTimelineViewport(), state.duration, getMinimumTimelineSpan());
      if (framePercent >= -TIME_EPSILON && framePercent <= 100 + TIME_EPSILON) {
        const dot = document.createElement("button");
        dot.type = "button";
        dot.className = "keyframe-dot";
        if (holdEvent) dot.classList.add(`is-hold-${holdEvent}`);
        dot.style.left = `${clamp(framePercent, 0, 100)}%`;
        dot.dataset.keyframeTime = frame.time;
        dot.setAttribute("aria-label", `Edit ${holdEvent === "start" ? "hold start" : holdEvent === "end" ? "hold end" : `${dancer.name} transition`} at ${formatTime(frame.time)}`);
        dot.title = holdEvent ? `Edit hold timing at ${formatTime(frame.time)}` : `Edit transition at ${formatTime(frame.time)}`;
        dot.addEventListener("click", () => {
          if (holdInterval) startHoldEdit(dancer.id, holdInterval, { focus: holdEvent });
          else startTransitionEdit(dancer.id, frame.time);
        });
        elements.keyframeTrack.append(dot);
      }

      const chip = document.createElement("span");
      chip.className = "keyframe-chip";
      if (holdEvent) chip.classList.add("is-hold-event", `is-hold-${holdEvent}`);
      chip.title = `x ${displayedFrame.x.toFixed(1)}, y ${displayedFrame.y.toFixed(1)}`;
      chip.dataset.keyframeTime = frame.time;
      chip.dataset.keyframeIdentity = `${dancer.id}:${frame.time.toFixed(3)}`;

      const jump = document.createElement("button");
      jump.type = "button";
      jump.className = "keyframe-jump";
      jump.dataset.dancerId = dancer.id;
      jump.dataset.keyframeIdentity = chip.dataset.keyframeIdentity;
      jump.textContent = `${holdEvent === "start" ? "Hold " : holdEvent === "end" ? "Resume " : ""}${formatTime(frame.time)}`;
      jump.setAttribute("aria-label", `Edit ${holdEvent === "start" ? "hold start" : holdEvent === "end" ? "hold end" : `${dancer.name} transition`} at ${formatTime(frame.time)}`);
      jump.addEventListener("click", () => {
        if (holdInterval) startHoldEdit(dancer.id, holdInterval, { focus: holdEvent });
        else startTransitionEdit(dancer.id, frame.time);
      });

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "remove-keyframe";
      remove.dataset.dancerId = dancer.id;
      remove.dataset.keyframeIdentity = chip.dataset.keyframeIdentity;
      remove.textContent = "×";
      remove.disabled = dancer.keyframes.length <= 1 || isDocumentEditOpen();
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
      if (item.classList.contains("keyframe-dot")) {
        if (isCurrent) item.setAttribute("aria-current", "true");
        else item.removeAttribute("aria-current");
      }
      if (item.classList.contains("keyframe-chip")) {
        const jump = item.querySelector(".keyframe-jump");
        if (isCurrent) jump?.setAttribute("aria-current", "true");
        else jump?.removeAttribute("aria-current");
      }
    });
  }

  function setCurrentTime(nextTime, options = {}) {
    state.currentTime = clamp(nextTime, 0, state.duration);
    if (options.ensureVisible !== false) {
      const currentViewport = getTimelineViewport();
      const nextViewport = ensureTimeInTimelineViewport(
        currentViewport,
        state.currentTime,
        state.duration,
        getMinimumTimelineSpan(),
      );
      if (!timelineViewportsMatch(currentViewport, nextViewport)) {
        state.timelineViewport = nextViewport;
        renderSelection();
      }
    }
    updateTimelineControls();
    elements.timeline.value = state.currentTime;
    elements.currentTime.textContent = formatTime(state.currentTime);
    if (document.activeElement !== elements.timeInput) {
      elements.timeInput.value = Math.round(state.currentTime * 1000) / 1000;
    }
    renderMarkerPositions();
    updateHoldControl();
    updateHoldTimelineActiveState();
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
    if (isDocumentEditOpen()) renderTransitionEditMode();
  }

  async function startPlayback() {
    if (!requireFinishedTransitionEdit()) return;
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

    const previousDuration = state.duration;
    const previousViewport = getTimelineViewport();
    const wasFullTimeline = previousViewport.start <= TIME_EPSILON &&
      previousViewport.end >= previousDuration - TIME_EPSILON;
    state.duration = requested;
    state.currentTime = clamp(state.currentTime, 0, state.duration);
    state.timelineViewport = wasFullTimeline
      ? { start: 0, end: state.duration }
      : normalizeTimelineViewport(previousViewport, state.duration, getMinimumTimelineSpan());
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
    state.audioFile = file;
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
    state.audioFile = null;
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
    state.videoFile = file;
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
    state.videoFile = null;
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
      version: 4,
      projectTitle: normalizeProjectTitle(state.projectTitle),
      duration: state.duration,
      dancerCounter: state.dancerCounter,
      stageOrientation: state.stageOrientation,
      stageWidth: state.stageWidth,
      stageDepth: state.stageDepth,
      audioVolume: state.audioVolume,
      videoVolume: state.videoVolume,
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
      selectedDancerIds: options.selectedDancerIds,
    });
    if (options.clearHistory) state.history = createHistory(HISTORY_LIMIT);
    renderAll();
    setCurrentTime(state.currentTime);
    updateHistoryControls();
    if (options.save !== false) queueSave();
  }

  function getSafeProjectFileName(projectTitle = state.projectTitle) {
    return normalizeProjectTitle(projectTitle)
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase() || "choreography";
  }

  function downloadBlob(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function exportProject() {
    if (!requireFinishedTransitionEdit()) return;
    const project = serializeProject();
    const payload = JSON.stringify(project, null, 2);
    downloadBlob(new Blob([payload], { type: "application/json" }), `${getSafeProjectFileName(project.projectTitle)}.formation.json`);
    showToast("Plan exported. Audio and video files are not included.");
  }

  function getMediaPackageEntry(file, kind) {
    const extensionMatch = String(file?.name || "").toLowerCase().match(/\.([a-z0-9]{1,8})$/);
    const requestedExtension = extensionMatch?.[1];
    const allowedExtensions = kind === "audio" ? ["mp3", "wav"] : ["mp4", "webm", "mov"];
    const fallbackExtension = kind === "audio"
      ? file?.type === "audio/mpeg" ? "mp3" : "wav"
      : file?.type === "video/webm" ? "webm" : file?.type === "video/quicktime" ? "mov" : "mp4";
    const extension = allowedExtensions.includes(requestedExtension) ? requestedExtension : fallbackExtension;
    return `media/${kind}.${extension}`;
  }

  async function exportCompleteProject() {
    if (!requireFinishedTransitionEdit()) return;
    const previousText = elements.exportPackageButton.textContent;
    elements.exportPackageButton.disabled = true;
    elements.exportPackageButton.textContent = "Packing…";
    try {
      const project = serializeProject();
      const media = { audio: null, video: null };
      const entries = [{ name: "choreography.json", data: JSON.stringify(project, null, 2) }];
      for (const [kind, file] of [["audio", state.audioFile], ["video", state.videoFile]]) {
        if (!file) continue;
        const entry = getMediaPackageEntry(file, kind);
        media[kind] = {
          entry,
          fileName: String(file.name || `${kind}-track`).slice(0, 255),
          type: String(file.type || "application/octet-stream").slice(0, 120),
          size: file.size,
        };
        entries.push({ name: entry, data: file });
      }
      const manifest = {
        format: "formation-studio-package",
        version: 1,
        createdAt: new Date().toISOString(),
        projectEntry: "choreography.json",
        media,
      };
      entries.unshift({ name: "manifest.json", data: JSON.stringify(manifest, null, 2) });
      const archive = await createStoredZip(entries, { maximumBytes: MAX_COMPLETE_PACKAGE_BYTES });
      downloadBlob(archive, `${getSafeProjectFileName(project.projectTitle)}.formation`);
      const mediaDescription = state.audioFile || state.videoFile ? " with local media" : "";
      showToast(`Complete project exported${mediaDescription}.`);
    } catch (error) {
      showToast(error?.message?.includes("size limit")
        ? "The complete project is larger than the 1 GB web export limit."
        : "The complete project could not be created.");
    } finally {
      elements.exportPackageButton.disabled = false;
      elements.exportPackageButton.textContent = previousText;
    }
  }

  function normalizeImportedMediaName(value, fallback) {
    const normalized = String(value || "")
      .replace(/[\\/\u0000-\u001f\u007f]+/g, "-")
      .trim()
      .slice(0, 180);
    return normalized || fallback;
  }

  function isValidPackageMediaDescriptor(descriptor, kind, entries) {
    if (descriptor === null) return true;
    if (!descriptor || typeof descriptor !== "object") return false;
    const validEntry = typeof descriptor.entry === "string" && (
      kind === "audio"
        ? /^media\/audio\.(mp3|wav)$/.test(descriptor.entry)
        : /^media\/video\.(mp4|webm|mov)$/.test(descriptor.entry)
    );
    const entry = validEntry ? entries.get(descriptor.entry) : null;
    if (!entry || Number(descriptor.size) !== entry.size || entry.size > MAX_COMPLETE_PACKAGE_BYTES) return false;
    const fileName = normalizeImportedMediaName(descriptor.fileName, kind);
    const extensionIsValid = kind === "audio" ? /\.(mp3|wav)$/i.test(fileName) : /\.(mp4|webm|mov)$/i.test(fileName);
    const typeIsValid = typeof descriptor.type === "string" && (kind === "audio"
      ? ["audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/wave"].includes(descriptor.type)
      : ["video/mp4", "video/webm", "video/quicktime"].includes(descriptor.type));
    return extensionIsValid || typeIsValid;
  }

  async function importJsonProject(file) {
    if (Number(file.size) > MAX_IMPORT_BYTES) throw new Error("Plan is too large");
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
  }

  async function importCompleteProject(file) {
    if (file.size > MAX_COMPLETE_PACKAGE_BYTES) throw new Error("Package is too large");
    showToast("Checking complete project…");
    const entries = await readStoredZip(file, { maximumBytes: MAX_COMPLETE_PACKAGE_BYTES, maximumEntries: 6 });
    const manifestEntry = entries.get("manifest.json");
    const projectEntry = entries.get("choreography.json");
    if (!manifestEntry || manifestEntry.size > 256 * 1024 || !projectEntry || projectEntry.size > MAX_IMPORT_BYTES) {
      throw new Error("Missing package entries");
    }
    const manifest = JSON.parse(await manifestEntry.blob.text());
    if (
      manifest?.format !== "formation-studio-package" ||
      Number(manifest.version) !== 1 ||
      manifest.projectEntry !== "choreography.json" ||
      !manifest.media ||
      !isValidPackageMediaDescriptor(manifest.media.audio, "audio", entries) ||
      !isValidPackageMediaDescriptor(manifest.media.video, "video", entries)
    ) throw new Error("Invalid package manifest");
    const expectedEntries = new Set(["manifest.json", "choreography.json"]);
    if (manifest.media.audio) expectedEntries.add(manifest.media.audio.entry);
    if (manifest.media.video) expectedEntries.add(manifest.media.video.entry);
    if (entries.size !== expectedEntries.size || [...entries.keys()].some((entryName) => !expectedEntries.has(entryName))) {
      throw new Error("Unexpected package entries");
    }
    const project = JSON.parse(await projectEntry.blob.text());
    if (!isValidProjectData(project, MAX_DANCERS)) throw new Error("Invalid packaged choreography");
    const title = normalizeProjectTitle(project.projectTitle);
    const shouldImport = window.confirm(
      `Open the complete project “${title}” (${project.dancers.length} dancers)? This replaces the current choreography and local media.`,
    );
    if (!shouldImport) return;

    const createMediaFile = (descriptor, fallback) => {
      if (!descriptor) return null;
      const entry = entries.get(descriptor.entry);
      return new File(
        [entry.blob],
        normalizeImportedMediaName(descriptor.fileName, fallback),
        { type: descriptor.type || "application/octet-stream", lastModified: Date.now() },
      );
    };
    const audioFile = createMediaFile(manifest.media.audio, "audio-track");
    const videoFile = createMediaFile(manifest.media.video, "reference-video");
    removeAudio(false);
    removeVideo(false);
    applyProject(project, { clearHistory: true });
    if (audioFile) handleAudioFile(audioFile);
    if (videoFile) handleVideoFile(videoFile);
    showToast("Complete project opened with its saved media.");
  }

  async function importProject(file) {
    if (!file) return;
    if (!requireFinishedTransitionEdit()) return;
    const previousText = elements.importButton.textContent;
    elements.importButton.disabled = true;
    elements.importButton.textContent = "Importing…";
    try {
      const signatureBytes = new Uint8Array(await file.slice(0, 4).arrayBuffer());
      const isZip = signatureBytes.length === 4 && new DataView(signatureBytes.buffer).getUint32(0, true) === 0x04034b50;
      if (isZip || /\.formation$/i.test(file.name)) await importCompleteProject(file);
      else await importJsonProject(file);
    } catch (error) {
      showToast(error?.message === "Package is too large"
        ? "That complete project is larger than the 1 GB import limit."
        : "That file is not a valid Formation Studio project.");
    } finally {
      elements.importInput.value = "";
      elements.importButton.disabled = false;
      elements.importButton.textContent = previousText;
    }
  }

  async function importDesktopProject(descriptor) {
    if (!descriptor?.url || !descriptor?.name) return;
    try {
      const response = await fetch(descriptor.url, { cache: "no-store" });
      if (!response.ok) throw new Error("Desktop project could not be opened");
      const blob = await response.blob();
      await importProject(new File([blob], descriptor.name, {
        type: descriptor.type || blob.type || "application/octet-stream",
        lastModified: Date.now(),
      }));
    } catch (error) {
      showToast("The selected desktop project could not be opened.");
    }
  }

  async function handleDesktopCommand(command) {
    if (command === "new") elements.newProjectButton.click();
    else if (command === "undo") elements.undoButton.click();
    else if (command === "redo") elements.redoButton.click();
    else if (command === "export-json") elements.exportButton.click();
    else if (command === "export-complete") elements.exportPackageButton.click();
    else if (command === "open") {
      const descriptor = await window.FormationDesktop?.chooseProject();
      if (descriptor) await importDesktopProject(descriptor);
    }
  }

  function bindDesktopBridge() {
    if (!window.FormationDesktop) return;
    document.documentElement.classList.add("is-desktop-app");
    window.FormationDesktop.onCommand(handleDesktopCommand);
    window.FormationDesktop.onOpenProject(importDesktopProject);
  }

  function setSaveStatus(message, isError = false) {
    elements.saveStatus.textContent = message;
    elements.saveStatus.classList.toggle("is-error", isError);
  }

  function flushSave() {
    clearTimeout(saveTimer);
    saveTimer = null;
    if (isDocumentEditOpen()) {
      setSaveStatus(getDocumentEditSaveMessage());
      return false;
    }
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
    if (isDocumentEditOpen()) {
      setSaveStatus(getDocumentEditSaveMessage());
      return;
    }
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
    updateTimelineControls();
    elements.timeInput.max = state.duration;
    if (document.activeElement !== elements.durationInput) {
      elements.durationInput.value = Math.round(state.duration * 100) / 100;
    }
    elements.durationInput.disabled = state.audioUrl !== null || state.videoUrl !== null;
    elements.volumeInput.value = state.audioVolume;
    elements.videoVolumeInput.value = state.videoVolume;
    elements.audioPlayer.volume = state.audioVolume;
    elements.videoPlayer.volume = state.videoVolume;
    renderDancerList();
    renderSelection();
    renderSelectionControls();
    setCurrentTime(state.currentTime, { syncMedia: false });
    elements.totalTime.textContent = formatTime(state.duration);
    updateHistoryControls();
    renderTransitionEditMode();
    layoutStageSurface();
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

  function handleStageToolShortcut(event) {
    if (event.key !== "Escape" || !state.activeStageTool || isNativeEditingTarget(event.target)) return;
    event.preventDefault();
    setActiveStageTool(state.activeStageTool);
  }

  function handleAppShortcut(event) {
    if (
      event.defaultPrevented ||
      event.isComposing ||
      event.repeat ||
      isNativeEditingTarget(event.target) ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey
    ) return;

    const key = event.key.toLowerCase();
    if (key === "h" && !event.shiftKey) {
      if (isDocumentEditOpen() || elements.holdPositionButton.disabled) return;
      event.preventDefault();
      elements.holdPositionButton.click();
      return;
    }
    if (key === "a" && !event.shiftKey) {
      if (isDocumentEditOpen()) return;
      event.preventDefault();
      setActiveStageTool("formation-path");
      return;
    }
    if (event.key === "+") {
      if (elements.timelineZoomInButton.disabled) return;
      event.preventDefault();
      elements.timelineZoomInButton.click();
      return;
    }
    if (event.key === "-" && !event.shiftKey) {
      if (elements.timelineZoomOutButton.disabled) return;
      event.preventDefault();
      elements.timelineZoomOutButton.click();
      return;
    }
    if (event.key === " " && !event.shiftKey) {
      event.preventDefault();
      elements.playButton.click();
    }
  }

  function bindEvents() {
    elements.addDancerForm.addEventListener("submit", (event) => {
      event.preventDefault();
      addDancer();
    });
    elements.frontTopButton.addEventListener("click", () => setStageOrientation("front-top"));
    elements.frontBottomButton.addEventListener("click", () => setStageOrientation("front-bottom"));
    elements.selectAllButton.addEventListener("click", () => {
      const dancerIds = state.dancers.map((dancer) => dancer.id);
      setSelectedDancerIds(dancerIds, { primaryDancerId: state.selectedDancerId || dancerIds.at(-1) });
    });
    elements.clearSelectionButton.addEventListener("click", () => setSelectedDancerIds([]));
    elements.holdPositionButton.addEventListener("click", toggleSelectedHold);
    elements.applyHoldEditButton.addEventListener("click", applyHoldEdit);
    elements.cancelHoldEditButton.addEventListener("click", cancelHoldEdit);
    elements.stageSizeButton.addEventListener("click", startStageSizeEdit);
    elements.applyStageSizeButton.addEventListener("click", applyStageSizeEdit);
    elements.cancelStageSizeButton.addEventListener("click", cancelStageSizeEdit);
    elements.stageWidthInput.addEventListener("input", previewStageSizeEdit);
    elements.stageDepthInput.addEventListener("input", previewStageSizeEdit);
    elements.stageResizeModeInputs.forEach((input) => input.addEventListener("change", previewStageSizeEdit));
    elements.holdStartInput.addEventListener("input", () => {
      if (state.holdEdit) state.holdEdit.startTouched = true;
      previewHoldEdit();
    });
    elements.holdEndInput.addEventListener("input", () => {
      if (state.holdEdit) state.holdEdit.endTouched = true;
      previewHoldEdit();
    });
    elements.holdStartFromPlayheadButton.addEventListener("click", () => setHoldBoundaryFromPlayhead("start"));
    elements.holdEndFromPlayheadButton.addEventListener("click", () => setHoldBoundaryFromPlayhead("end"));
    elements.formationPathButton.addEventListener("click", () => setActiveStageTool("formation-path"));
    elements.zoomOutButton.addEventListener("click", () => setStageZoom(state.stageZoom - STAGE_ZOOM_STEP));
    elements.zoomResetButton.addEventListener("click", () => setStageZoom(1));
    elements.zoomInButton.addEventListener("click", () => setStageZoom(state.stageZoom + STAGE_ZOOM_STEP));
    elements.timelineZoomOutButton.addEventListener("click", () => zoomTimelineFromPlayhead(1 / TIMELINE_ZOOM_STEP));
    elements.timelineZoomInButton.addEventListener("click", () => zoomTimelineFromPlayhead(TIMELINE_ZOOM_STEP));
    elements.timelineFitButton.addEventListener("click", () => setTimelineViewport({ start: 0, end: state.duration }));
    elements.stageViewport.addEventListener("pointerdown", handleStageTouchPointerDown);
    elements.stageViewport.addEventListener("pointermove", handleStageTouchPointerMove);
    elements.stageViewport.addEventListener("pointerup", finishStageTouchPointer);
    elements.stageViewport.addEventListener("pointercancel", finishStageTouchPointer);
    elements.stageViewport.addEventListener("lostpointercapture", finishStageTouchPointer);
    elements.stage.addEventListener("pointerdown", startSelectionMarquee);
    elements.stage.addEventListener("pointerdown", startFormationPath);
    elements.newProjectButton.addEventListener("click", startNewProject);
    elements.themeToggle.addEventListener("click", toggleTheme);
    elements.undoButton.addEventListener("click", undoDocumentEdit);
    elements.redoButton.addEventListener("click", redoDocumentEdit);
    elements.applyTransitionEditButton.addEventListener("click", applyTransitionEdit);
    elements.cancelTransitionEditButton.addEventListener("click", cancelTransitionEdit);
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
      state.audioVolume = clamp(event.target.value, 0, 1);
      elements.audioPlayer.volume = state.audioVolume;
      queueSave();
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
      state.videoVolume = clamp(event.target.value, 0, 1);
      elements.videoPlayer.volume = state.videoVolume;
      queueSave();
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
    elements.exportPackageButton.addEventListener("click", exportCompleteProject);
    elements.importButton.addEventListener("click", () => elements.importInput.click());
    elements.importInput.addEventListener("change", (event) => importProject(event.target.files[0]));
    window.addEventListener("dragover", (event) => {
      if (Array.from(event.dataTransfer?.items || []).some((item) => item.kind === "file")) event.preventDefault();
    });
    window.addEventListener("drop", (event) => {
      const file = event.dataTransfer?.files?.[0];
      if (!file || !/\.(formation|json)$/i.test(file.name)) return;
      event.preventDefault();
      importProject(file);
    });
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
    window.addEventListener("keydown", handleStageToolShortcut);
    window.addEventListener("keydown", handleAppShortcut);
    window.addEventListener("pagehide", () => {
      syncPendingTitleForExit();
      flushSave();
    });
    window.addEventListener("beforeunload", (event) => {
      if (isTransitionEditDirty() || isHoldEditDirty() || isStageSizeEditDirty()) {
        event.preventDefault();
        event.returnValue = "";
        return;
      }
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
    bindDesktopBridge();
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
