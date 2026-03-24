// ==========================================
// MOB PATHFINDING (A*)
// ==========================================

// ==========================================
// A* GRID PATHFINDER (Minecraft-style)
// ==========================================
// Operates on block-grid coordinates. Checks walkability by testing whether
// a mob of a given width/height can stand at a grid cell, including 1-block
// step-ups (auto-jump), drops, and head clearance.

// --- Node walkability check ---
// Returns the standing Y (top of ground block + 1) if (bx, bz) is walkable
// for a mob with the given dimensions standing near baseY, or -1 if not.
// Allows stepping up 1 block and dropping up to maxDrop blocks.
function _pathNodeY(bx, bz, baseY, mobHeight, maxDrop, maxStepUp) {
    // Search for ground in range [baseY - maxDrop - 1 .. baseY + maxStepUp]
    const searchTop = baseY + maxStepUp;
    const searchBot = baseY - maxDrop - 1;
    const headRoom = Math.ceil(mobHeight); // blocks of vertical clearance needed

    for (let gy = searchTop; gy >= searchBot; gy--) {
        const groundId = getVoxel(bx, gy, bz) & 0xFF;
        // Is this a solid ground block? (same passthrough rules as mob collision)
        if (groundId !== 0 && !isFluidBlock(groundId) && !isCrossBlock(groundId) && groundId !== 17 && groundId !== 23 && groundId !== 64 && groundId !== 66 && groundId !== 90) {
            const standY = gy + 1;
            // Check head clearance above standing position
            let clear = true;
            for (let h = 0; h < headRoom; h++) {
                const aboveId = getVoxel(bx, standY + h, bz) & 0xFF;
                if (aboveId !== 0 && !isFluidBlock(aboveId) && !isCrossBlock(aboveId) && aboveId !== 17 && aboveId !== 23 && aboveId !== 64 && aboveId !== 66 && aboveId !== 90) {
                    clear = false;
                    break;
                }
            }
            if (clear) {
                // Valid: can stand here. Check if the step difference is acceptable.
                const stepDiff = standY - baseY;
                if (stepDiff >= -maxDrop && stepDiff <= maxStepUp) {
                    return standY;
                }
                // Ground found but step too extreme — stop searching lower
                return -1;
            }
            // Ground block found but no head clearance — keep searching lower
        }
    }
    return -1; // No ground found
}

// --- A* pathfinder ---
// Returns an array of {x, y, z} waypoints (block centers) from start to goal,
// or null if no path found. Mob follows these waypoints sequentially.
// maxNodes limits computation to stay realtime-safe.
function findPath(startX, startY, startZ, goalX, goalY, goalZ, mobHeight, maxNodes = 200) {
    const sx = Math.floor(startX), sy = Math.floor(startY), sz = Math.floor(startZ);
    const gx = Math.floor(goalX),  gy = Math.floor(goalY),  gz = Math.floor(goalZ);

    // If start === goal, no path needed
    if (sx === gx && sz === gz && Math.abs(sy - gy) <= 1) return [];

    const MAX_DROP = 3;    // Mobs can fall up to 3 blocks (like MC)
    const MAX_STEP = 1;    // Can step up 1 block

    // Pack (x, z, y) into a single key for the closed set
    // Y range 0-255, X/Z could be large — use string key for simplicity
    const key = (x, y, z) => `${x},${y},${z}`;

    // Min-heap (binary heap) for the open set
    const openSet = [];
    const gScore = new Map();
    const cameFrom = new Map();
    const inOpen = new Set();

    const heuristic = (x, y, z) => {
        // Manhattan distance on XZ + Y penalty
        return Math.abs(x - gx) + Math.abs(z - gz) + Math.abs(y - gy) * 0.5;
    };

    const pushOpen = (x, y, z, g, f) => {
        const k = key(x, y, z);
        openSet.push({ x, y, z, f, k });
        inOpen.add(k);
        gScore.set(k, g);
        // Bubble up
        let i = openSet.length - 1;
        while (i > 0) {
            const parent = (i - 1) >> 1;
            if (openSet[parent].f <= openSet[i].f) break;
            [openSet[parent], openSet[i]] = [openSet[i], openSet[parent]];
            i = parent;
        }
    };

    const popOpen = () => {
        const top = openSet[0];
        const last = openSet.pop();
        if (openSet.length > 0) {
            openSet[0] = last;
            let i = 0;
            while (true) {
                let smallest = i;
                const l = 2 * i + 1, r = 2 * i + 2;
                if (l < openSet.length && openSet[l].f < openSet[smallest].f) smallest = l;
                if (r < openSet.length && openSet[r].f < openSet[smallest].f) smallest = r;
                if (smallest === i) break;
                [openSet[smallest], openSet[i]] = [openSet[i], openSet[smallest]];
                i = smallest;
            }
        }
        inOpen.delete(top.k);
        return top;
    };

    // Seed start node
    const startG = 0;
    const startF = heuristic(sx, sy, sz);
    pushOpen(sx, sy, sz, startG, startF);

    const closedSet = new Set();
    let nodesExplored = 0;

    // 4-directional neighbors (N/S/E/W) — no diagonals, matching MC
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];

    while (openSet.length > 0 && nodesExplored < maxNodes) {
        const current = popOpen();
        const ck = current.k;

        if (closedSet.has(ck)) continue;
        closedSet.add(ck);
        nodesExplored++;

        // Goal reached?
        if (current.x === gx && current.z === gz && Math.abs(current.y - gy) <= 1) {
            // Reconstruct path
            const path = [];
            let pk = ck;
            while (pk && pk !== key(sx, sy, sz)) {
                const [px, py, pz] = pk.split(',').map(Number);
                path.push({ x: px + 0.5, y: py, z: pz + 0.5 });
                pk = cameFrom.get(pk);
            }
            path.reverse();
            return path;
        }

        // Explore neighbors
        for (const [ddx, ddz] of dirs) {
            const nx = current.x + ddx;
            const nz = current.z + ddz;

            // Check walkability at neighbor
            const ny = _pathNodeY(nx, nz, current.y, mobHeight, MAX_DROP, MAX_STEP);
            if (ny < 0) continue;

            const nk = key(nx, ny, nz);
            if (closedSet.has(nk)) continue;

            // Cost: 1 for flat move, 1.5 for step-up (jumping is slower), extra for drops
            const stepDiff = ny - current.y;
            let moveCost = 1.0;
            if (stepDiff > 0) moveCost = 1.5;       // jumping up
            else if (stepDiff < -1) moveCost = 1.2;  // significant drop

            // Hazard penalty: lava or fire near this cell
            for (let dy = -1; dy <= 1; dy++) {
                const hid = getVoxel(nx, ny + dy, nz) & 0xFF;
                if (hid === 27 || hid === 89) { moveCost += 20; break; }
            }

            const ng = (gScore.get(ck) || 0) + moveCost;
            const existingG = gScore.get(nk);
            if (existingG !== undefined && ng >= existingG) continue;

            gScore.set(nk, ng);
            cameFrom.set(nk, ck);
            const nf = ng + heuristic(nx, ny, nz);
            pushOpen(nx, ny, nz, ng, nf);
        }
    }

    return null; // No path found within budget
}

// ==========================================
// MOB NAVIGATION HELPERS (on Mob prototype)