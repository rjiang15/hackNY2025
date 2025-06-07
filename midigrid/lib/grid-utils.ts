import type { GridCell } from "@/types/grid"

// Create an empty grid with the specified dimensions
export function createEmptyGrid(rows: number, cols: number, notes: string[]): GridCell[][] {
  const grid: GridCell[][] = []

  for (let y = 0; y < rows; y++) {
    const row: GridCell[] = []
    for (let x = 0; x < cols; x++) {
      row.push({
        active: false,
        note: notes[y],
        velocity: 100,
      })
    }
    grid.push(row)
  }

  return grid
}

// Apply Conway's Game of Life rules to the grid (optimized for larger grids)
export function applyGameOfLife(grid: GridCell[][]): GridCell[][] {
  const rows = grid.length
  const cols = grid[0].length
  const newGrid = createEmptyGrid(
    rows,
    cols,
    grid.map((row) => row[0].note),
  )

  // Process in chunks for better performance on large grids
  const chunkSize = 1000

  for (let chunkStart = 0; chunkStart < rows * cols; chunkStart += chunkSize) {
    const chunkEnd = Math.min(chunkStart + chunkSize, rows * cols)

    for (let i = chunkStart; i < chunkEnd; i++) {
      const y = Math.floor(i / cols)
      const x = i % cols

      const neighbors = countNeighbors(grid, x, y)
      const cell = grid[y][x]

      // Apply Conway's Game of Life rules
      if (cell.active) {
        // Any live cell with 2 or 3 live neighbors survives
        newGrid[y][x].active = neighbors === 2 || neighbors === 3
      } else {
        // Any dead cell with exactly 3 live neighbors becomes alive
        newGrid[y][x].active = neighbors === 3
      }

      // Preserve the note and velocity
      newGrid[y][x].note = cell.note
      newGrid[y][x].velocity = cell.velocity
    }
  }

  return newGrid
}

// Count the number of active neighbors for a cell
function countNeighbors(grid: GridCell[][], x: number, y: number): number {
  const rows = grid.length
  const cols = grid[0].length
  let count = 0

  for (let i = -1; i <= 1; i++) {
    for (let j = -1; j <= 1; j++) {
      if (i === 0 && j === 0) continue

      const newY = (y + i + rows) % rows
      const newX = (x + j + cols) % cols

      if (grid[newY][newX].active) count++
    }
  }

  return count
}
