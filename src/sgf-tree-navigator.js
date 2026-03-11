import { parse, parseVertex } from '@sabaki/sgf';

/**
 * SGF Tree Navigator - traverses a parsed SGF game tree
 * Each node has: { id, data, parentId, children }
 * data keys: B, W (moves), C (comments), LB (labels), AB/AW (setup stones), etc.
 */
export default class SGFTreeNavigator {
  constructor(sgfString) {
    const rootNodes = parse(sgfString);
    if (!rootNodes || rootNodes.length === 0) {
      throw new Error('Failed to parse SGF file');
    }

    // We use the first game tree
    this.root = rootNodes[0];

    // Build a parent map for easy backward traversal
    this.parentMap = new Map();
    this._buildParentMap(this.root, null);

    // Current node pointer
    this.currentNode = this.root;

    // Track the board state: a 19x19 array, 0=empty, 1=black, 2=white
    this.boardSize = this._getBoardSize();
    this.boardState = this._createEmptyBoard();
    this.moveHistory = []; // stack of {node, boardSnapshot}

    // Apply setup from root node
    this._applySetup(this.root);
    this._saveBoardSnapshot();
  }

  _buildParentMap(node, parent) {
    this.parentMap.set(node, parent);
    if (node.children) {
      for (const child of node.children) {
        this._buildParentMap(child, node);
      }
    }
  }

  _getBoardSize() {
    const sz = this.root.data && this.root.data.SZ;
    if (sz && sz.length > 0) {
      return parseInt(sz[0], 10);
    }
    return 19;
  }

  _createEmptyBoard() {
    const board = [];
    for (let i = 0; i < this.boardSize; i++) {
      board.push(new Array(this.boardSize).fill(0));
    }
    return board;
  }

  _cloneBoard() {
    return this.boardState.map(row => [...row]);
  }

  _saveBoardSnapshot() {
    // Save current state so we can restore on back()
  }

  _applySetup(node) {
    const data = node.data || {};

    // Add Black stones (AB)
    if (data.AB) {
      for (const coord of data.AB) {
        const [x, y] = parseVertex(coord);
        if (x >= 0 && y >= 0 && x < this.boardSize && y < this.boardSize) {
          this.boardState[y][x] = 1;
        }
      }
    }

    // Add White stones (AW)
    if (data.AW) {
      for (const coord of data.AW) {
        const [x, y] = parseVertex(coord);
        if (x >= 0 && y >= 0 && x < this.boardSize && y < this.boardSize) {
          this.boardState[y][x] = 2;
        }
      }
    }

    // Remove stones (AE)
    if (data.AE) {
      for (const coord of data.AE) {
        const [x, y] = parseVertex(coord);
        if (x >= 0 && y >= 0 && x < this.boardSize && y < this.boardSize) {
          this.boardState[y][x] = 0;
        }
      }
    }
  }

  _applyMove(node) {
    const data = node.data || {};
    let color = 0;
    let moveCoord = null;

    if (data.B && data.B.length > 0) {
      color = 1;
      moveCoord = data.B[0];
    } else if (data.W && data.W.length > 0) {
      color = 2;
      moveCoord = data.W[0];
    }

    if (moveCoord && moveCoord.length === 2) {
      const [x, y] = parseVertex(moveCoord);
      if (x >= 0 && y >= 0 && x < this.boardSize && y < this.boardSize) {
        this.boardState[y][x] = color;
        // Remove captured stones
        this._removeCaptures(x, y, color);
      }
    }

    // Also apply any setup stones in this node
    this._applySetup(node);
  }

