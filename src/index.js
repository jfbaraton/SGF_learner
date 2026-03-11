import './styles.css';
import SGFTreeNavigator from './sgf-tree-navigator';
import GobanRenderer from './goban-renderer';
import { parseVertex } from '@sabaki/sgf';
// import sgfContent from '../eidogo_joseki.sgf';
// import sgfContent from '../handmade_mustknow.sgf';
import sgfContent from '../handmade_mustknow_bookmarked.sgf';

// --- Loading overlay ---
function showLoading() {
  const overlay = document.createElement('div');
  overlay.id = 'loading-overlay';
  overlay.innerHTML = `
    <div class="spinner"></div>
    <div class="text">Parsing SGF…</div>
  `;
  document.body.appendChild(overlay);
}

function hideLoading() {
  const overlay = document.getElementById('loading-overlay');
  if (overlay) overlay.remove();
}

// --- Main Application ---
const SGF_CUSTOM_KEY = 'sgf-explorer-custom-sgf';
const SGF_FILENAME_KEY = 'sgf-explorer-custom-filename';

function init() {
  showLoading();

  // Use setTimeout to allow the loading overlay to render first
  setTimeout(() => {
    try {
      // Check localStorage for a custom SGF file
      const customSgf = localStorage.getItem(SGF_CUSTOM_KEY);
      const activeSgf = customSgf || sgfContent;

      const navigator = new SGFTreeNavigator(activeSgf);
      const canvas = document.getElementById('goban');
      const renderer = new GobanRenderer(canvas, navigator.boardSize);

      const app = new App(navigator, renderer);
      app.start();

      // Update the SGF file label
      const filename = localStorage.getItem(SGF_FILENAME_KEY);
      const label = document.getElementById('sgf-file-label');
      if (label) {
        label.innerHTML = `SGF file: <em>${filename || 'default'}</em>`;
      }

      hideLoading();
    } catch (err) {
      hideLoading();
      console.error('Failed to initialize:', err);
      document.getElementById('comment-text').textContent =
        `Error loading SGF: ${err.message}`;
    }
  }, 50);
}

class App {
  constructor(navigator, renderer) {
    this.nav = navigator;
    this.renderer = renderer;
    this.selectedBranch = 0;

    // DOM elements
    this.branchSelect = document.getElementById('branch-select');
    this.commentText = document.getElementById('comment-text');
    this.moveCounter = document.getElementById('move-counter');
    this.pathDisplay = document.getElementById('path-display');
    this.boardContainer = document.getElementById('board-container');

    // Learn stats
    this.learnFileLeaves = document.getElementById('learn-file-leaves');
    this.learnStartLeaves = document.getElementById('learn-start-leaves');
    this.learnCurrentLeaves = document.getElementById('learn-current-leaves');
   this.mistakesList = document.getElementById('mistakes-list');

    // Buttons
    this.btnStart = document.getElementById('btn-start');
    this.btnBackTen = document.getElementById('btn-back-10');
    this.btnPrev = document.getElementById('btn-prev');
    this.btnNext = document.getElementById('btn-next');
    this.btnFwdTen = document.getElementById('btn-fwd-10');
    this.btnEnd = document.getElementById('btn-end');
    this.btnPass = document.getElementById('btn-pass');
    this.btnSaveStart = document.getElementById('btn-save-start');
    this.btnSavedStart = document.getElementById('btn-saved-start');
    this.btnBookmark = document.getElementById('btn-bookmark');

    // Bookmarks
    this.bookmarksList = document.getElementById('bookmarks-list');

    // Settings
    this.settingCoords = document.getElementById('setting-coords');
    this.settingLabels = document.getElementById('setting-labels');
    this.settingMarks = document.getElementById('setting-marks');
    this.settingLastMove = document.getElementById('setting-lastmove');
    this.settingBoardSize = document.getElementById('setting-boardsize');
    this.settingVaryOrientation = document.getElementById('setting-vary-orientation');
    this.settingSerious = document.getElementById('setting-serious');
    this.btnResetLeaves = document.getElementById('btn-reset-leaves');
    this.btnUploadSgf = document.getElementById('btn-upload-sgf');
    this.btnDownloadSgf = document.getElementById('btn-download-sgf');
    this.btnResetSgf = document.getElementById('btn-reset-sgf');
    this.sgfFileInput = document.getElementById('sgf-file-input');

    // Restore persisted settings
    this._loadSettings();

    // Found leaves tracking
    this.foundLeaves = this._loadFoundLeaves();

    // Mistakes tracking: array of {path: number[], x: number, y: number}
    this.mistakes = this._loadMistakes();

    // Temporary extra marks for displaying mistake cross
    this.extraMarks = [];
  }

