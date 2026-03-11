/**
 * GobanRenderer - draws a Go board on a Canvas element
 * Handles stones, grid lines, star points, labels, marks, and last-move indicator
 */
export default class GobanRenderer {
  constructor(canvas, boardSize = 19) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.boardSize = boardSize;

    // Sizing
    this.cellSize = 30;
    this.padding = 28;
    this.stoneRadius = this.cellSize * 0.46;

    const totalSize = this.padding * 2 + this.cellSize * (this.boardSize - 1);
    this.canvas.width = totalSize;
    this.canvas.height = totalSize;
    this.canvas.style.width = `${totalSize}px`;
    this.canvas.style.height = `${totalSize}px`;

    // Colors
    this.colors = {
      board: '#dcb35c',
      line: '#444',
      starPoint: '#444',
      blackStone: '#111',
      whiteStone: '#f5f5f0',
      whiteStoneBorder: '#888',
      labelOnBlack: '#eee',
      labelOnWhite: '#222',
      labelOnBoard: '#222',
      lastMoveIndicator: '#e94560',
      markColor: '#e94560',
      ghostBlack: 'rgba(0,0,0,0.3)',
      ghostWhite: 'rgba(255,255,255,0.3)',
    };

    // Click handler
    this.onIntersectionClick = null;
    this.canvas.addEventListener('click', (e) => this._handleClick(e));

