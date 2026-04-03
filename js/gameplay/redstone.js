// ==========================================
// REDSTONE POWER SYSTEM
// ==========================================
// Full MC-style redstone: signal strength 0-15, block power levels,
// strongly/weakly powered blocks, dust propagation with decay.
//
// Block power states (stored in a Map, not voxel data):
//   - Strongly powered: block directly receives power from a source (button, etc.)
//     Strong power passes through to adjacent dust and other components.
//   - Weakly powered: block receives power from redstone dust on top/beside it.
//     Weak power does NOT pass through to other dust (prevents infinite propagation).
//
// Redstone dust (ID 202):
//   - Bits 8-11 (level field): power level 0-15
//   - Connects to adjacent dust and power sources
//   - Signal decays by 1 per block of dust
//
// Wood Button (ID 203):
//   - Bits 8-9: direction (0=+Z, 1=+X, 2=-Z, 3=-X)
//   - Bit 10: pressed state
//   - When pressed: emits power 15 for 1.5 seconds
//   - Strongly powers the block it's attached to

(function() {
    // Map of block positions to power state: key = "x,y,z", value = { strong: 0-15, weak: 0-15 }
    const _blockPower = new Map();
    
    // Active buttons: key = "x,y,z", value = { timer: seconds remaining }
    const _activeButtons = new Map();
    
    // Doors/trapdoors currently held open by redstone power
    const _redstoneDoors = new Set();
    
    // Button sound — uses preloaded wood_button.ogg from sounds.js
    function _playButtonSound(bx, by, bz, pitch) {
        if (typeof window.playNamedSoundAt === 'function') {
            window.playNamedSoundAt('wood_button', 0.8, pitch - 0.05, pitch + 0.05, bx, by, bz);
        }
    }
    
    // ==========================================
    // POWER QUERIES
    // ==========================================
    
    // Get the power level a block is outputting (for dust to read)
    function getBlockPower(x, y, z) {
        const key = x + ',' + y + ',' + z;
        const p = _blockPower.get(key);
        return p ? Math.max(p.strong, p.weak) : 0;
    }
    
    // Get strong power only (for blocks that redstone dust is sitting on/against)
    function getStrongPower(x, y, z) {
        const key = x + ',' + y + ',' + z;
        const p = _blockPower.get(key);
        return p ? p.strong : 0;
    }
    
    // Check if a block is a power source at position
    function isPowerSource(x, y, z) {
        const id = getVoxel(x, y, z) & 0xFF;
        if (id === 203) {
            return ((getVoxel(x, y, z) >> 10) & 0x1) === 1; // Button pressed
        }
        return false;
    }
    
    // Get power output from a source block
    function getSourcePower(x, y, z) {
        const id = getVoxel(x, y, z) & 0xFF;
        if (id === 203 && ((getVoxel(x, y, z) >> 10) & 0x1)) return 15;
        if (id === 205 && ((getVoxel(x, y, z) >> 10) & 0x1)) return 15; // Lever ON
        if (id === 206 && !((getVoxel(x, y, z) >> 12) & 0x1)) return 15; // Redstone Torch ON (bit10=0)
        return 0;
    }
    
    // Get the block a torch is attached to (uses torchLevel direction)
    function getTorchAttachedBlock(x, y, z) {
        const val = getVoxel(x, y, z);
        const level = (val >> 8) & 0xF;
        if (level === 0) return { x: x, y: y - 1, z: z }; // On top of block below
        if (level === 1) return { x: x - 1, y: y, z: z };
        if (level === 2) return { x: x + 1, y: y, z: z };
        if (level === 3) return { x: x, y: y, z: z - 1 };
        if (level === 4) return { x: x, y: y, z: z + 1 };
        return { x: x, y: y - 1, z: z };
    }
    
    // Get the block a button/lever is attached to (same direction system)
    function getAttachedBlock(x, y, z) {
        const val = getVoxel(x, y, z);
        const dir = (val >> 8) & 0x3;
        if (dir === 0) return { x: x, y: y, z: z + 1 };
        if (dir === 1) return { x: x + 1, y: y, z: z };
        if (dir === 2) return { x: x, y: y, z: z - 1 };
        return { x: x - 1, y: y, z: z };
    }
    
    // Legacy alias
    function getButtonAttachedBlock(x, y, z) { return getAttachedBlock(x, y, z); }
    
    // ==========================================
    // POWER PROPAGATION
    // ==========================================
    
    // Full redstone update: recalculate all power levels
    function updateRedstonePower(sourceX, sourceY, sourceZ) {
        // Clear all power
        _blockPower.clear();
        
        // Phase 1: Find all power sources and strongly power attached blocks
        const halfW = WORLD_WIDTH / 2;
        const halfD = WORLD_DEPTH / 2;
        const searchRadius = 16;
        
        // Scan for active buttons
        for (const [key, info] of _activeButtons) {
            const [bx, by, bz] = key.split(',').map(Number);
            const id = getVoxel(bx, by, bz) & 0xFF;
            if (id !== 203) { _activeButtons.delete(key); continue; }
            
            // Strongly power the attached block
            const attached = getAttachedBlock(bx, by, bz);
            const aKey = attached.x + ',' + attached.y + ',' + attached.z;
            const existing = _blockPower.get(aKey) || { strong: 0, weak: 0 };
            existing.strong = 15;
            _blockPower.set(aKey, existing);
        }
        
        // Scan for active levers in search radius
        for (let ldx = -searchRadius; ldx <= searchRadius; ldx++) {
            for (let ldy = -3; ldy <= 3; ldy++) {
                for (let ldz = -searchRadius; ldz <= searchRadius; ldz++) {
                    const lx = sourceX + ldx, ly = sourceY + ldy, lz = sourceZ + ldz;
                    const lval = getVoxel(lx, ly, lz);
                    const lid = lval & 0xFF;
                    if (lid === 205 && ((lval >> 10) & 0x1)) {
                        // Lever is ON — strongly power attached block
                        const attached = getAttachedBlock(lx, ly, lz);
                        const aKey = attached.x + ',' + attached.y + ',' + attached.z;
                        const existing = _blockPower.get(aKey) || { strong: 0, weak: 0 };
                        existing.strong = 15;
                        _blockPower.set(aKey, existing);
                    }
                }
            }
        }
        
        // Phase 1b: Redstone torch inverter logic
        // First pass: collect all redstone torches and check their attached block power
        // A redstone torch turns OFF when its attached block is powered, ON when unpowered
        // We need to do this AFTER buttons/levers set block power
        const torchesToUpdate = [];
        for (let tdx = -searchRadius; tdx <= searchRadius; tdx++) {
            for (let tdy = -3; tdy <= 3; tdy++) {
                for (let tdz = -searchRadius; tdz <= searchRadius; tdz++) {
                    const tx = sourceX + tdx, ty = sourceY + tdy, tz = sourceZ + tdz;
                    const tval = getVoxel(tx, ty, tz);
                    if ((tval & 0xFF) !== 206) continue;
                    
                    const isOff = (tval >> 12) & 0x1;
                    const attached = getTorchAttachedBlock(tx, ty, tz);
                    
                    // Check if attached block is powered (by buttons, levers, or other sources)
                    const attachPower = _blockPower.get(attached.x+','+attached.y+','+attached.z);
                    const attachedIsPowered = attachPower && (attachPower.strong > 0 || attachPower.weak > 0);
                    
                    // Also check if attached block has powered dust adjacent
                    let dustPowersAttached = false;
                    const dn = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
                    for (const [nx,ny,nz] of dn) {
                        const nval2 = getVoxel(attached.x+nx, attached.y+ny, attached.z+nz);
                        if ((nval2 & 0xFF) === 202 && ((nval2 >> 8) & 0xF) > 0) {
                            dustPowersAttached = true; break;
                        }
                    }
                    
                    const shouldBeOff = attachedIsPowered || dustPowersAttached;
                    
                    if (shouldBeOff && !isOff) {
                        // Turn OFF: use falling bit (bit 12) = 1
                        const dir = (tval >> 8) & 0xF;
                        setVoxel(tx, ty, tz, 206, dir, 1); // falling=1 → bit 12
                        pendingBlockUpdates.push({x: tx, y: ty, z: tz});
                        torchesToUpdate.push({x: tx, y: ty, z: tz, on: false});
                    } else if (!shouldBeOff && isOff) {
                        // Turn ON: falling bit = 0
                        const dir = (tval >> 8) & 0xF;
                        setVoxel(tx, ty, tz, 206, dir, 0); // falling=0 → bit 12 clear
                        pendingBlockUpdates.push({x: tx, y: ty, z: tz});
                        torchesToUpdate.push({x: tx, y: ty, z: tz, on: true});
                    }
                }
            }
        }
        
        // Phase 1c: Active redstone torches (ON) strongly power the block they're IN
        // (not the attached block — they power blocks ABOVE and adjacent, not the one they sit on)
        for (let tdx = -searchRadius; tdx <= searchRadius; tdx++) {
            for (let tdy = -3; tdy <= 3; tdy++) {
                for (let tdz = -searchRadius; tdz <= searchRadius; tdz++) {
                    const tx = sourceX + tdx, ty = sourceY + tdy, tz = sourceZ + tdz;
                    const tval = getVoxel(tx, ty, tz);
                    if ((tval & 0xFF) !== 206) continue;
                    if ((tval >> 12) & 0x1) continue; // OFF, skip
                    
                    // Torch is ON — strongly power block directly above (for top-placed torch)
                    // and weakly power all adjacent blocks except the attached one
                    const attached = getTorchAttachedBlock(tx, ty, tz);
                    const neighbors6 = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
                    for (const [nx,ny,nz] of neighbors6) {
                        const ax = tx+nx, ay = ty+ny, az = tz+nz;
                        if (ax === attached.x && ay === attached.y && az === attached.z) continue;
                        const adjKey = ax+','+ay+','+az;
                        const existing = _blockPower.get(adjKey) || { strong: 0, weak: 0 };
                        if (ny === 1) {
                            // Block above gets strongly powered
                            existing.strong = Math.max(existing.strong, 15);
                        } else {
                            existing.weak = Math.max(existing.weak, 15);
                        }
                        _blockPower.set(adjKey, existing);
                    }
                }
            }
        }
        
        // Phase 2: Propagate through redstone dust using BFS
        // Find all dust blocks and set their power based on adjacent strong-powered blocks and other dust
        const dustQueue = []; // { x, y, z, power }
        const dustPower = new Map(); // "x,y,z" → power level
        
        // Seed: dust blocks adjacent to strongly powered blocks
        // We need to find all redstone dust in loaded chunks... 
        // For efficiency, do a local BFS from the source position
        const visited = new Set();
        const bfsQueue = [{ x: sourceX, y: sourceY, z: sourceZ }];
        
        // Expand search area to find all connected dust
        
        // First pass: find all dust blocks in range and their initial power from sources
        const allDust = [];
        for (let dx = -searchRadius; dx <= searchRadius; dx++) {
            for (let dy = -3; dy <= 3; dy++) {
                for (let dz = -searchRadius; dz <= searchRadius; dz++) {
                    const wx = sourceX + dx, wy = sourceY + dy, wz = sourceZ + dz;
                    const id = getVoxel(wx, wy, wz) & 0xFF;
                    if (id === 202) {
                        allDust.push({ x: wx, y: wy, z: wz });
                    }
                }
            }
        }
        
        // Calculate power for each dust block
        // Start by finding dust adjacent to strongly powered blocks
        for (const dust of allDust) {
            const { x, y, z } = dust;
            let maxPower = 0;
            
            // Check all 6 neighbors for strong power sources
            const neighbors = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
            for (const [nx, ny, nz] of neighbors) {
                const adj = getStrongPower(x + nx, y + ny, z + nz);
                if (adj > maxPower) maxPower = adj;
                
                // Also check for direct power sources (buttons, levers, redstone torches)
                const adjId = getVoxel(x + nx, y + ny, z + nz) & 0xFF;
                if ((adjId === 203 || adjId === 205) && ((getVoxel(x + nx, y + ny, z + nz) >> 10) & 0x1)) {
                    maxPower = 15;
                }
                if (adjId === 206 && !((getVoxel(x + nx, y + ny, z + nz) >> 12) & 0x1)) {
                    maxPower = 15;
                }
            }
            
            if (maxPower > 0) {
                dustQueue.push({ x, y, z, power: maxPower });
                dustPower.set(x + ',' + y + ',' + z, maxPower);
            }
        }
        
        // BFS propagation through dust
        while (dustQueue.length > 0) {
            const current = dustQueue.shift();
            const { x, y, z, power } = current;
            
            if (power <= 1) continue; // Signal dies
            
            // Check 4 horizontal neighbors for dust
            const hNeighbors = [[1,0,0],[-1,0,0],[0,0,1],[0,0,-1]];
            for (const [nx, ny, nz] of hNeighbors) {
                const adjX = x + nx, adjY = y, adjZ = z + nz;
                const adjId = getVoxel(adjX, adjY, adjZ) & 0xFF;
                
                if (adjId === 202) {
                    const adjKey = adjX + ',' + adjY + ',' + adjZ;
                    const existing = dustPower.get(adjKey) || 0;
                    const newPower = power - 1;
                    if (newPower > existing) {
                        dustPower.set(adjKey, newPower);
                        dustQueue.push({ x: adjX, y: adjY, z: adjZ, power: newPower });
                    }
                }
                
                // Dust can go up/down 1 block if there's a solid block path
                // Up: dust at (adjX, y+1, adjZ) if block at (adjX, y, adjZ) is solid
                if (adjId !== 0 && adjId !== 202 && !isFluidBlock(adjId)) {
                    const upId = getVoxel(adjX, y + 1, adjZ) & 0xFF;
                    if (upId === 202) {
                        const upKey = adjX + ',' + (y + 1) + ',' + adjZ;
                        const existing = dustPower.get(upKey) || 0;
                        const newPower = power - 1;
                        if (newPower > existing) {
                            dustPower.set(upKey, newPower);
                            dustQueue.push({ x: adjX, y: y + 1, z: adjZ, power: newPower });
                        }
                    }
                }
                
                // Down: dust at (adjX, y-1, adjZ) if block above it (adjX, y, adjZ) is air
                if (adjId === 0 || adjId === 202) {
                    const downId = getVoxel(adjX, y - 1, adjZ) & 0xFF;
                    if (downId === 202) {
                        const downKey = adjX + ',' + (y - 1) + ',' + adjZ;
                        const existing = dustPower.get(downKey) || 0;
                        const newPower = power - 1;
                        if (newPower > existing) {
                            dustPower.set(downKey, newPower);
                            dustQueue.push({ x: adjX, y: y - 1, z: adjZ, power: newPower });
                        }
                    }
                }
            }
        }
        
        // Phase 3: Apply dust power levels to voxel data and weakly power adjacent blocks
        const chunksToUpdate = new Set();
        
        for (const dust of allDust) {
            const { x, y, z } = dust;
            const key = x + ',' + y + ',' + z;
            const power = dustPower.get(key) || 0;
            
            // Update the voxel power level (bits 8-11)
            const currentVal = getVoxel(x, y, z);
            const currentPower = (currentVal >> 8) & 0xF;
            if (currentPower !== power) {
                setVoxel(x, y, z, 202, power);
                // Queue chunk for re-mesh (redstone tint changes)
                const cx = Math.floor((x + WORLD_WIDTH/2) / CHUNK_SIZE);
                const cz = Math.floor((z + WORLD_DEPTH/2) / CHUNK_SIZE);
                chunksToUpdate.add(cx + ',' + cz);
            }
            
            // Weakly power blocks below and beside dust
            if (power > 0) {
                // Block below
                const belowKey = x + ',' + (y - 1) + ',' + z;
                const belowP = _blockPower.get(belowKey) || { strong: 0, weak: 0 };
                belowP.weak = Math.max(belowP.weak, power);
                _blockPower.set(belowKey, belowP);
            }
        }
        
        // Re-mesh affected chunks
        for (const ck of chunksToUpdate) {
            const [cx, cz] = ck.split(',').map(Number);
            if (typeof pendingBlockUpdates !== 'undefined') {
                const wx = cx * CHUNK_SIZE - Math.floor(WORLD_WIDTH/2);
                const wz = cz * CHUNK_SIZE - Math.floor(WORLD_DEPTH/2);
                pendingBlockUpdates.push({ x: wx, y: 0, z: wz });
            }
        }
        
        // Phase 4: Doors/trapdoors reflect adjacent power state
        
        // Check if a door/trapdoor at (dx,dy,dz) is receiving redstone power
        function isDoorPowered(dx, dy, dz) {
            const nb = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
            
            // Check block power at door position itself
            var dk2 = dx+','+dy+','+dz;
            var dp2 = _blockPower.get(dk2);
            if (dp2 && (dp2.strong > 0 || dp2.weak > 0)) return true;
            
            for (var ni = 0; ni < nb.length; ni++) {
                var ax = dx+nb[ni][0], ay = dy+nb[ni][1], az = dz+nb[ni][2];
                var nval = getVoxel(ax, ay, az);
                var nid = nval & 0xFF;
                
                // Direct adjacent power sources
                if (nid === 203 && ((nval >> 10) & 0x1)) return true;
                if (nid === 205 && ((nval >> 10) & 0x1)) return true;
                if (nid === 206 && !((nval >> 12) & 0x1)) return true;
                if (nid === 202 && ((nval >> 8) & 0xF) > 0) return true;
                
                // Strongly powered block (e.g. block that has a lever/button ON it)
                var bk2 = ax+','+ay+','+az;
                var bp2 = _blockPower.get(bk2);
                if (bp2 && bp2.strong > 0) return true;
            }
            return false;
        }
        
        // Helper to toggle a door/trapdoor and its partner half
        function toggleDoor(dx, dy, dz, open) {
            var dval2 = getVoxel(dx, dy, dz);
            var did2 = dval2 & 0xFF;
            var isOpen2 = (dval2 >> 10) & 0x1;
            if ((open && isOpen2) || (!open && !isOpen2)) return; // Already in desired state
            
            setVoxel(dx, dy, dz, dval2 ^ (1 << 10));
            pendingBlockUpdates.push({x:dx, y:dy, z:dz});
            
            if (did2 === 149) {
                var isTop2 = (dval2 >> 11) & 0x1;
                var oy2 = isTop2 ? dy-1 : dy+1;
                var ov2 = getVoxel(dx, oy2, dz);
                if ((ov2 & 0xFF) === 149) {
                    setVoxel(dx, oy2, dz, ov2 ^ (1 << 10));
                    pendingBlockUpdates.push({x:dx, y:oy2, z:dz});
                }
            }
            if (typeof window.playDoorSound === 'function') window.playDoorSound(open, dx, dy, dz);
        }
        
        // Scan for all doors/trapdoors in the search area
        for (var ddx2 = -searchRadius; ddx2 <= searchRadius; ddx2++) {
            for (var ddy2 = -3; ddy2 <= 3; ddy2++) {
                for (var ddz2 = -searchRadius; ddz2 <= searchRadius; ddz2++) {
                    var dx3 = sourceX + ddx2, dy3 = sourceY + ddy2, dz3 = sourceZ + ddz2;
                    var dval3 = getVoxel(dx3, dy3, dz3);
                    var did3 = dval3 & 0xFF;
                    if (did3 !== 149 && did3 !== 150) continue;
                    
                    var doorKey3 = dx3+','+dy3+','+dz3;
                    var powered3 = isDoorPowered(dx3, dy3, dz3);
                    
                    if (powered3 && !_redstoneDoors.has(doorKey3)) {
                        // Power just arrived — open the door and track it
                        _redstoneDoors.add(doorKey3);
                        toggleDoor(dx3, dy3, dz3, true);
                    } else if (powered3 && _redstoneDoors.has(doorKey3)) {
                        // Still powered — keep tracking, ensure open
                        var isStillOpen = (getVoxel(dx3,dy3,dz3) >> 10) & 0x1;
                        if (!isStillOpen) toggleDoor(dx3, dy3, dz3, true);
                    } else if (!powered3 && _redstoneDoors.has(doorKey3)) {
                        // Power removed — close the door
                        _redstoneDoors.delete(doorKey3);
                        toggleDoor(dx3, dy3, dz3, false);
                    }
                    // !powered && !tracked = manually controlled, ignore
                }
            }
        }
    }
    
    // ==========================================
    // BUTTON INTERACTION
    // ==========================================
    
    function pressButton(x, y, z) {
        const val = getVoxel(x, y, z);
        const id = val & 0xFF;
        if (id !== 203) return;
        
        const dir = (val >> 8) & 0x3;
        const alreadyPressed = (val >> 10) & 0x1;
        if (alreadyPressed) return; // Already pressed
        
        // Set pressed state (bit 10 = 1)
        setVoxel(x, y, z, 203, dir | (1 << 2));
        
        // Register active button with 1.5 second timer
        const key = x + ',' + y + ',' + z;
        _activeButtons.set(key, { timer: 1.5 });
        
        // Play button click sound
        _playButtonSound(x, y, z, 1.0);
        
        // Update redstone power
        updateRedstonePower(x, y, z);
        updatePistons(x, y, z);
        
        // Update chunk mesh
        pendingBlockUpdates.push({ x, y, z });
    }
    
    function releaseButton(x, y, z) {
        const val = getVoxel(x, y, z);
        const id = val & 0xFF;
        if (id !== 203) return;
        
        const dir = (val >> 8) & 0x3;
        
        // Clear pressed state
        setVoxel(x, y, z, 203, dir);
        
        // Remove from active buttons
        _activeButtons.delete(x + ',' + y + ',' + z);
        
        // Play button release sound (lower pitch)
        _playButtonSound(x, y, z, 0.8);
        
        // Update redstone power
        updateRedstonePower(x, y, z);
        updatePistons(x, y, z);
        
        // Update chunk mesh
        pendingBlockUpdates.push({ x, y, z });
    }
    
    // ==========================================
    // TICK — update button timers
    // ==========================================
    
    function tickRedstone(dt) {
        for (const [key, info] of _activeButtons) {
            info.timer -= dt;
            if (info.timer <= 0) {
                const [bx, by, bz] = key.split(',').map(Number);
                releaseButton(bx, by, bz);
            }
        }
    }
    
    // ==========================================
    // LEVER INTERACTION
    // ==========================================
    
    function toggleLever(x, y, z) {
        const val = getVoxel(x, y, z);
        if ((val & 0xFF) !== 205) return;
        const dir = (val >> 8) & 0x3;
        const isOn = (val >> 10) & 0x1;
        // Toggle: flip bit 10
        setVoxel(x, y, z, 205, dir | ((isOn ? 0 : 1) << 2));
        _playButtonSound(x, y, z, isOn ? 0.8 : 1.0);
        updateRedstonePower(x, y, z);
        updatePistons(x, y, z);
        pendingBlockUpdates.push({ x, y, z });
    }
    
    // ==========================================
    // PISTON MECHANICS
    // ==========================================
    
    const PISTON_MAX_PUSH = 12;
    const _immovable = new Set([18, 28, 54, 60, 69, 93, 201]); // bedrock, obsidian, spawner, structure, chests, enchanting table
    
    // Blocks that get broken (not pushed) by pistons - drop their items
    function _isBreakableByPiston(id) {
        if (id === 0) return false;
        if (typeof isCrossBlock === 'function' && isCrossBlock(id)) return true;
        if (id === 17 || id === 206) return true;
        if (id === 202 || id === 203 || id === 205) return true;
        if (id === 64 || id === 52 || id === 66 || id === 67 || id === 40 || id === 89) return true;
        if (id === 20) return true;
        if (id === 149 || id === 150) return true; // doors, trapdoors
        return false;
    }
    
    function canPistonPush(id) {
        if (id === 0) return true; // air
        if (_immovable.has(id)) return false;
        if (_isBreakableByPiston(id)) return true; // will be broken, not pushed
        if (id === 207 || id === 208) return true; // pistons (check extended separately)
        return true;
    }
    
    function _breakBlockByPiston(bx, by, bz) {
        var bval = getVoxel(bx, by, bz);
        var bid = bval & 0xFF;
        if (bid === 0) return;
        // Spawn drops
        if (typeof window.spawnBlockDrops === 'function') {
            window.spawnBlockDrops(bid, bx, by, bz, bval);
        }
        // Spawn particles
        if (typeof spawnParticles === 'function') spawnParticles(bx, by, bz, bid);
        // Clear block
        setVoxel(bx, by, bz, 0);
        pendingBlockUpdates.push({x: bx, y: by, z: bz});
        if (typeof queueNeighbors === 'function') queueNeighbors(bx, by, bz);
        
        // Door: also break the other half
        if (bid === 149) {
            var isTop = (bval >> 11) & 0x1;
            var otherY = isTop ? by - 1 : by + 1;
            var otherVal = getVoxel(bx, otherY, bz);
            if ((otherVal & 0xFF) === 149) {
                if (typeof spawnParticles === 'function') spawnParticles(bx, otherY, bz, 149);
                setVoxel(bx, otherY, bz, 0);
                pendingBlockUpdates.push({x: bx, y: otherY, z: bz});
                if (typeof queueNeighbors === 'function') queueNeighbors(bx, otherY, bz);
            }
        }
    }
    
    function isPistonPowered(x, y, z) {
        // Check all 6 neighbors for power sources, strongly powered blocks, dust, etc.
        const nb = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
        
        // Check block power at piston position
        const pk = x+','+y+','+z;
        const pp = _blockPower.get(pk);
        if (pp && (pp.strong > 0 || pp.weak > 0)) return true;
        
        for (const [nx,ny,nz] of nb) {
            const ax = x+nx, ay = y+ny, az = z+nz;
            const nval = getVoxel(ax, ay, az);
            const nid = nval & 0xFF;
            
            if (nid === 203 && ((nval >> 10) & 0x1)) return true;
            if (nid === 205 && ((nval >> 10) & 0x1)) return true;
            if (nid === 206 && !((nval >> 12) & 0x1)) return true;
            if (nid === 202 && ((nval >> 8) & 0xF) > 0) return true;
            
            const bk = ax+','+ay+','+az;
            const bp = _blockPower.get(bk);
            if (bp && bp.strong > 0) return true;
        }
        return false;
    }
    
    function tryExtendPiston(x, y, z) {
        const val = getVoxel(x, y, z);
        const id = val & 0xFF;
        if (id !== 207 && id !== 208) return;
        const dir = (val >> 8) & 0x7;
        const extended = (val >> 11) & 0x1;
        if (extended) return;
        
        const dvs = [[0,-1,0],[0,1,0],[0,0,-1],[0,0,1],[-1,0,0],[1,0,0]];
        const dv = dvs[dir];
        
        // Check the block in front - must be air or pushable
        const fx = x+dv[0], fy = y+dv[1], fz = z+dv[2];
        const frontVal = getVoxel(fx, fy, fz);
        const frontId = frontVal & 0xFF;
        
        // Scan forward from the front position for blocks to push
        const blocksToPush = [];
        const blocksToBreak = [];
        if (frontId !== 0) {
            for (let i = 0; i <= 12; i++) {
                const cx = fx + dv[0]*i, cy = fy + dv[1]*i, cz = fz + dv[2]*i;
                const cv = getVoxel(cx, cy, cz);
                const cid = cv & 0xFF;
                if (cid === 0) break; // Air - can push here
                if (_immovable.has(cid)) return; // Immovable - can't extend
                if ((cid === 207 || cid === 208) && ((cv >> 11) & 0x1)) return; // Extended piston
                if (_isBreakableByPiston(cid)) {
                    // Break this block, don't push it, and stop scanning (air behind it)
                    blocksToBreak.push({x: cx, y: cy, z: cz});
                    break;
                }
                blocksToPush.push({x: cx, y: cy, z: cz, val: cv});
                if (blocksToPush.length > 12) return; // Too many
            }
        }
        
        // Break non-solid blocks first
        for (const bb of blocksToBreak) {
            _breakBlockByPiston(bb.x, bb.y, bb.z);
        }
        
        // Move blocks from furthest to nearest
        for (let i = blocksToPush.length - 1; i >= 0; i--) {
            const b = blocksToPush[i];
            const nx2 = b.x+dv[0], ny2 = b.y+dv[1], nz2 = b.z+dv[2];
            // Copy full voxel data
            setVoxel(nx2, ny2, nz2, b.val & 0xFF, (b.val >> 8) & 0xF, (b.val >> 12) & 0x1, (b.val >> 13) & 0x1);
            pendingBlockUpdates.push({x: nx2, y: ny2, z: nz2});
            if (typeof queueNeighbors === 'function') queueNeighbors(nx2, ny2, nz2);
        }
        
        // Clear the block immediately in front (the head now occupies this space visually but not as a block)
        if (frontId !== 0 && blocksToPush.length > 0) {
            // The first block was pushed, space is now clear
        } else if (frontId === 0) {
            // Already air, nothing to do
        }
        // Make sure front space is air (head protrudes into it but it's not a block)
        setVoxel(fx, fy, fz, 0);
        pendingBlockUpdates.push({x: fx, y: fy, z: fz});
        
        // Mark piston as extended
        setVoxel(x, y, z, id, dir | (1 << 3));
        pendingBlockUpdates.push({x: x, y: y, z: z});
        if (typeof queueNeighbors === 'function') { queueNeighbors(x, y, z); queueNeighbors(fx, fy, fz); }
        
        if (typeof window.playNamedSoundAt === 'function') window.playNamedSoundAt('piston_push', 0.5, 0.9, 1.1, x, y, z);
    }
    
    function tryRetractPiston(x, y, z) {
        const val = getVoxel(x, y, z);
        const id = val & 0xFF;
        if (id !== 207 && id !== 208) return;
        const dir = (val >> 8) & 0x7;
        const extended = (val >> 11) & 0x1;
        if (!extended) return;
        
        const isSticky = (id === 208);
        const dvs = [[0,-1,0],[0,1,0],[0,0,-1],[0,0,1],[-1,0,0],[1,0,0]];
        const dv = dvs[dir];
        
        // The space in front should be air (head was there visually)
        const fx = x+dv[0], fy = y+dv[1], fz = z+dv[2];
        
        // Sticky piston: pull the block from 2 spaces ahead back to 1 space ahead
        if (isSticky) {
            const px2 = fx+dv[0], py2 = fy+dv[1], pz2 = fz+dv[2];
            const pullVal = getVoxel(px2, py2, pz2);
            const pullId = pullVal & 0xFF;
            if (pullId !== 0 && pullId !== 18 && pullId !== 28 && !_isBreakableByPiston(pullId)) {
                // Pull block back
                setVoxel(fx, fy, fz, pullVal & 0xFF, (pullVal >> 8) & 0xF, (pullVal >> 12) & 0x1, (pullVal >> 13) & 0x1);
                setVoxel(px2, py2, pz2, 0);
                pendingBlockUpdates.push({x: fx, y: fy, z: fz});
                pendingBlockUpdates.push({x: px2, y: py2, z: pz2});
                if (typeof queueNeighbors === 'function') { queueNeighbors(fx, fy, fz); queueNeighbors(px2, py2, pz2); }
            }
        }
        
        // Mark piston as retracted
        setVoxel(x, y, z, id, dir);
        pendingBlockUpdates.push({x: x, y: y, z: z});
        if (typeof queueNeighbors === 'function') queueNeighbors(x, y, z);
        
        if (typeof window.playNamedSoundAt === 'function') window.playNamedSoundAt('piston_pull', 0.5, 0.9, 1.1, x, y, z);
    }

    // Check pistons in the area during redstone updates
    function updatePistons(sourceX, sourceY, sourceZ) {
        const r = 16;
        for (let dx = -r; dx <= r; dx++) {
            for (let dy = -3; dy <= 3; dy++) {
                for (let dz = -r; dz <= r; dz++) {
                    const px2 = sourceX+dx, py2 = sourceY+dy, pz2 = sourceZ+dz;
                    const pv = getVoxel(px2, py2, pz2);
                    const pid = pv & 0xFF;
                    if (pid !== 207 && pid !== 208) continue;
                    
                    const powered = isPistonPowered(px2, py2, pz2);
                    const ext = (pv >> 11) & 0x1;
                    
                    if (powered && !ext) {
                        tryExtendPiston(px2, py2, pz2);
                    } else if (!powered && ext) {
                        tryRetractPiston(px2, py2, pz2);
                    }
                }
            }
        }
    }
    
    // ==========================================
    // BLOCK BREAK / PLACE HOOKS
    // ==========================================
    
    function onRedstoneBlockChanged(x, y, z) {
        updateRedstonePower(x, y, z);
        updatePistons(x, y, z);
    }
    
    // ==========================================
    // EXPORTS
    // ==========================================
    
    window.pressButton = pressButton;
    window.toggleLever = toggleLever;
    window.tickRedstone = tickRedstone;
    window.onRedstoneBlockChanged = onRedstoneBlockChanged;
    window.getBlockPower = getBlockPower;
    window.getStrongPower = getStrongPower;
    window.updateRedstonePower = updateRedstonePower;
    window.updatePistons = updatePistons;
    window.tryExtendPiston = tryExtendPiston;
    window.tryRetractPiston = tryRetractPiston;
    window._activeButtons = _activeButtons;
})();