  start() {
    this._bindEvents();
    this._restoreSavedStart();
    this._updateDisplay();
  }

  /**
   * On initial load, navigate to the saved starting point if one exists
   * and is still valid in the current SGF tree.
   */
  _restoreSavedStart() {
    const SAVED_START_KEY = 'sgf-explorer-saved-start';
    let path;
    try {
      path = JSON.parse(localStorage.getItem(SAVED_START_KEY));
    } catch (e) {
      return;
    }
    if (!Array.isArray(path) || path.length === 0) return;

    if (!this.nav.goToPath(path)) {
      // Path is no longer valid in the SGF — clear it
      try {
        localStorage.removeItem(SAVED_START_KEY);
      } catch (e) {
        // ignore
      }
    }
  }

  _loadSettings() {
    const STORAGE_KEY = 'sgf-explorer-settings';
    let saved;
    try {
      saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    } catch (e) {
      // ignore corrupt data
    }
    if (!saved) return;

    if (typeof saved.showCoordinates === 'boolean') {
      this.settingCoords.checked = saved.showCoordinates;
      this.renderer.showCoordinates = saved.showCoordinates;
    }
    if (typeof saved.showLabels === 'boolean') {
      this.settingLabels.checked = saved.showLabels;
      this.renderer.showLabels = saved.showLabels;
    }
    if (typeof saved.showMarks === 'boolean') {
      this.settingMarks.checked = saved.showMarks;
      this.renderer.showMarks = saved.showMarks;
    }
    if (typeof saved.showLastMove === 'boolean') {
      this.settingLastMove.checked = saved.showLastMove;
      this.renderer.showLastMove = saved.showLastMove;
    }
    if (typeof saved.boardScale === 'number') {
      this.settingBoardSize.value = saved.boardScale;
      this.renderer.resize(saved.boardScale);
    }
    if (typeof saved.varyOrientation === 'boolean') {
      this.settingVaryOrientation.checked = saved.varyOrientation;
    }
    if (typeof saved.seriousMode === 'boolean') {
      this.settingSerious.checked = saved.seriousMode;
      this._applySeriousMode(saved.seriousMode);
    }
  }