  _removeCaptures(x, y, color) {
    const opponent = color === 1 ? 2 : 1;
    const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]];

    for (const [dx, dy] of directions) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < this.boardSize && ny < this.boardSize) {
        if (this.boardState[ny][nx] === opponent) {
          const group = this._getGroup(nx, ny);
          if (!this._hasLiberties(group)) {
            for (const [gx, gy] of group) {
              this.boardState[gy][gx] = 0;
            }
          }
        }
      }
    }
  }

  _getGroup(x, y) {
    const color = this.boardState[y][x];
    const visited = new Set();
    const group = [];
    const queue = [[x, y]];

    while (queue.length > 0) {
      const [cx, cy] = queue.pop();
      const key = `${cx},${cy}`;
      if (visited.has(key)) continue;
      visited.add(key);

      if (cx < 0 || cy < 0 || cx >= this.boardSize || cy >= this.boardSize) continue;
      if (this.boardState[cy][cx] !== color) continue;

      group.push([cx, cy]);

      queue.push([cx - 1, cy], [cx + 1, cy], [cx, cy - 1], [cx, cy + 1]);
    }

    return group;
  }

  _hasLiberties(group) {
    for (const [x, y] of group) {
      const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]];
      for (const [dx, dy] of directions) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < this.boardSize && ny < this.boardSize) {
          if (this.boardState[ny][nx] === 0) return true;
        }
      }
    }
    return false;
  }

  /**
   * Navigate to next node (first child or specified branch)
   * @param {number} branchIndex - which child to follow (0 = main)
   * @returns {boolean} true if navigation succeeded
   */
  next(branchIndex = 0) {
    const children = this.currentNode.children || [];
    if (children.length === 0) return false;

    const idx = Math.min(branchIndex, children.length - 1);
    const prevBoard = this._cloneBoard();

    this.moveHistory.push({
      node: this.currentNode,
      board: prevBoard,
    });

    this.currentNode = children[idx];
    this._applyMove(this.currentNode);
    return true;
  }

  /**
   * Navigate to previous node
   * @returns {boolean} true if navigation succeeded
   */
  prev() {
    if (this.moveHistory.length === 0) return false;

    const { node, board } = this.moveHistory.pop();
    this.currentNode = node;
    this.boardState = board;
    return true;
  }

  /**
   * Go to the beginning (root node)
   */
  goToStart() {
    this.currentNode = this.root;
    this.boardState = this._createEmptyBoard();
    this.moveHistory = [];
    this._applySetup(this.root);
  }

  /**
   * Follow main line (first child) to the end
   */
  goToEnd() {
    while (this.next(0)) {
      // keep going
    }
  }

  /**
   * Get the current path as an array of branch indices (serializable).
   * Each entry is the child index that was chosen at that depth.
   */
  getPath() {
    const path = [];
    // Walk the move history: for each step, figure out which child index
    // was taken from the parent to reach the next node.
    for (let i = 0; i < this.moveHistory.length; i++) {
      const parentNode = this.moveHistory[i].node;
      const childNode = i + 1 < this.moveHistory.length
        ? this.moveHistory[i + 1].node
        : this.currentNode;
      const children = parentNode.children || [];
      const idx = children.indexOf(childNode);
      path.push(idx >= 0 ? idx : 0);
    }
    return path;
  }

  /**
   * Navigate to a position described by an array of branch indices.
   * Resets to root first, then replays each step.
   * @param {number[]} path
   * @returns {boolean} true if the entire path was valid and traversed
   */
  goToPath(path) {
    this.goToStart();
    for (const branchIndex of path) {
      if (!this.next(branchIndex)) return false;
    }
    return true;
  }

  /**
   * Get children/branches at current node
   * @returns {Array} branch descriptors
   */
  getBranches() {
    const children = this.currentNode.children || [];
    return children.map((child, i) => {
      const data = child.data || {};
      let desc = `Variation ${i + 1}`;

      if (data.B !== undefined && data.B.length > 0) {
        if (data.B[0] === '' || data.B[0].length === 0) {
          desc = `B Pass`;
        } else {
          const [x, y] = parseVertex(data.B[0]);
          desc = `B ${this._coordToString(x, y)}`;
        }
      } else if (data.W !== undefined && data.W.length > 0) {
        if (data.W[0] === '' || data.W[0].length === 0) {
          desc = `W Pass`;
        } else {
          const [x, y] = parseVertex(data.W[0]);
          desc = `W ${this._coordToString(x, y)}`;
        }
      }

      // Add comment preview if available
      if (data.C && data.C[0]) {
        const preview = data.C[0].substring(0, 40).replace(/\n/g, ' ');
        desc += ` — ${preview}`;
      }

      // Add label info from current node
      if (data.N && data.N[0]) {
        desc = data.N[0];
      }

      return { index: i, description: desc, node: child };
    });
  }

  /**
   * Get info about the current node
   */
  getCurrentInfo() {
    const data = this.currentNode.data || {};
    return {
      comment: data.C ? data.C[0] : null,
      labels: this._getLabels(data),
      marks: this._getMarks(data),
      move: this._getMove(data),
      nodeName: data.N ? data.N[0] : null,
      numChildren: (this.currentNode.children || []).length,
      depth: this.moveHistory.length,
    };
  }

  _getMove(data) {
    if (data.B !== undefined && data.B.length > 0) {
      if (data.B[0] === '' || data.B[0].length === 0) {
        return { color: 'black', x: -1, y: -1, pass: true };
      }
      const [x, y] = parseVertex(data.B[0]);
      return { color: 'black', x, y, pass: false };
    }
    if (data.W !== undefined && data.W.length > 0) {
      if (data.W[0] === '' || data.W[0].length === 0) {
        return { color: 'white', x: -1, y: -1, pass: true };
      }
      const [x, y] = parseVertex(data.W[0]);
      return { color: 'white', x, y, pass: false };
    }
    return null;
  }

  _getLabels(data) {
    const labels = [];
    if (data.LB) {
      for (const lb of data.LB) {
        const parts = lb.split(':');
        if (parts.length >= 2) {
          const [x, y] = parseVertex(parts[0]);
          labels.push({ x, y, text: parts.slice(1).join(':') });
        }
      }
    }
    return labels;
  }

  _getMarks(data) {
    const marks = [];
    const types = { TR: 'triangle', SQ: 'square', CR: 'circle', MA: 'cross' };
    for (const [key, type] of Object.entries(types)) {
      if (data[key]) {
        for (const coord of data[key]) {
          const [x, y] = parseVertex(coord);
          marks.push({ x, y, type });
        }
      }
    }
    return marks;
  }

  _coordToString(x, y) {
    // Convert to Go coordinates (A-T, skipping I, 1-19 from bottom)
    const letters = 'ABCDEFGHJKLMNOPQRST';
    if (x < 0 || x >= this.boardSize || y < 0 || y >= this.boardSize) return '??';
    return `${letters[x]}${this.boardSize - y}`;
  }

  /**
   * Public coordinate to string conversion.
   */
  coordToString(x, y) {
    return this._coordToString(x, y);
  }

  /**
   * Get the bookmark name from the current node's comment, if any.
   * Bookmark format: "Bookmarked - NAME." at the start of the comment.
   * @returns {string|null} the bookmark name, or null if not bookmarked
   */
  getBookmark() {
    const data = this.currentNode.data || {};
    const comment = data.C ? data.C[0] : '';
    const match = comment.match(/^Bookmarked - ([^.]*)\./);
    return match ? match[1] : null;
  }

  /**
   * Set or update a bookmark on the current node.
   * Prepends/replaces "Bookmarked - NAME." at the start of the comment.
   * @param {string} name - bookmark name (dots will be stripped)
   */
  setBookmark(name) {
    const cleanName = name.replace(/\./g, '');
    if (!this.currentNode.data) {
      this.currentNode.data = {};
    }
    const data = this.currentNode.data;
    const existing = data.C ? data.C[0] : '';
    const prefix = `Bookmarked - ${cleanName}.`;

    if (existing.match(/^Bookmarked - [^.]*\./)) {
      // Replace existing bookmark prefix
      data.C = [existing.replace(/^Bookmarked - [^.]*\./, prefix)];
    } else {
      // Prepend bookmark prefix
      data.C = [existing ? `${prefix} ${existing}` : prefix];
    }
  }

  /**
   * Walk the entire tree and collect all bookmarked nodes with their paths.
   * @returns {Array<{name: string, path: number[]}>}
   */
  getAllBookmarks() {
    const bookmarks = [];
    const stack = [{ node: this.root, path: [] }];
    while (stack.length > 0) {
      const { node, path } = stack.pop();
      const data = node.data || {};
      const comment = data.C ? data.C[0] : '';
      const match = comment.match(/^Bookmarked - ([^.]*)\./);
      if (match) {
        bookmarks.push({ name: match[1], path: [...path] });
      }
      const children = node.children || [];
      for (let i = 0; i < children.length; i++) {
        stack.push({ node: children[i], path: [...path, i] });
      }
    }
    return bookmarks;
  }

  /**
   * Get current board state
   * @returns {number[][]} 2D array, 0=empty, 1=black, 2=white
   */
  getBoard() {
    return this.boardState;
  }

  /**
   * Find the index of a pass branch among current children, or -1 if none
   */
  findPassBranch() {
    const children = this.currentNode.children || [];
    for (let i = 0; i < children.length; i++) {
      const data = children[i].data || {};
      if (data.B !== undefined && data.B.length > 0 && (data.B[0] === '' || data.B[0].length === 0)) {
        return i;
      }
      if (data.W !== undefined && data.W.length > 0 && (data.W[0] === '' || data.W[0].length === 0)) {
        return i;
      }
    }
    return -1;
  }

  /**
   * Get move path as human-readable string
   */
  getPathString() {
    const parts = [];
    for (const { node } of this.moveHistory) {
      const data = node.data || {};
      const move = this._getMove(data);
      if (move) {
        const prefix = move.color === 'black' ? 'B' : 'W';
        parts.push(move.pass ? `${prefix} Pass` : `${prefix}${this._coordToString(move.x, move.y)}`);
      }
    }
    // Add current node's move
    const currentMove = this._getMove(this.currentNode.data || {});
    if (currentMove) {
      const prefix = currentMove.color === 'black' ? 'B' : 'W';
      parts.push(currentMove.pass ? `${prefix} Pass` : `${prefix}${this._coordToString(currentMove.x, currentMove.y)}`);
    }
    return parts.join(' → ');
  }

  /**
   * Count the number of leaf nodes (end-of-line positions) in the subtree
   * rooted at the given node. Uses an iterative approach for large trees.
   * @param {object} node - tree node to count from
   * @returns {number}
   */
  countLeaves(node) {
    let count = 0;
    const stack = [node];
    while (stack.length > 0) {
      const n = stack.pop();
      const children = n.children || [];
      if (children.length === 0) {
        count++;
      } else {
        for (const child of children) {
          stack.push(child);
        }
      }
    }
    return count;
  }

  /**
   * Total leaves in the entire SGF file (cached after first call).
   * @returns {number}
   */
  getTotalLeaves() {
    if (this._totalLeaves === undefined) {
      this._totalLeaves = this.countLeaves(this.root);
    }
    return this._totalLeaves;
  }

  /**
   * Leaves reachable from the current node.
   * @returns {number}
   */
  getCurrentLeaves() {
    return this.countLeaves(this.currentNode);
  }

  /**
   * Whether the current node is a leaf (no children).
   * @returns {boolean}
   */
  isLeaf() {
    const children = this.currentNode.children || [];
    return children.length === 0;
  }

  /**
   * Collect all leaf paths in the subtree rooted at `node`.
   * Each leaf path is represented as a string of comma-separated branch indices
   * relative to the given `basePath` prefix.
   * @param {object} node
   * @param {number[]} basePath - the path to reach `node` from root
   * @returns {string[]} array of path strings like "0,2,1,0"
   */
  getLeafPaths(node, basePath = []) {
    const leaves = [];
    const stack = [{ node, path: basePath }];
    while (stack.length > 0) {
      const { node: n, path } = stack.pop();
      const children = n.children || [];
      if (children.length === 0) {
        leaves.push(path.join(','));
      } else {
        for (let i = 0; i < children.length; i++) {
          stack.push({ node: children[i], path: [...path, i] });
        }
      }
    }
    return leaves;
  }

  /**
   * Count how many leaves under `node` (starting from `basePath`) are in the foundSet.
   * @param {object} node
   * @param {number[]} basePath
   * @param {Set<string>} foundSet - set of path strings
   * @returns {{ found: number, total: number }}
   */
  countFoundLeaves(node, basePath, foundSet) {
    let found = 0;
    let total = 0;
    const stack = [{ node, path: basePath }];
    while (stack.length > 0) {
      const { node: n, path } = stack.pop();
      const children = n.children || [];
      if (children.length === 0) {
        total++;
        if (foundSet.has(path.join(','))) {
          found++;
        }
      } else {
        for (let i = 0; i < children.length; i++) {
          stack.push({ node: children[i], path: [...path, i] });
        }
      }
    }
    return { found, total };
  }
}