    // Hover tracking for ghost stone
    this.hoverPos = null;
    this.canvas.addEventListener('mousemove', (e) => this._handleMouseMove(e));
    this.canvas.addEventListener('mouseleave', () => {
      this.hoverPos = null;
    });
  }

  _coordToPixel(x, y) {
    return {
      px: this.padding + x * this.cellSize,
      py: this.padding + y * this.cellSize,
    };
  }

  _pixelToCoord(px, py) {
    const x = Math.round((px - this.padding) / this.cellSize);
    const y = Math.round((py - this.padding) / this.cellSize);
    if (x >= 0 && x < this.boardSize && y >= 0 && y < this.boardSize) {
      return { x, y };
    }
    return null;
  }

  _handleClick(e) {
    const rect = this.canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const coord = this._pixelToCoord(px, py);
    if (coord && this.onIntersectionClick) {
      this.onIntersectionClick(coord.x, coord.y);
    }
  }

  _handleMouseMove(e) {
    const rect = this.canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    this.hoverPos = this._pixelToCoord(px, py);
  }

  /**
   * Render the full board
   * @param {number[][]} boardState - 2D array (0=empty, 1=black, 2=white)
   * @param {object} info - { labels, marks, move (last move) }
   */
  render(boardState, info = {}) {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    // Store board state for use in sub-methods
    this._currentBoardState = boardState;

    // Clear and draw board background
    ctx.fillStyle = this.colors.board;
    ctx.fillRect(0, 0, w, h);

    this._drawGrid();
    this._drawStarPoints();
    this._drawCoordinates();
    this._drawStones(boardState);

    if (info.move && !info.move.pass) {
      this._drawLastMoveIndicator(info.move.x, info.move.y);
    }

    if (info.labels && info.labels.length > 0) {
      this._drawLabels(info.labels, boardState);
    }

    if (info.marks && info.marks.length > 0) {
      this._drawMarks(info.marks, boardState);
    }
  }

  _drawGrid() {
    const ctx = this.ctx;
    ctx.strokeStyle = this.colors.line;
    ctx.lineWidth = 1;

    for (let i = 0; i < this.boardSize; i++) {
      const { px: x1, py: y1 } = this._coordToPixel(i, 0);
      const { px: x2, py: y2 } = this._coordToPixel(i, this.boardSize - 1);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      const { px: hx1, py: hy1 } = this._coordToPixel(0, i);
      const { px: hx2, py: hy2 } = this._coordToPixel(this.boardSize - 1, i);
      ctx.beginPath();
      ctx.moveTo(hx1, hy1);
      ctx.lineTo(hx2, hy2);
      ctx.stroke();
    }
  }

  _drawStarPoints() {
    const ctx = this.ctx;
    const stars = this._getStarPoints();

    ctx.fillStyle = this.colors.starPoint;
    for (const [x, y] of stars) {
      const { px, py } = this._coordToPixel(x, y);
      ctx.beginPath();
      ctx.arc(px, py, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  _getStarPoints() {
    if (this.boardSize === 19) {
      return [
        [3, 3], [9, 3], [15, 3],
        [3, 9], [9, 9], [15, 9],
        [3, 15], [9, 15], [15, 15],
      ];
    }
    if (this.boardSize === 13) {
      return [[3, 3], [9, 3], [6, 6], [3, 9], [9, 9]];
    }
    if (this.boardSize === 9) {
      return [[2, 2], [6, 2], [4, 4], [2, 6], [6, 6]];
    }
    return [];
  }

  _drawCoordinates() {
    const ctx = this.ctx;
    const letters = 'ABCDEFGHJKLMNOPQRST';
    ctx.fillStyle = '#666';
    ctx.font = `${Math.round(this.cellSize * 0.35)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let i = 0; i < this.boardSize; i++) {
      // Top
      const { px: tx } = this._coordToPixel(i, 0);
      ctx.fillText(letters[i], tx, this.padding - 16);
      // Bottom
      const { px: bx } = this._coordToPixel(i, this.boardSize - 1);
      ctx.fillText(letters[i], bx, this.padding + this.cellSize * (this.boardSize - 1) + 16);
      // Left
      const { py: ly } = this._coordToPixel(0, i);
      ctx.fillText(`${this.boardSize - i}`, this.padding - 18, ly);
      // Right
      const { py: ry } = this._coordToPixel(this.boardSize - 1, i);
      ctx.fillText(`${this.boardSize - i}`, this.padding + this.cellSize * (this.boardSize - 1) + 18, ry);
    }
  }

  _drawStones(boardState) {
    const ctx = this.ctx;

    for (let y = 0; y < this.boardSize; y++) {
      for (let x = 0; x < this.boardSize; x++) {
        const stone = boardState[y][x];
        if (stone === 0) continue;

        const { px, py } = this._coordToPixel(x, y);

        if (stone === 1) {
          // Black stone with gradient
          const grad = ctx.createRadialGradient(px - 3, py - 3, 2, px, py, this.stoneRadius);
          grad.addColorStop(0, '#555');
          grad.addColorStop(1, '#111');
          ctx.beginPath();
          ctx.arc(px, py, this.stoneRadius, 0, Math.PI * 2);
          ctx.fillStyle = grad;
          ctx.fill();
        } else if (stone === 2) {
          // White stone with gradient
          const grad = ctx.createRadialGradient(px - 3, py - 3, 2, px, py, this.stoneRadius);
          grad.addColorStop(0, '#fff');
          grad.addColorStop(1, '#ccc');
          ctx.beginPath();
          ctx.arc(px, py, this.stoneRadius, 0, Math.PI * 2);
          ctx.fillStyle = grad;
          ctx.fill();
          ctx.strokeStyle = this.colors.whiteStoneBorder;
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
    }
  }

  _drawLastMoveIndicator(x, y) {
    const ctx = this.ctx;
    const { px, py } = this._coordToPixel(x, y);
    const board = this._currentBoardState;
    const stone = board ? board[y][x] : 0;

    ctx.beginPath();
    ctx.arc(px, py, this.stoneRadius * 0.35, 0, Math.PI * 2);
    ctx.strokeStyle = stone === 1 ? '#fff' : this.colors.lastMoveIndicator;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  _drawLabels(labels, boardState) {
    const ctx = this.ctx;
    this._currentBoardState = boardState;

    for (const { x, y, text } of labels) {
      if (x < 0 || y < 0 || x >= this.boardSize || y >= this.boardSize) continue;

      const { px, py } = this._coordToPixel(x, y);
      const stone = boardState[y][x];

      // Draw background circle to make label readable
      if (stone === 0) {
        ctx.fillStyle = this.colors.board;
        ctx.beginPath();
        ctx.arc(px, py, this.cellSize * 0.38, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.font = `bold ${Math.round(this.cellSize * 0.45)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      if (stone === 1) {
        ctx.fillStyle = this.colors.labelOnBlack;
      } else if (stone === 2) {
        ctx.fillStyle = this.colors.labelOnWhite;
      } else {
        ctx.fillStyle = this.colors.labelOnBoard;
      }

      ctx.fillText(text, px, py + 1);
    }
  }

  _drawMarks(marks, boardState) {
    const ctx = this.ctx;
    const r = this.stoneRadius * 0.45;

    for (const { x, y, type } of marks) {
      if (x < 0 || y < 0 || x >= this.boardSize || y >= this.boardSize) continue;

      const { px, py } = this._coordToPixel(x, y);
      const stone = boardState[y][x];
      ctx.strokeStyle = stone === 1 ? '#fff' : this.colors.markColor;
      ctx.fillStyle = stone === 1 ? '#fff' : this.colors.markColor;
      ctx.lineWidth = 2;

      switch (type) {
        case 'triangle':
          ctx.beginPath();
          ctx.moveTo(px, py - r);
          ctx.lineTo(px - r * 0.87, py + r * 0.5);
          ctx.lineTo(px + r * 0.87, py + r * 0.5);
          ctx.closePath();
          ctx.stroke();
          break;

        case 'square':
          ctx.strokeRect(px - r * 0.7, py - r * 0.7, r * 1.4, r * 1.4);
          break;

        case 'circle':
          ctx.beginPath();
          ctx.arc(px, py, r, 0, Math.PI * 2);
          ctx.stroke();
          break;

        case 'cross':
          ctx.beginPath();
          ctx.moveTo(px - r, py - r);
          ctx.lineTo(px + r, py + r);
          ctx.moveTo(px + r, py - r);
          ctx.lineTo(px - r, py + r);
          ctx.stroke();
          break;
      }
    }
  }
}