  _saveSettings() {
    const STORAGE_KEY = 'sgf-explorer-settings';
    const settings = {
      showCoordinates: this.settingCoords.checked,
      showLabels: this.settingLabels.checked,
      showMarks: this.settingMarks.checked,
      showLastMove: this.settingLastMove.checked,
      boardScale: parseInt(this.settingBoardSize.value, 10),
      varyOrientation: this.settingVaryOrientation.checked,
      seriousMode: this.settingSerious.checked,
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (e) {
      // localStorage may be unavailable
    }
  }

  _loadFoundLeaves() {
    const FOUND_KEY = 'sgf-explorer-found-leaves';
    try {
      const data = JSON.parse(localStorage.getItem(FOUND_KEY));
      if (Array.isArray(data)) {
        return new Set(data);
      }
    } catch (e) {
      // ignore
    }
    return new Set();
  }

  _saveFoundLeaves() {
    const FOUND_KEY = 'sgf-explorer-found-leaves';
    try {
      localStorage.setItem(FOUND_KEY, JSON.stringify([...this.foundLeaves]));
    } catch (e) {
      // localStorage may be unavailable
    }
  }

  _loadMistakes() {
    const MISTAKES_KEY = 'sgf-explorer-mistakes';
    try {
      const data = JSON.parse(localStorage.getItem(MISTAKES_KEY));
      if (Array.isArray(data)) {
        return data;
      }
    } catch (e) {
      // ignore
    }
    return [];
  }

  _saveMistakes() {
    const MISTAKES_KEY = 'sgf-explorer-mistakes';
    try {
      localStorage.setItem(MISTAKES_KEY, JSON.stringify(this.mistakes));
    } catch (e) {
      // localStorage may be unavailable
    }
  }

  /**
   * Persist the current in-memory SGF tree to localStorage.
   * Called after any mutation to the SGF (e.g. bookmark creation).
   */
  _persistSGF() {
    try {
      const sgfText = this.nav.toSGF();
      localStorage.setItem(SGF_CUSTOM_KEY, sgfText);
      // If there wasn't a custom filename yet, set one
      if (!localStorage.getItem(SGF_FILENAME_KEY)) {
        localStorage.setItem(SGF_FILENAME_KEY, 'modified.sgf');
      }
      // Update the file label
      const label = document.getElementById('sgf-file-label');
      if (label) {
        const filename = localStorage.getItem(SGF_FILENAME_KEY);
        label.innerHTML = `SGF file: <em>${filename}</em>`;
      }
    } catch (e) {
      // localStorage may be unavailable or full
      console.warn('Failed to persist SGF:', e);
    }
  }

  /**
   * Record a wrong move at the current position.
   * @param {number} x
   * @param {number} y
   */
  _recordMistake(x, y) {
    const path = this.nav.getPath();
    this.mistakes.push({ path, x, y });
    this._saveMistakes();
    this._flashRed();
    this._updateLearnStats();
  }

  _flashRed() {
    this.boardContainer.classList.remove('flash-red');
    void this.boardContainer.offsetWidth;
    this.boardContainer.classList.add('flash-red');
    this.boardContainer.addEventListener('animationend', () => {
      this.boardContainer.classList.remove('flash-red');
    }, { once: true });
  }

  /**
   * Check if current position is a leaf; if so, record it as found.
   */
  _checkLeaf() {
    if (this.nav.isLeaf()) {
      const path = this.nav.getPath();
      const pathKey = path.join(',');
      if (!this.foundLeaves.has(pathKey)) {
        this.foundLeaves.add(pathKey);
        this._saveFoundLeaves();
      }
    }
  }

  /**
   * Check if all leaves under the current position are found.
   * If so, flash the board green.
   */
  _checkAllLeavesFound() {
    const currentPath = this.nav.getPath();
    const stats = this.nav.countFoundLeaves(this.nav.currentNode, currentPath, this.foundLeaves);
    if (stats.total > 0 && stats.found === stats.total) {
      this._flashGreen();
    }
  }

  _flashGreen() {
    this.boardContainer.classList.remove('flash-green');
    // Force reflow so re-adding the class restarts the animation
    void this.boardContainer.offsetWidth;
    this.boardContainer.classList.add('flash-green');
    this.boardContainer.addEventListener('animationend', () => {
      this.boardContainer.classList.remove('flash-green');
    }, { once: true });
  }

  /**
   * Apply serious mode: toggle body class, disable/enable forward nav buttons.
   */
  _applySeriousMode(active) {
    document.body.classList.toggle('serious-mode', active);
    this.btnNext.disabled = active;
    this.btnFwdTen.disabled = active;
    this.btnEnd.disabled = active;
  }

  _bindEvents() {
    this.btnStart.addEventListener('click', () => this._goToStart());
    this.btnBackTen.addEventListener('click', () => this._backN(10));
    this.btnPrev.addEventListener('click', () => this._prev());
    this.btnNext.addEventListener('click', () => this._next());
    this.btnFwdTen.addEventListener('click', () => this._forwardN(10));
    this.btnEnd.addEventListener('click', () => this._goToEnd());
    this.btnPass.addEventListener('click', () => this._pass());
    this.btnSaveStart.addEventListener('click', () => this._saveStartPosition());
    this.btnSavedStart.addEventListener('click', () => this._goToSavedStart());
    this.btnBookmark.addEventListener('click', () => this._addBookmark());

    this.branchSelect.addEventListener('change', (e) => {
      this.selectedBranch = parseInt(e.target.value, 10);
    });

    // Serious mode toggle
    this.settingSerious.addEventListener('change', () => {
      this._applySeriousMode(this.settingSerious.checked);
      this._saveSettings();
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      // Don't capture when select is focused
      if (e.target === this.branchSelect && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        return;
      }

      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          this._prev();
          break;
        case 'ArrowRight':
          e.preventDefault();
          if (!this.settingSerious.checked) this._next();
          break;
        case 'ArrowUp':
          e.preventDefault();
          if (!this.settingSerious.checked) this._prevBranch();
          break;
        case 'ArrowDown':
          e.preventDefault();
          if (!this.settingSerious.checked) this._nextBranch();
          break;
        case 'Home':
          e.preventDefault();
          this._goToStart();
          break;
        case 'End':
          e.preventDefault();
          if (!this.settingSerious.checked) this._goToEnd();
          break;
        case 'p':
        case 'P':
          e.preventDefault();
          if (!this.settingSerious.checked) this._pass();
          break;
      }
    });

    // Click on board intersection to select matching branch
    this.renderer.onIntersectionClick = (x, y) => {
      this._handleBoardClick(x, y);
    };

    // Settings
    this.settingCoords.addEventListener('change', () => {
      this.renderer.showCoordinates = this.settingCoords.checked;
      this._saveSettings();
      this._updateDisplay();
    });
    this.settingLabels.addEventListener('change', () => {
      this.renderer.showLabels = this.settingLabels.checked;
      this._saveSettings();
      this._updateDisplay();
    });
    this.settingMarks.addEventListener('change', () => {
      this.renderer.showMarks = this.settingMarks.checked;
      this._saveSettings();
      this._updateDisplay();
    });
    this.settingLastMove.addEventListener('change', () => {
      this.renderer.showLastMove = this.settingLastMove.checked;
      this._saveSettings();
      this._updateDisplay();
    });
    this.settingBoardSize.addEventListener('input', () => {
      const newCellSize = parseInt(this.settingBoardSize.value, 10);
      this.renderer.resize(newCellSize);
      this._saveSettings();
      this._updateDisplay();
    });
    this.settingVaryOrientation.addEventListener('change', () => {
      if (!this.settingVaryOrientation.checked) {
        this.renderer.rotation = 0;
        this._updateDisplay();
      }
      this._saveSettings();
    });
    this.btnResetLeaves.addEventListener('click', () => {
      if (confirm('Reset all discovered leaves? This cannot be undone.')) {
        this.foundLeaves.clear();
        this.mistakes = [];
        this._saveMistakes();
        this._saveFoundLeaves();
        this._updateLearnStats();
      }
    });

    // SGF file upload
    this.btnUploadSgf.addEventListener('click', () => {
      this.sgfFileInput.click();
    });
    this.sgfFileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const text = ev.target.result;
        try {
          // Validate that it parses before storing
          new SGFTreeNavigator(text);
          localStorage.setItem(SGF_CUSTOM_KEY, text);
          localStorage.setItem(SGF_FILENAME_KEY, file.name);
          // Clear stale progress from old SGF
          localStorage.removeItem('sgf-explorer-found-leaves');
          localStorage.removeItem('sgf-explorer-mistakes');
          localStorage.removeItem('sgf-explorer-saved-start');
          location.reload();
        } catch (err) {
          alert(`Invalid SGF file: ${err.message}`);
        }
      };
      reader.readAsText(file);
      // Reset input so the same file can be re-selected
      this.sgfFileInput.value = '';
    });
    this.btnDownloadSgf.addEventListener('click', () => {
      const customSgf = localStorage.getItem(SGF_CUSTOM_KEY);
      const content = customSgf || sgfContent;
      const filename = localStorage.getItem(SGF_FILENAME_KEY) || 'export.sgf';
      const blob = new Blob([content], { type: 'application/x-go-sgf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    });
    this.btnResetSgf.addEventListener('click', () => {
      if (!localStorage.getItem(SGF_CUSTOM_KEY)) return;
      if (confirm('Reset to default SGF file? Progress will be cleared.')) {
        localStorage.removeItem(SGF_CUSTOM_KEY);
        localStorage.removeItem(SGF_FILENAME_KEY);
        localStorage.removeItem('sgf-explorer-found-leaves');
        localStorage.removeItem('sgf-explorer-mistakes');
        localStorage.removeItem('sgf-explorer-saved-start');
        location.reload();
      }
    });
  }

  _next() {
    if (this.nav.next(this.selectedBranch)) {
      this.selectedBranch = 0;
      this._updateDisplay();
    }
  }

  _prev() {
    if (this.nav.prev()) {
      this.selectedBranch = 0;
      this._updateDisplay();
    }
  }

  _goToStart() {
    this.nav.goToStart();
    this.selectedBranch = 0;
    if (this.settingVaryOrientation.checked) {
      this.renderer.rotation = Math.floor(Math.random() * 4);
    }
    this._updateDisplay();
  }

  _goToEnd() {
    this.nav.goToEnd();
    this.selectedBranch = 0;
    this._updateDisplay();
  }

  _backN(n) {
    for (let i = 0; i < n; i++) {
      if (!this.nav.prev()) break;
    }
    this.selectedBranch = 0;
    this._updateDisplay();
  }

  _forwardN(n) {
    for (let i = 0; i < n; i++) {
      if (!this.nav.next(0)) break;
    }
    this.selectedBranch = 0;
    this._updateDisplay();
  }

  _pass() {
    const passIdx = this.nav.findPassBranch();
    if (passIdx >= 0) {
      this.selectedBranch = passIdx;
      this._next();
    }
  }

  _saveStartPosition() {
    const SAVED_START_KEY = 'sgf-explorer-saved-start';
    const path = this.nav.getPath();
    try {
      localStorage.setItem(SAVED_START_KEY, JSON.stringify(path));
    } catch (e) {
      // localStorage may be unavailable
    }
    this.btnSavedStart.disabled = false;
    this._updateLearnStats();
  }

  _goToSavedStart() {
    const SAVED_START_KEY = 'sgf-explorer-saved-start';
    let path;
    try {
      path = JSON.parse(localStorage.getItem(SAVED_START_KEY));
    } catch (e) {
      return;
    }
    if (!Array.isArray(path)) return;

    this.nav.goToPath(path);
    this.selectedBranch = 0;
    if (this.settingVaryOrientation.checked) {
      this.renderer.rotation = Math.floor(Math.random() * 4);
    }
    this._updateDisplay();
  }

  _addBookmark() {
    const existing = this.nav.getBookmark();
    const defaultName = existing || '';
    const name = prompt('Bookmark name:', defaultName);
    if (name === null) return; // cancelled
    if (name.trim() === '') return; // empty

    this.nav.setBookmark(name.trim());
    this._persistSGF();
    this._updateDisplay();
  }

  _renderBookmarks() {
    this.bookmarksList.innerHTML = '';
    const bookmarks = this.nav.getAllBookmarks();

    if (bookmarks.length === 0) return; // CSS :empty handles the message

    // Sort bookmarks alphabetically by name
    bookmarks.sort((a, b) => a.name.localeCompare(b.name));

    for (const bm of bookmarks) {
      const el = document.createElement('div');
      el.className = 'bookmark-item';

      const nameSpan = document.createElement('span');
      nameSpan.className = 'bookmark-name';
      nameSpan.textContent = bm.name;

      const pathSpan = document.createElement('span');
      pathSpan.className = 'bookmark-path';
      pathSpan.textContent = this._bookmarkPathToString(bm.path);

      el.appendChild(nameSpan);
      el.appendChild(pathSpan);
      el.title = `Navigate to "${bm.name}"`;

      el.addEventListener('click', () => {
        this.nav.goToPath(bm.path);
        this.selectedBranch = 0;
        this.extraMarks = [];
        this._updateDisplay();
      });

      this.bookmarksList.appendChild(el);
    }
  }

  _bookmarkPathToString(path) {
    if (path.length === 0) return 'Root';
    const parts = [];
    let node = this.nav.root;
    for (const idx of path) {
      const children = node.children || [];
      if (idx >= children.length) break;
      node = children[idx];
      const data = node.data || {};
      if (data.B && data.B[0] && data.B[0].length === 2) {
        const [x, y] = parseVertex(data.B[0]);
        parts.push(`B${this.nav.coordToString(x, y)}`);
      } else if (data.W && data.W[0] && data.W[0].length === 2) {
        const [x, y] = parseVertex(data.W[0]);
        parts.push(`W${this.nav.coordToString(x, y)}`);
      }
    }
    return parts.length > 3
      ? `${parts.slice(0, 2).join('→')}…→${parts[parts.length - 1]}`
      : parts.join(' → ') || 'Root';
  }

  _prevBranch() {
    const branches = this.nav.getBranches();
    if (branches.length <= 1) return;
    this.selectedBranch = (this.selectedBranch - 1 + branches.length) % branches.length;
    this.branchSelect.value = this.selectedBranch;
  }

  _nextBranch() {
    const branches = this.nav.getBranches();
    if (branches.length <= 1) return;
    this.selectedBranch = (this.selectedBranch + 1) % branches.length;
    this.branchSelect.value = this.selectedBranch;
  }

  _handleBoardClick(x, y) {
    // Ignore clicks on occupied intersections
    const board = this.nav.getBoard();
    if (board[y] && board[y][x] !== 0) return;

    // Find if any branch leads to a move at (x, y)
    const branches = this.nav.getBranches();
    for (const branch of branches) {
      const data = branch.node.data || {};
      let mx = -1, my = -1;

      if (data.B && data.B[0] && data.B[0].length === 2) {
        [mx, my] = parseVertex(data.B[0]);
      } else if (data.W && data.W[0] && data.W[0].length === 2) {
        [mx, my] = parseVertex(data.W[0]);
      }

      if (mx === x && my === y) {
        this.extraMarks = [];
        this.selectedBranch = branch.index;
        this._next();
        return;
      }
    }

    // If not a leaf and move doesn't match any branch, it's a mistake
    if (!this.nav.isLeaf() && branches.length > 0) {
      this._recordMistake(x, y);

      // Show the wrong move as a cross mark temporarily
      this.extraMarks = [{ x, y, type: 'cross' }];
      this._renderWithExtraMarks();

      // Clear the cross after a delay
      setTimeout(() => {
        this.extraMarks = [];
        this._renderWithExtraMarks();
      }, 1200);
    }
  }

  /**
   * Re-render the board with any extra marks overlaid.
   */
  _renderWithExtraMarks() {
    const board = this.nav.getBoard();
    const info = this.nav.getCurrentInfo();
    // Merge extra marks with SGF marks
    const mergedInfo = {
      ...info,
      marks: [...(info.marks || []), ...this.extraMarks],
    };
    this.renderer.render(board, mergedInfo);
  }

  _updateDisplay() {
    const board = this.nav.getBoard();
    const info = this.nav.getCurrentInfo();

    // Render board
    this.renderer.render(board, info);

    // Update comment
    this.commentText.textContent = info.comment || '';

    // Update move counter
    this.moveCounter.textContent = `Move ${info.depth}`;

    // Update path
    this.pathDisplay.textContent = this.nav.getPathString() || 'Start position';

    // Update branch selector
    this._updateBranchSelect();

    // Update pass button availability
    this.btnPass.disabled = this.nav.findPassBranch() < 0;

    // Re-apply serious mode constraints
    if (this.settingSerious.checked) {
      this._applySeriousMode(true);
    }

    // Update saved start button availability
    try {
      this.btnSavedStart.disabled = !localStorage.getItem('sgf-explorer-saved-start');
    } catch (e) {
      this.btnSavedStart.disabled = true;
    }

    // Check if we've reached a new leaf
    this._checkLeaf();

    // Flash green if all leaves under current position are found
    this._checkAllLeavesFound();

    // Update Learn stats
    this._updateLearnStats();

    // Update Bookmarks list
    this._renderBookmarks();
  }

  _updateLearnStats() {
      const foundSet = this.foundLeaves;
      // Helper to format "found / total leaves (pct%)"
      const fmt = (found, total, mistakes) => {
          const pct = total > 0 ? Math.round((found / total) * 100) : 0;
          return `${found} / ${total} leaves (${pct}%)  - ${mistakes} mistake${mistakes !== 1 ? 's' : ''}`;
      };
      // Current position scope
      const currentPath = this.nav.getPath();
      const currentStats = this.nav.countFoundLeaves(this.nav.currentNode, currentPath, foundSet);


      // Mistake counts
      const currentPathKey = currentPath.join(',');
      let startPathKey = null;
      try {
          const pathStr = localStorage.getItem('sgf-explorer-saved-start');
          if (pathStr) {
              const path = JSON.parse(pathStr);
              if (Array.isArray(path)) startPathKey = path.join(',');
          }
      } catch (e) { /* ignore */ }

      let fileMistakes = 0;
      let startMistakes = 0;
      let currentMistakes = 0;

      for (const m of this.mistakes) {
          const mKey = m.path.join(',');
          fileMistakes++;
          if (startPathKey !== null && (mKey === startPathKey || mKey.startsWith(startPathKey + ','))) {
              startMistakes++;
          }
          if (mKey === currentPathKey || mKey.startsWith(currentPathKey + ',')) {
              currentMistakes++;
          }
      }

    // File scope: all leaves from root
    const fileStats = this.nav.countFoundLeaves(this.nav.root, [], foundSet);
    this.learnFileLeaves.textContent = fmt(fileStats.found, fileStats.total, fileMistakes);
    this.learnFileLeaves.classList.toggle('completed', fileStats.total > 0 && fileStats.found === fileStats.total);

    this.learnCurrentLeaves.textContent = fmt(currentStats.found, currentStats.total, currentMistakes);
    this.learnCurrentLeaves.classList.toggle('completed', currentStats.total > 0 && currentStats.found === currentStats.total);

    // Start position scope
    const SAVED_START_KEY = 'sgf-explorer-saved-start';
    let startText = '—';
    let startCompleted = false;
    try {
      const pathStr = localStorage.getItem(SAVED_START_KEY);
      if (pathStr) {
        const path = JSON.parse(pathStr);
        if (Array.isArray(path)) {
          let node = this.nav.root;
          let valid = true;
          for (const idx of path) {
            const children = node.children || [];
            if (idx < children.length) {
              node = children[idx];
            } else {
              valid = false;
              break;
            }
          }
          if (valid) {
            const startStats = this.nav.countFoundLeaves(node, path, foundSet);
            startText = fmt(startStats.found, startStats.total, startMistakes);
            startCompleted = startStats.total > 0 && startStats.found === startStats.total;
          }
        }
      }
    } catch (e) {
      // ignore
    }
    this.learnStartLeaves.textContent = startText;
    this.learnStartLeaves.classList.toggle('completed', startCompleted);


    // Populate mistakes list
    this._renderMistakesList();
  }

  _renderMistakesList() {
    this.mistakesList.innerHTML = '';
    if (this.mistakes.length === 0) {
      this.mistakesList.innerHTML = '<div style="font-size:0.75rem;color:#606080;font-style:italic;">No mistakes yet.</div>';
      return;
    }

    for (let i = 0; i < this.mistakes.length; i++) {
      const m = this.mistakes[i];
      const el = document.createElement('div');
      el.className = 'mistake-item';

      // Build a human-readable path for the mistake
      const moveCoord = this.nav.coordToString(m.x, m.y);
      const pathDesc = this._mistakePathToString(m.path);
      el.textContent = `${pathDesc} ✕${moveCoord}`;
      el.title = `Click to navigate to this mistake`;

      el.addEventListener('click', () => {
        this._navigateToMistake(i);
      });

      this.mistakesList.appendChild(el);
    }
  }

  /**
   * Convert a mistake's path (branch indices) to a human-readable move sequence.
   */
  _mistakePathToString(path) {
    if (path.length === 0) return 'Root';
    const parts = [];
    let node = this.nav.root;
    for (const idx of path) {
      const children = node.children || [];
      if (idx >= children.length) break;
      node = children[idx];
      const data = node.data || {};
      if (data.B && data.B[0] && data.B[0].length === 2) {
        const [x, y] = parseVertex(data.B[0]);
        parts.push(`B${this.nav.coordToString(x, y)}`);
      } else if (data.W && data.W[0] && data.W[0].length === 2) {
        const [x, y] = parseVertex(data.W[0]);
        parts.push(`W${this.nav.coordToString(x, y)}`);
      }
    }
    return parts.join(' → ') || 'Root';
  }

  /**
   * Navigate to a mistake's parent position and show the wrong move as a cross mark.
   */
  _navigateToMistake(index) {
    const m = this.mistakes[index];
    if (!m) return;

    this.nav.goToPath(m.path);
    this.selectedBranch = 0;

    // Show the wrong move as a persistent cross mark
    this.extraMarks = [{ x: m.x, y: m.y, type: 'cross' }];

    const board = this.nav.getBoard();
    const info = this.nav.getCurrentInfo();
    const mergedInfo = {
      ...info,
      marks: [...(info.marks || []), ...this.extraMarks],
    };
    this.renderer.render(board, mergedInfo);

    // Update non-render display elements
    this.commentText.textContent = info.comment || '';
    this.moveCounter.textContent = `Move ${info.depth}`;
    this.pathDisplay.textContent = this.nav.getPathString() || 'Start position';
    this._updateBranchSelect();
    this.btnPass.disabled = this.nav.findPassBranch() < 0;
    try {
      this.btnSavedStart.disabled = !localStorage.getItem('sgf-explorer-saved-start');
    } catch (e) {
      this.btnSavedStart.disabled = true;
    }
  }

  _updateBranchSelect() {
    const branches = this.nav.getBranches();
    this.branchSelect.innerHTML = '';

    if (branches.length === 0) {
      const option = document.createElement('option');
      option.textContent = '(end of line)';
      option.disabled = true;
      this.branchSelect.appendChild(option);
      this.branchSelect.disabled = true;
      return;
    }

    this.branchSelect.disabled = false;

    for (const branch of branches) {
      const option = document.createElement('option');
      option.value = branch.index;
      option.textContent = branch.description;
      if (branch.index === this.selectedBranch) {
        option.selected = true;
      }
      this.branchSelect.appendChild(option);
    }

    // Reset selected branch if out of bounds
    if (this.selectedBranch >= branches.length) {
      this.selectedBranch = 0;
    }
  }
}

// Start the app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

