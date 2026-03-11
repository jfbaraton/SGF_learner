import './styles.css';
import SGFTreeNavigator from './sgf-tree-navigator';
import GobanRenderer from './goban-renderer';
import { parseVertex } from '@sabaki/sgf';
// import sgfContent from '../eidogo_joseki.sgf';
import sgfContent from '../handmade_mustknow.sgf';

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
function init() {
  showLoading();

  // Use setTimeout to allow the loading overlay to render first
  setTimeout(() => {
    try {
      const navigator = new SGFTreeNavigator(sgfContent);
      const canvas = document.getElementById('goban');
      const renderer = new GobanRenderer(canvas, navigator.boardSize);

      const app = new App(navigator, renderer);
      app.start();

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

    // Settings
    this.settingCoords = document.getElementById('setting-coords');
    this.settingLabels = document.getElementById('setting-labels');
    this.settingMarks = document.getElementById('setting-marks');
    this.settingLastMove = document.getElementById('setting-lastmove');
    this.settingBoardSize = document.getElementById('setting-boardsize');
    this.settingVaryOrientation = document.getElementById('setting-vary-orientation');

    // Restore persisted settings
    this._loadSettings();
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
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (e) {
      // localStorage may be unavailable
    }
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

    this.branchSelect.addEventListener('change', (e) => {
      this.selectedBranch = parseInt(e.target.value, 10);
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
          this._next();
          break;
        case 'ArrowUp':
          e.preventDefault();
          this._prevBranch();
          break;
        case 'ArrowDown':
          e.preventDefault();
          this._nextBranch();
          break;
        case 'Home':
          e.preventDefault();
          this._goToStart();
          break;
        case 'End':
          e.preventDefault();
          this._goToEnd();
          break;
        case 'p':
        case 'P':
          e.preventDefault();
          this._pass();
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
        this.selectedBranch = branch.index;
        this._next();
        return;
      }
    }
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

    // Update saved start button availability
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

