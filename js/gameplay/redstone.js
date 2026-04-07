// ==========================================
// REDSTONE POWER SYSTEM — TICK-BASED
// ==========================================
// Signal propagates 1 dust block per redstone tick (2 game ticks = 0.1s).
// Sources (buttons, levers, torches) set adjacent dust immediately,
// then each tick propagates one more hop outward.
// Pistons/doors check power each tick as dust reaches them.

(function() {
    const _blockPower = new Map();
    const _activeButtons = new Map();
    const _redstoneDoors = new Set();

    // Tick system
    const REDSTONE_TICK_RATE = 0.03; // 20 ticks/sec like MC
    let _tickAccum = 0;

    // Scheduled block updates: { x, y, z, tick } — process at the given tick number
    const _scheduledUpdates = [];
    let _rsTick = 0;

    // Track which positions already have a scheduled update to avoid duplicates
    const _scheduled = new Set();

    function _playButtonSound(bx, by, bz, pitch) {
        if (typeof window.playNamedSoundAt === 'function')
            window.playNamedSoundAt('wood_button', 0.8, pitch - 0.05, pitch + 0.05, bx, by, bz);
    }

    // ==========================================
    // POWER QUERIES
    // ==========================================
    function getBlockPower(x, y, z) {
        const p = _blockPower.get(x+','+y+','+z);
        return p ? Math.max(p.strong, p.weak) : 0;
    }
    function getStrongPower(x, y, z) {
        const p = _blockPower.get(x+','+y+','+z);
        return p ? p.strong : 0;
    }

    function getAttachedBlock(x, y, z) {
        const dir = (getVoxel(x,y,z) >> 8) & 0x3;
        if (dir === 0) return {x, y, z: z-1};
        if (dir === 1) return {x: x-1, y, z};
        if (dir === 2) return {x, y, z: z+1};
        if (dir === 3) return {x: x+1, y, z};
        return {x, y: y-1, z};
    }
    function getTorchAttachedBlock(x, y, z) {
        const level = (getVoxel(x,y,z) >> 8) & 0xF;
        if (level === 0) return {x, y: y-1, z};
        if (level === 1) return {x: x-1, y, z};
        if (level === 2) return {x: x+1, y, z};
        if (level === 3) return {x, y, z: z-1};
        if (level === 4) return {x, y, z: z+1};
        return {x, y: y-1, z};
    }

    const DIRS6 = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
    const DIRS4H = [[1,0,0],[-1,0,0],[0,0,1],[0,0,-1]];

    // ==========================================
    // COMPUTE SOURCE POWER FOR A DUST BLOCK
    // ==========================================
    // Returns the power a dust at (x,y,z) should have from direct sources only
    function _getDirectSourcePower(x, y, z) {
        let maxPower = 0;
        for (const [nx,ny,nz] of DIRS6) {
            const ax = x+nx, ay = y+ny, az = z+nz;
            const aval = getVoxel(ax, ay, az);
            const aid = aval & 0xFF;
            // Button pressed
            if (aid === 203 && ((aval >> 10) & 0x1)) maxPower = 15;
            // Lever on
            if (aid === 205 && ((aval >> 10) & 0x1)) maxPower = 15;
            // Redstone torch on
            if (aid === 206 && !((aval >> 12) & 0x1)) maxPower = 15;
            // Strongly powered block
            const sp = getStrongPower(ax, ay, az);
            if (sp > maxPower) maxPower = sp;
        }
        return maxPower;
    }

    // Get power a dust should have from adjacent dust (max neighbor - 1)
    function _getAdjacentDustPower(x, y, z) {
        let maxPower = 0;
        for (const [nx, _, nz] of DIRS4H) {
            const adjX = x+nx, adjZ = z+nz;
            const adjId = getVoxel(adjX, y, adjZ) & 0xFF;
            // Same level
            if (adjId === 202) {
                const p = (getVoxel(adjX, y, adjZ) >> 8) & 0xF;
                if (p - 1 > maxPower) maxPower = p - 1;
            }
            // Up ramp
            if (adjId !== 0 && adjId !== 202 && !isFluidBlock(adjId)) {
                if ((getVoxel(adjX, y+1, adjZ) & 0xFF) === 202) {
                    const p = (getVoxel(adjX, y+1, adjZ) >> 8) & 0xF;
                    if (p - 1 > maxPower) maxPower = p - 1;
                }
            }
            // Down ramp
            if (adjId === 0 || adjId === 202) {
                if ((getVoxel(adjX, y-1, adjZ) & 0xFF) === 202) {
                    const p = (getVoxel(adjX, y-1, adjZ) >> 8) & 0xF;
                    if (p - 1 > maxPower) maxPower = p - 1;
                }
            }
        }
        return Math.max(0, maxPower);
    }

    // Get all dust neighbor positions
    function _getDustNeighbors(x, y, z) {
        const result = [];
        for (const [nx, _, nz] of DIRS4H) {
            const adjX = x+nx, adjZ = z+nz;
            const adjId = getVoxel(adjX, y, adjZ) & 0xFF;
            if (adjId === 202) result.push({x: adjX, y, z: adjZ});
            if (adjId !== 0 && adjId !== 202 && !isFluidBlock(adjId)) {
                if ((getVoxel(adjX, y+1, adjZ) & 0xFF) === 202) result.push({x: adjX, y: y+1, z: adjZ});
            }
            if (adjId === 0 || adjId === 202) {
                if ((getVoxel(adjX, y-1, adjZ) & 0xFF) === 202) result.push({x: adjX, y: y-1, z: adjZ});
            }
        }
        return result;
    }

    // Schedule a dust block for update on the next tick
    function _scheduleUpdate(x, y, z, delay) {
        const key = x+','+y+','+z;
        if (_scheduled.has(key)) return;
        _scheduled.add(key);
        _scheduledUpdates.push({x, y, z, tick: _rsTick + (delay || 1)});
    }

    // Schedule all dust neighbors for update
    function _scheduleNeighborDust(x, y, z) {
        for (const n of _getDustNeighbors(x, y, z)) {
            _scheduleUpdate(n.x, n.y, n.z, 1);
        }
    }

    // ==========================================
    // UPDATE SOURCES — sets block power from buttons/levers/torches
    // ==========================================
    function _updateSources(sourceX, sourceY, sourceZ) {
        _blockPower.clear();
        const R = 16;

        // Buttons
        // Buttons — power adjacent blocks in all directions when pressed
        for (const [key, info] of _activeButtons) {
            const [bx,by,bz] = key.split(',').map(Number);
            if ((getVoxel(bx,by,bz) & 0xFF) !== 203) { _activeButtons.delete(key); continue; }
            for (const [ddx,ddy,ddz] of DIRS6) {
                const ax = bx+ddx, ay = by+ddy, az = bz+ddz;
                const aid = getVoxel(ax,ay,az) & 0xFF;
                if (aid !== 0 && aid !== 202 && !isFluidBlock(aid)) {
                    const ak = ax+','+ay+','+az;
                    const ex = _blockPower.get(ak) || {strong:0, weak:0};
                    ex.strong = Math.max(ex.strong, 15);
                    _blockPower.set(ak, ex);
                }
            }
        }

        // Levers — power adjacent blocks in all directions when on
        for (let dx=-R;dx<=R;dx++) for (let dy=-3;dy<=3;dy++) for (let dz=-R;dz<=R;dz++) {
            const lx=sourceX+dx, ly=sourceY+dy, lz=sourceZ+dz;
            const lv=getVoxel(lx,ly,lz);
            if ((lv&0xFF)===205 && ((lv>>10)&0x1)) {
                for (const [ddx,ddy,ddz] of DIRS6) {
                    const ax = lx+ddx, ay = ly+ddy, az = lz+ddz;
                    const aid = getVoxel(ax,ay,az) & 0xFF;
                    if (aid !== 0 && aid !== 202 && !isFluidBlock(aid)) {
                        const ak = ax+','+ay+','+az;
                        const ex = _blockPower.get(ak) || {strong:0, weak:0};
                        ex.strong = Math.max(ex.strong, 15);
                        _blockPower.set(ak, ex);
                    }
                }
            }
        }

        // Torch inverter
        for (let dx=-R;dx<=R;dx++) for (let dy=-3;dy<=3;dy++) for (let dz=-R;dz<=R;dz++) {
            const tx=sourceX+dx, ty=sourceY+dy, tz=sourceZ+dz;
            const tv=getVoxel(tx,ty,tz);
            if ((tv&0xFF)!==206) continue;
            const isOff=(tv>>12)&0x1;
            const att=getTorchAttachedBlock(tx,ty,tz);
            const ap=_blockPower.get(att.x+','+att.y+','+att.z);
            const attPow = ap && (ap.strong>0||ap.weak>0);
            let dustPow=false;
            for (const [nx,ny,nz] of DIRS6) {
                const nv=getVoxel(att.x+nx,att.y+ny,att.z+nz);
                if ((nv&0xFF)===202 && ((nv>>8)&0xF)>0) {dustPow=true;break;}
            }
            const shouldOff = attPow||dustPow;
            if (shouldOff&&!isOff) {
                setVoxel(tx,ty,tz,206,(tv>>8)&0xF,1);
                pendingBlockUpdates.push({x:tx,y:ty,z:tz});
            } else if (!shouldOff&&isOff) {
                setVoxel(tx,ty,tz,206,(tv>>8)&0xF,0);
                pendingBlockUpdates.push({x:tx,y:ty,z:tz});
            }
        }

        // Active torches power adjacent blocks
        for (let dx=-R;dx<=R;dx++) for (let dy=-3;dy<=3;dy++) for (let dz=-R;dz<=R;dz++) {
            const tx=sourceX+dx, ty=sourceY+dy, tz=sourceZ+dz;
            const tv=getVoxel(tx,ty,tz);
            if ((tv&0xFF)!==206||((tv>>12)&0x1)) continue;
            for (const [ddx,ddy,ddz] of [[0,1,0],[1,0,0],[-1,0,0],[0,0,1],[0,0,-1]]) {
                const bx2=tx+ddx,by2=ty+ddy,bz2=tz+ddz;
                const bid=getVoxel(bx2,by2,bz2)&0xFF;
                if (bid!==0&&bid!==202&&!isFluidBlock(bid)) {
                    const bk=bx2+','+by2+','+bz2;
                    const bp=_blockPower.get(bk)||{strong:0,weak:0};
                    bp.strong=Math.max(bp.strong,15);
                    _blockPower.set(bk,bp);
                }
            }
        }
    }

    // ==========================================
    // INITIAL SEED — find dust adjacent to sources, set their power, schedule neighbors
    // ==========================================
    function _seedFromSources(sourceX, sourceY, sourceZ) {
        const R = 16;
        // Collect all dust in range
        const dustInRange = [];
        for (let dx=-R;dx<=R;dx++) for (let dy=-3;dy<=3;dy++) for (let dz=-R;dz<=R;dz++) {
            const x=sourceX+dx, y=sourceY+dy, z=sourceZ+dz;
            if ((getVoxel(x,y,z)&0xFF)!==202) continue;
            dustInRange.push({x, y, z});
        }
        
        // Clear all dust in range — forces full recompute
        for (const {x, y, z} of dustInRange) {
            const currentPower = (getVoxel(x,y,z) >> 8) & 0xF;
            if (currentPower > 0) {
                setVoxel(x, y, z, 202, 0);
                _remeshDust(x, y, z);
            }
        }
        
        // Find all dust adjacent to direct sources and seed them
        const seedQueue = [];
        for (const {x, y, z} of dustInRange) {
            const directPower = _getDirectSourcePower(x, y, z);
            if (directPower > 0) {
                setVoxel(x, y, z, 202, directPower);
                _remeshDust(x, y, z);
                seedQueue.push({x, y, z, power: directPower});
                // Weakly power block below
                const bk = x+','+(y-1)+','+z;
                const bp = _blockPower.get(bk)||{strong:0,weak:0};
                bp.weak = Math.max(bp.weak, directPower);
                _blockPower.set(bk, bp);
            }
        }
        
        // Immediate BFS flood-fill from all seeds — ensures the line is powered fully
        // This makes power propagation appear instant (which matches MC behavior for short distances)
        while (seedQueue.length > 0) {
            const cur = seedQueue.shift();
            if (cur.power <= 1) continue;
            const newPower = cur.power - 1;
            for (const n of _getDustNeighbors(cur.x, cur.y, cur.z)) {
                const nCurrent = (getVoxel(n.x, n.y, n.z) >> 8) & 0xF;
                if (newPower > nCurrent) {
                    setVoxel(n.x, n.y, n.z, 202, newPower);
                    _remeshDust(n.x, n.y, n.z);
                    // Weakly power block below
                    const bk = n.x+','+(n.y-1)+','+n.z;
                    const bp = _blockPower.get(bk)||{strong:0,weak:0};
                    bp.weak = Math.max(bp.weak, newPower);
                    _blockPower.set(bk, bp);
                    seedQueue.push({x: n.x, y: n.y, z: n.z, power: newPower});
                }
            }
        }
    }
    
    function _remeshDust(x, y, z) {
        const cx = Math.floor((x + WORLD_WIDTH/2) / CHUNK_SIZE);
        const cz = Math.floor((z + WORLD_DEPTH/2) / CHUNK_SIZE);
        if (typeof pendingBlockUpdates !== 'undefined') {
            const wx = cx * CHUNK_SIZE - Math.floor(WORLD_WIDTH/2);
            const wz = cz * CHUNK_SIZE - Math.floor(WORLD_DEPTH/2);
            pendingBlockUpdates.push({x: wx, y: 0, z: wz});
        }
    }

    // ==========================================
    // PROCESS ONE REDSTONE TICK
    // ==========================================
    function _processOneTick() {
        _rsTick++;
        const toProcess = [];
        const remaining = [];
        for (const entry of _scheduledUpdates) {
            if (entry.tick <= _rsTick) toProcess.push(entry);
            else remaining.push(entry);
        }
        _scheduledUpdates.length = 0;
        for (const r of remaining) _scheduledUpdates.push(r);

        // Clear scheduled set for processed entries
        for (const {x,y,z} of toProcess) _scheduled.delete(x+','+y+','+z);

        if (toProcess.length === 0) return;

        let anyChanged = false;
        for (const {x, y, z} of toProcess) {
            if ((getVoxel(x,y,z) & 0xFF) !== 202) continue;

            const currentPower = (getVoxel(x,y,z) >> 8) & 0xF;

            // Calculate what power this dust SHOULD have
            const fromSource = _getDirectSourcePower(x, y, z);
            const fromDust = _getAdjacentDustPower(x, y, z);
            const newPower = Math.max(fromSource, fromDust);

            if (newPower !== currentPower) {
                setVoxel(x, y, z, 202, newPower);
                _remeshDust(x, y, z);
                anyChanged = true;

                // Update block power below
                if (newPower > 0) {
                    const bk = x+','+(y-1)+','+z;
                    const bp = _blockPower.get(bk)||{strong:0,weak:0};
                    bp.weak = Math.max(bp.weak, newPower);
                    _blockPower.set(bk, bp);
                }

                // Schedule neighbors for next tick
                _scheduleNeighborDust(x, y, z);
            }
        }

        // Update doors/pistons after each tick if anything changed
        if (anyChanged && toProcess.length > 0) {
            const {x,y,z} = toProcess[0];
            _updateDoorsAndPistons(x, y, z);
        }
    }

    // ==========================================
    // DOORS / PISTONS
    // ==========================================
    function _updateDoorsAndPistons(sourceX, sourceY, sourceZ) {
        const R = 16;
        function isDoorPowered(dx,dy,dz) {
            for (const [nx,ny,nz] of DIRS6) {
                const ax=dx+nx,ay=dy+ny,az=dz+nz;
                const nv=getVoxel(ax,ay,az), nid=nv&0xFF;
                if ((nid===203||nid===205)&&((nv>>10)&0x1)) return true;
                if (nid===206&&!((nv>>12)&0x1)) return true;
                if (nid===202&&((nv>>8)&0xF)>0) return true;
                const bp=_blockPower.get(ax+','+ay+','+az);
                if (bp&&(bp.strong>0||bp.weak>0)) return true;
            }
            return false;
        }
        function toggleDoor(dx,dy,dz,open) {
            const dv=getVoxel(dx,dy,dz), did=dv&0xFF;
            if (did!==149&&did!==150) return;
            // Door bits stored in level field (bits 8-12):
            //   bits 0-1: direction
            //   bit 2: open
            //   bit 3: top half (door only)
            //   bit 4: hinge (door only)
            const dir = (dv >> 8) & 0x3;
            const isTop = (dv >> 11) & 0x1;
            const hinge = (dv >> 12) & 0x1;
            const currentOpen = (dv >> 10) & 0x1;
            if (currentOpen === (open ? 1 : 0)) return;
            
            const newPacked = dir | ((open ? 1 : 0) << 2) | (isTop << 3) | (hinge << 4);
            setVoxel(dx, dy, dz, did, newPacked);
            pendingBlockUpdates.push({x:dx,y:dy,z:dz});
            
            if (did===149) {
                // Door has two halves — update the other half too
                const oy = isTop ? dy-1 : dy+1;
                const ov = getVoxel(dx, oy, dz);
                if ((ov & 0xFF) === 149) {
                    const oDir = (ov >> 8) & 0x3;
                    const oIsTop = (ov >> 11) & 0x1;
                    const oHinge = (ov >> 12) & 0x1;
                    const oPacked = oDir | ((open ? 1 : 0) << 2) | (oIsTop << 3) | (oHinge << 4);
                    setVoxel(dx, oy, dz, 149, oPacked);
                    pendingBlockUpdates.push({x:dx,y:oy,z:dz});
                }
            }
            if (typeof window.playDoorSound==='function') window.playDoorSound(open,dx,dy,dz);
        }
        for (let dx=-R;dx<=R;dx++) for (let dy=-3;dy<=3;dy++) for (let dz=-R;dz<=R;dz++) {
            const wx=sourceX+dx,wy=sourceY+dy,wz=sourceZ+dz;
            const wid=getVoxel(wx,wy,wz)&0xFF;
            if (wid!==149&&wid!==150) continue;
            const key=wx+','+wy+','+wz;
            const pow=isDoorPowered(wx,wy,wz);
            if (pow&&!_redstoneDoors.has(key)) {_redstoneDoors.add(key); toggleDoor(wx,wy,wz,true);}
            else if (!pow&&_redstoneDoors.has(key)) {_redstoneDoors.delete(key); toggleDoor(wx,wy,wz,false);}
        }
        updatePistons(sourceX, sourceY, sourceZ);
    }

    // ==========================================
    // MAIN UPDATE — called when source changes
    // ==========================================
    function updateRedstonePower(sourceX, sourceY, sourceZ) {
        _updateSources(sourceX, sourceY, sourceZ);
        _seedFromSources(sourceX, sourceY, sourceZ);
        // Also immediately update doors/pistons for direct source adjacency
        _updateDoorsAndPistons(sourceX, sourceY, sourceZ);
    }

    // ==========================================
    // BUTTONS
    // ==========================================
    function pressButton(x,y,z) {
        const val=getVoxel(x,y,z);
        if ((val&0xFF)!==203||(val>>10)&0x1) return;
        setVoxel(x,y,z,203,((val>>8)&0x3)|(1<<2));
        _activeButtons.set(x+','+y+','+z, {timer:1.5});
        _playButtonSound(x,y,z,1.0);
        updateRedstonePower(x,y,z);
        pendingBlockUpdates.push({x,y,z});
    }
    function releaseButton(x,y,z) {
        const val=getVoxel(x,y,z);
        if ((val&0xFF)!==203) return;
        setVoxel(x,y,z,203,(val>>8)&0x3);
        _activeButtons.delete(x+','+y+','+z);
        _playButtonSound(x,y,z,0.8);
        updateRedstonePower(x,y,z);
        pendingBlockUpdates.push({x,y,z});
    }

    // ==========================================
    // LEVERS
    // ==========================================
    function toggleLever(x,y,z) {
        const val=getVoxel(x,y,z);
        if ((val&0xFF)!==205) return;
        const dir=(val>>8)&0x3, isOn=(val>>10)&0x1;
        setVoxel(x,y,z,205,dir|((isOn?0:1)<<2));
        _playButtonSound(x,y,z,isOn?0.8:1.0);
        updateRedstonePower(x,y,z);
        pendingBlockUpdates.push({x,y,z});
    }

    // ==========================================
    // TICK
    // ==========================================
    function tickRedstone(dt) {
        // Button timers
        for (const [key,info] of _activeButtons) {
            info.timer -= dt;
            if (info.timer <= 0) {
                const [bx,by,bz] = key.split(',').map(Number);
                releaseButton(bx,by,bz);
            }
        }
        // Redstone tick propagation
        _tickAccum += dt;
        while (_tickAccum >= REDSTONE_TICK_RATE) {
            _tickAccum -= REDSTONE_TICK_RATE;
            _processOneTick();
        }
    }

    // ==========================================
    // PISTONS (same as original)
    // ==========================================
    const _immovable = new Set([18,28,54,60,69,93,201]);
    function _isBreakableByPiston(id) {
        if (!id) return false;
        if (typeof isCrossBlock==='function'&&isCrossBlock(id)) return true;
        return [17,206,202,203,205,64,52,66,67,40,89,20,149,150].includes(id);
    }
    function canPistonPush(id) { return id===0||!_immovable.has(id); }
    function _breakBlockByPiston(bx,by,bz) {
        const bv=getVoxel(bx,by,bz), bid=bv&0xFF;
        if (!bid) return;
        if (typeof window.spawnBlockDrops==='function') window.spawnBlockDrops(bid,bx,by,bz,bv);
        if (typeof spawnParticles==='function') spawnParticles(bx,by,bz,bid);
        setVoxel(bx,by,bz,0); pendingBlockUpdates.push({x:bx,y:by,z:bz});
        if (typeof queueNeighbors==='function') queueNeighbors(bx,by,bz);
        if (bid===149) {
            const isTop=(bv>>11)&0x1, oy=isTop?by-1:by+1;
            if ((getVoxel(bx,oy,bz)&0xFF)===149) {
                if (typeof spawnParticles==='function') spawnParticles(bx,oy,bz,149);
                setVoxel(bx,oy,bz,0); pendingBlockUpdates.push({x:bx,y:oy,z:bz});
            }
        }
    }
    function isPistonPowered(x,y,z) {
        const pp=_blockPower.get(x+','+y+','+z);
        if (pp&&(pp.strong>0||pp.weak>0)) return true;
        for (const [nx,ny,nz] of DIRS6) {
            const ax=x+nx,ay=y+ny,az=z+nz,nv=getVoxel(ax,ay,az),nid=nv&0xFF;
            if (nid===203&&((nv>>10)&0x1)) return true;
            if (nid===205&&((nv>>10)&0x1)) return true;
            if (nid===206&&!((nv>>12)&0x1)) return true;
            if (nid===202&&((nv>>8)&0xF)>0) return true;
            const bp=_blockPower.get(ax+','+ay+','+az);
            if (bp&&bp.strong>0) return true;
        }
        return false;
    }
    function tryExtendPiston(x,y,z) {
        const val=getVoxel(x,y,z),id=val&0xFF;
        if(id!==207&&id!==208)return;
        const dir=(val>>8)&0x7;if((val>>11)&0x1)return;
        const dvs=[[0,-1,0],[0,1,0],[0,0,-1],[0,0,1],[-1,0,0],[1,0,0]],dv=dvs[dir];
        const fx=x+dv[0],fy=y+dv[1],fz=z+dv[2],fid=getVoxel(fx,fy,fz)&0xFF;
        const push=[],brk=[];
        if(fid!==0){for(let i=0;i<=12;i++){const cx2=fx+dv[0]*i,cy2=fy+dv[1]*i,cz2=fz+dv[2]*i,cv=getVoxel(cx2,cy2,cz2),cid=cv&0xFF;if(!cid)break;if(_immovable.has(cid))return;if((cid===207||cid===208)&&((cv>>11)&0x1))return;if(_isBreakableByPiston(cid)){brk.push({x:cx2,y:cy2,z:cz2});break;}push.push({x:cx2,y:cy2,z:cz2,val:cv});if(push.length>12)return;}}
        for(const b of brk)_breakBlockByPiston(b.x,b.y,b.z);
        for(let i=push.length-1;i>=0;i--){const b=push[i];setVoxel(b.x+dv[0],b.y+dv[1],b.z+dv[2],b.val&0xFF,(b.val>>8)&0xF,(b.val>>12)&0x1,(b.val>>13)&0x1);pendingBlockUpdates.push({x:b.x+dv[0],y:b.y+dv[1],z:b.z+dv[2]});}
        setVoxel(fx,fy,fz,0);pendingBlockUpdates.push({x:fx,y:fy,z:fz});
        setVoxel(x,y,z,id,dir|(1<<3));pendingBlockUpdates.push({x,y,z});
        if(typeof queueNeighbors==='function'){queueNeighbors(x,y,z);queueNeighbors(fx,fy,fz);}
        if(typeof window.playNamedSoundAt==='function')window.playNamedSoundAt('piston_push',0.5,0.9,1.1,x,y,z);
    }
    function tryRetractPiston(x,y,z) {
        const val=getVoxel(x,y,z),id=val&0xFF;
        if(id!==207&&id!==208)return;
        const dir=(val>>8)&0x7;if(!((val>>11)&0x1))return;
        const dvs=[[0,-1,0],[0,1,0],[0,0,-1],[0,0,1],[-1,0,0],[1,0,0]],dv=dvs[dir];
        const fx=x+dv[0],fy=y+dv[1],fz=z+dv[2];
        if(id===208){const px2=fx+dv[0],py2=fy+dv[1],pz2=fz+dv[2],pv=getVoxel(px2,py2,pz2),pid=pv&0xFF;if(pid&&pid!==18&&pid!==28&&!_isBreakableByPiston(pid)){setVoxel(fx,fy,fz,pv&0xFF,(pv>>8)&0xF,(pv>>12)&0x1,(pv>>13)&0x1);setVoxel(px2,py2,pz2,0);pendingBlockUpdates.push({x:fx,y:fy,z:fz},{x:px2,y:py2,z:pz2});}}
        setVoxel(x,y,z,id,dir);pendingBlockUpdates.push({x,y,z});
        if(typeof queueNeighbors==='function')queueNeighbors(x,y,z);
        if(typeof window.playNamedSoundAt==='function')window.playNamedSoundAt('piston_pull',0.5,0.9,1.1,x,y,z);
    }
    function updatePistons(sx,sy,sz) {
        const r=16;
        for(let dx=-r;dx<=r;dx++)for(let dy=-3;dy<=3;dy++)for(let dz=-r;dz<=r;dz++){
            const px=sx+dx,py=sy+dy,pz=sz+dz,pv=getVoxel(px,py,pz),pid=pv&0xFF;
            if(pid!==207&&pid!==208)continue;
            const pow=isPistonPowered(px,py,pz),ext=(pv>>11)&0x1;
            if(pow&&!ext)tryExtendPiston(px,py,pz);
            else if(!pow&&ext)tryRetractPiston(px,py,pz);
        }
    }

    function onRedstoneBlockChanged(x,y,z) { updateRedstonePower(x,y,z); }

    // EXPORTS
    window.pressButton=pressButton;
    window.toggleLever=toggleLever;
    window.tickRedstone=tickRedstone;
    window.onRedstoneBlockChanged=onRedstoneBlockChanged;
    window.getBlockPower=getBlockPower;
    window.getStrongPower=getStrongPower;
    window.updateRedstonePower=updateRedstonePower;
    window.updatePistons=updatePistons;
    window.tryExtendPiston=tryExtendPiston;
    window.tryRetractPiston=tryRetractPiston;
    window._activeButtons=_activeButtons;
})();
