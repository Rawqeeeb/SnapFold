import { useEffect, useRef, forwardRef, useImperativeHandle, useCallback } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { GameLevel, BlockPoint } from './levels'
import type { SubunitTransformData } from '../wasm/wasmBridge'
import { useGameStore } from '../store/gameStore'

export interface GameCanvasHandle {
  getCanvas: () => HTMLCanvasElement | null
  fitView: () => void
  zoomIn: () => void
  zoomOut: () => void
}

interface GameCanvasProps {
  level: GameLevel
  transforms: SubunitTransformData[]
  activeSubunitIdx: number
  onSelectSubunit: (idx: number) => void
  showHint: boolean
}

function createSubunitRibbonMesh(
  blocks: BlockPoint[],
  baseColor: THREE.Color,
  isGhost: boolean,
  subunitIdx: number,
  markerMap?: Map<string, THREE.Mesh>,
): THREE.Group {
  const group = new THREE.Group()
  if (blocks.length < 2) return group

  const pts = blocks.map((b) => new THREE.Vector3(b.position[0], b.position[1], b.position[2]))
  const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.5)
  const segments = Math.max(40, blocks.length * 6)

  // Substantial ribbon tube
  const tubeGeo = new THREE.TubeGeometry(curve, segments, isGhost ? 0.72 : 1.05, 12, false)
  const posAttr = tubeGeo.attributes.position
  const centerPt = new THREE.Vector3()
  const vPos = new THREE.Vector3()
  for (let i = 0; i < posAttr.count; i++) {
    const ringIdx = Math.floor(i / 13)
    const u = Math.min(1, ringIdx / segments)
    curve.getPointAt(u, centerPt)
    vPos.fromBufferAttribute(posAttr, i)
    const resIdx = Math.min(blocks.length - 1, Math.floor(u * blocks.length))
    const ss = blocks[resIdx]?.secondary_structure || 'H'
    if (ss === 'H' || ss === 'E') {
      vPos.z = centerPt.z + (vPos.z - centerPt.z) * 0.42
      vPos.x = centerPt.x + (vPos.x - centerPt.x) * 1.38
      posAttr.setXYZ(i, vPos.x, vPos.y, vPos.z)
    }
  }
  tubeGeo.computeVertexNormals()

  const mat = isGhost
    ? new THREE.MeshBasicMaterial({
        color: baseColor,
        wireframe: true,
        transparent: true,
        opacity: 0.28,
      })
    : new THREE.MeshStandardMaterial({
        color: baseColor,
        roughness: 0.22,
        metalness: 0.18,
      })

  const ribbonMesh = new THREE.Mesh(tubeGeo, mat)
  ribbonMesh.userData = { subunitId: subunitIdx, isRibbon: true }
  group.add(ribbonMesh)

  if (!isGhost) {
    const nodeGeo = new THREE.SphereGeometry(0.8, 14, 14)
    blocks.forEach((b, idx) => {
      const nodeMat = new THREE.MeshStandardMaterial({
        color: baseColor,
        roughness: 0.22,
        metalness: 0.18,
      })
      const node = new THREE.Mesh(nodeGeo, nodeMat)
      node.position.set(b.position[0], b.position[1], b.position[2])
      const s = idx === 0 || idx === blocks.length - 1 ? 1.35 : 0.85
      node.scale.set(s, s, s)
      node.userData = {
        subunitId: subunitIdx,
        residueIndex: b.residue_index,
        localIdx: idx,
        isMarker: true,
      }
      group.add(node)
      markerMap?.set(`${subunitIdx}-${b.residue_index}`, node)
    })
  }

  return group
}

export const GameCanvas = forwardRef<GameCanvasHandle, GameCanvasProps>(function GameCanvas(
  { level, transforms, activeSubunitIdx, onSelectSubunit, showHint },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
  const subunitGroupsRef = useRef<THREE.Group[]>([])
  const ghostGroupRef = useRef<THREE.Group | null>(null)
  const hintMeshRef = useRef<THREE.Object3D | null>(null)
  const beaconGroupRef = useRef<THREE.Group | null>(null)
  const markerMeshesRef = useRef<Map<string, THREE.Mesh>>(new Map())

  const {
    theme,
    hint,
    activePlayingSubunit,
    activePlayingResidue,
    isLevelSolved,
    isPlayingSymphony,
  } = useGameStore()

  // Compute camera distance focused cleanly on the protein complex with prominent size
  const fitCameraToScene = useCallback(
    (solvedMode = false) => {
      const camera = cameraRef.current
      const controls = controlsRef.current
      if (!camera || !controls) return

      const box = new THREE.Box3()

      level.subunits.forEach((sub) => {
        const [cx, cy, cz] = sub.targetCentroid
        sub.blocks.forEach((b) => {
          const [bx, by, bz] = b.position
          box.expandByPoint(new THREE.Vector3(cx + bx, cy + by, cz + bz))
          if (!solvedMode) {
            const [ox, oy, oz] = sub.initialOffset
            box.expandByPoint(new THREE.Vector3(cx + ox * 0.7 + bx, cy + oy * 0.7 + by, cz + oz * 0.7 + bz))
          }
        })
      })

      if (box.isEmpty()) return

      const sphere = new THREE.Sphere()
      box.getBoundingSphere(sphere)

      const vFov = (camera.fov * Math.PI) / 180
      const hFov = 2 * Math.atan(Math.tan(vFov / 2) * Math.max(0.6, camera.aspect))
      const minFov = Math.min(vFov, hFov)

      // Bring camera close so protein fills the screen prominently
      const radius = Math.max(9, sphere.radius)
      const distance = (radius / Math.sin(minFov / 2)) * (solvedMode ? 0.95 : 1.08)

      controls.target.copy(sphere.center)
      camera.position.set(
        sphere.center.x,
        sphere.center.y + distance * 0.22,
        sphere.center.z + distance,
      )
      camera.updateProjectionMatrix()
      controls.update()
    },
    [level],
  )

  const handleZoom = useCallback((factor: number) => {
    const camera = cameraRef.current
    const controls = controlsRef.current
    if (!camera || !controls) return

    const offset = new THREE.Vector3().subVectors(camera.position, controls.target)
    offset.multiplyScalar(factor)
    // Clamp zoom distance between 8 and 180
    if (offset.length() < 8) offset.setLength(8)
    if (offset.length() > 180) offset.setLength(180)
    camera.position.addVectors(controls.target, offset)
    controls.update()
  }, [])

  useImperativeHandle(ref, () => ({
    getCanvas: () => rendererRef.current?.domElement ?? null,
    fitView: () => fitCameraToScene(isLevelSolved),
    zoomIn: () => handleZoom(0.8),
    zoomOut: () => handleZoom(1.25),
  }))

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(theme === 'light' ? 0xf8fafc : 0x0b0f17)
    sceneRef.current = scene

    const width = container.clientWidth || 800
    const height = container.clientHeight || 520

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 1000)
    camera.position.set(0, 14, 40)
    cameraRef.current = camera

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      preserveDrawingBuffer: true,
    })
    renderer.setSize(width, height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    container.innerHTML = ''
    container.appendChild(renderer.domElement)
    rendererRef.current = renderer

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.maxDistance = 180
    controls.minDistance = 8
    controls.autoRotateSpeed = 1.8
    controlsRef.current = controls

    scene.add(new THREE.AmbientLight(0xffffff, 1.1))
    const dLight1 = new THREE.DirectionalLight(0xffffff, 1.3)
    dLight1.position.set(30, 40, 30)
    scene.add(dLight1)
    const dLight2 = new THREE.DirectionalLight(0x94a3b8, 0.8)
    dLight2.position.set(-30, -25, -20)
    scene.add(dLight2)

    // Musical Note Beacon
    const beaconGroup = new THREE.Group()
    beaconGroup.visible = false

    const coreSphere = new THREE.Mesh(
      new THREE.SphereGeometry(1.6, 20, 20),
      new THREE.MeshBasicMaterial({ color: 0xff5500 }),
    )
    const haloRing = new THREE.Mesh(
      new THREE.TorusGeometry(2.5, 0.25, 12, 32),
      new THREE.MeshBasicMaterial({ color: 0x00f5d4, transparent: true, opacity: 0.9 }),
    )
    const noteLight = new THREE.PointLight(0xff5500, 5.0, 22)
    beaconGroup.add(coreSphere, haloRing, noteLight)
    scene.add(beaconGroup)
    beaconGroupRef.current = beaconGroup

    const raycaster = new THREE.Raycaster()
    const mouse = new THREE.Vector2()
    let downX = 0
    let downY = 0

    const onPointerDown = (e: PointerEvent) => {
      downX = e.clientX
      downY = e.clientY
    }

    const onPointerUp = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 8) return
      const rect = renderer.domElement.getBoundingClientRect()
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(mouse, camera)

      const targets: THREE.Mesh[] = []
      subunitGroupsRef.current.forEach((g) => {
        g.traverse((c) => {
          if (c instanceof THREE.Mesh) targets.push(c)
        })
      })
      const hits = raycaster.intersectObjects(targets, false)
      if (hits.length > 0) {
        const subId = hits[0].object.userData?.subunitId
        if (typeof subId === 'number') onSelectSubunit(subId)
      }
    }

    renderer.domElement.addEventListener('pointerdown', onPointerDown)
    renderer.domElement.addEventListener('pointerup', onPointerUp)

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width
        const h = entry.contentRect.height
        if (w > 0 && h > 0) {
          camera.aspect = w / h
          camera.updateProjectionMatrix()
          renderer.setSize(w, h)
        }
      }
    })
    ro.observe(container)

    let raf = 0
    const tick = (t: number) => {
      raf = requestAnimationFrame(tick)
      if (beaconGroupRef.current && beaconGroupRef.current.visible) {
        beaconGroupRef.current.rotation.z = t * 0.004
        beaconGroupRef.current.rotation.y = t * 0.003
        const pulse = 1 + Math.sin(t * 0.012) * 0.18
        beaconGroupRef.current.scale.set(pulse, pulse, pulse)
      }
      controls.update()
      renderer.render(scene, camera)
    }
    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      renderer.domElement.removeEventListener('pointerdown', onPointerDown)
      renderer.domElement.removeEventListener('pointerup', onPointerUp)
      renderer.dispose()
      container.innerHTML = ''
    }
  }, [onSelectSubunit])

  useEffect(() => {
    if (sceneRef.current) {
      sceneRef.current.background = new THREE.Color(theme === 'light' ? 0xf8fafc : 0x0b0f17)
    }
  }, [theme])

  useEffect(() => {
    if (controlsRef.current) {
      controlsRef.current.autoRotate = isLevelSolved || isPlayingSymphony
    }
    if (isLevelSolved) {
      fitCameraToScene(true)
    }
  }, [isLevelSolved, isPlayingSymphony, fitCameraToScene])

  useEffect(() => {
    const scene = sceneRef.current
    if (!scene) return

    if (ghostGroupRef.current) scene.remove(ghostGroupRef.current)
    subunitGroupsRef.current.forEach((g) => scene.remove(g))
    subunitGroupsRef.current = []
    markerMeshesRef.current.clear()

    const ghostRoot = new THREE.Group()
    const ghostColor = new THREE.Color(theme === 'light' ? 0x475569 : 0xe2e8f0)

    level.subunits.forEach((sub, idx) => {
      const gRibbon = createSubunitRibbonMesh(sub.blocks, ghostColor, true, idx)
      gRibbon.position.set(sub.targetCentroid[0], sub.targetCentroid[1], sub.targetCentroid[2])
      ghostRoot.add(gRibbon)
    })
    scene.add(ghostRoot)
    ghostGroupRef.current = ghostRoot

    const groups: THREE.Group[] = []
    level.subunits.forEach((sub, idx) => {
      const subRibbon = createSubunitRibbonMesh(
        sub.blocks,
        new THREE.Color(sub.color),
        false,
        idx,
        markerMeshesRef.current,
      )
      subRibbon.userData = { subunitId: idx }
      scene.add(subRibbon)
      groups.push(subRibbon)
    })
    subunitGroupsRef.current = groups

    fitCameraToScene(false)
  }, [level, theme, fitCameraToScene])

  useEffect(() => {
    subunitGroupsRef.current.forEach((group, idx) => {
      const sub = level.subunits[idx]
      const tf = transforms[idx]
      if (!sub || !tf) return

      group.position.set(
        sub.targetCentroid[0] + tf.position[0],
        sub.targetCentroid[1] + tf.position[1],
        sub.targetCentroid[2] + tf.position[2],
      )
      group.rotation.set(
        (tf.euler_deg[0] * Math.PI) / 180,
        (tf.euler_deg[1] * Math.PI) / 180,
        (tf.euler_deg[2] * Math.PI) / 180,
      )

      const isActive = idx === activeSubunitIdx
      group.traverse((c) => {
        if (
          c instanceof THREE.Mesh &&
          c.userData?.isRibbon &&
          c.material instanceof THREE.MeshStandardMaterial
        ) {
          if (tf.is_locked) {
            c.material.emissive.setHex(0x00f5d4)
            c.material.emissiveIntensity = 0.22
          } else if (isActive) {
            c.material.emissive.setHex(0xff5500)
            c.material.emissiveIntensity = 0.16
          } else {
            c.material.emissive.setHex(0x000000)
            c.material.emissiveIntensity = 0
          }
        }
      })
    })
  }, [transforms, activeSubunitIdx, level])

  useEffect(() => {
    const beacon = beaconGroupRef.current
    let foundActiveMesh: THREE.Mesh | null = null

    markerMeshesRef.current.forEach((mesh, key) => {
      const [sStr, rStr] = key.split('-')
      const sIdx = Number(sStr)
      const rIdx = Number(rStr)
      const isExact = activePlayingSubunit === sIdx && activePlayingResidue === rIdx
      const isNeighbor =
        activePlayingSubunit === sIdx &&
        activePlayingResidue !== null &&
        Math.abs(rIdx - activePlayingResidue) <= 2

      if (mesh.material instanceof THREE.MeshStandardMaterial) {
        if (isExact) {
          mesh.material.emissive.setHex(0xff5500)
          mesh.material.emissiveIntensity = 2.0
          mesh.scale.set(2.5, 2.5, 2.5)
          foundActiveMesh = mesh
        } else if (isNeighbor) {
          mesh.material.emissive.setHex(0x00f5d4)
          mesh.material.emissiveIntensity = 1.0
          mesh.scale.set(1.5, 1.5, 1.5)
        } else {
          mesh.scale.set(0.85, 0.85, 0.85)
          mesh.material.emissive.setHex(0x000000)
          mesh.material.emissiveIntensity = 0
        }
      }
    })

    if (beacon) {
      if (foundActiveMesh) {
        const worldPos = new THREE.Vector3()
        ;(foundActiveMesh as THREE.Mesh).getWorldPosition(worldPos)
        beacon.position.copy(worldPos)
        beacon.visible = true
      } else {
        beacon.visible = false
      }
    }
  }, [activePlayingSubunit, activePlayingResidue])

  useEffect(() => {
    const scene = sceneRef.current
    if (!scene) return

    if (hintMeshRef.current) {
      scene.remove(hintMeshRef.current)
      hintMeshRef.current = null
    }
    if (!showHint || !hint || hint.action === 'Lock') return

    const activeGroup = subunitGroupsRef.current[activeSubunitIdx]
    if (!activeGroup) return

    const holder = new THREE.Group()
    holder.position.copy(activeGroup.position)
    const accent = new THREE.Color(0xff5500)

    if (hint.action.startsWith('Rotate')) {
      const curve = new THREE.ArcCurve(0, 0, 8.5, 0, Math.PI * 0.75 * hint.direction, false)
      const pts = curve.getPoints(28).map((p) => new THREE.Vector3(p.x, p.y, 0))
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color: accent, linewidth: 3 }),
      )
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(0.9, 2.0, 12),
        new THREE.MeshBasicMaterial({ color: accent }),
      )
      const endPt = pts[pts.length - 1]
      cone.position.copy(endPt)
      cone.rotation.z = (Math.PI / 2) * hint.direction

      const arc = new THREE.Group()
      arc.add(line, cone)
      if (hint.axis === 'X') arc.rotation.y = Math.PI / 2
      if (hint.axis === 'Y') arc.rotation.x = Math.PI / 2
      holder.add(arc)
    } else if (hint.action.startsWith('Slide')) {
      const dir = new THREE.Vector3(
        hint.action === 'SlideLeft' ? -1 : hint.action === 'SlideRight' ? 1 : 0,
        hint.action === 'SlideDown' ? -1 : hint.action === 'SlideUp' ? 1 : 0,
        hint.action === 'SlideBack' ? -1 : hint.action === 'SlideForward' ? 1 : 0,
      ).normalize()
      holder.add(new THREE.ArrowHelper(dir, new THREE.Vector3(0, 0, 0), 10.5, 0xff5500, 2.6, 1.5))
    }

    scene.add(holder)
    hintMeshRef.current = holder
  }, [showHint, hint, activeSubunitIdx])

  const btnStyle =
    theme === 'light'
      ? 'bg-white/95 border-slate-300 text-slate-800 hover:bg-slate-100 hover:border-[#EA580C]'
      : 'bg-[#111827]/95 border-[#1E293B] text-[#E2E8F0] hover:bg-[#1E293B] hover:border-[#FF5500]'

  return (
    <div className="relative w-full h-full select-none overflow-hidden touch-none">
      <div ref={containerRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

      {/* Floating Zoom & Fit Controls (Tactile and accessible) */}
      <div className="absolute bottom-3 right-3 flex items-center gap-1.5 z-10">
        <button
          onClick={() => handleZoom(0.8)}
          className={`w-8 h-8 rounded-lg border font-mono font-bold text-sm shadow-md flex items-center justify-center transition-colors ${btnStyle}`}
          title="Zoom in (+)"
        >
          +
        </button>
        <button
          onClick={() => handleZoom(1.25)}
          className={`w-8 h-8 rounded-lg border font-mono font-bold text-sm shadow-md flex items-center justify-center transition-colors ${btnStyle}`}
          title="Zoom out (-)"
        >
          −
        </button>
        <button
          onClick={() => fitCameraToScene(isLevelSolved)}
          className={`px-2.5 h-8 rounded-lg border text-xs font-mono font-semibold shadow-md flex items-center gap-1 transition-colors ${btnStyle}`}
          title="Fit protein to screen"
        >
          <span>⊡</span>
          <span className="hidden sm:inline">Fit</span>
        </button>
      </div>

      {isLevelSolved && (
        <div className="absolute inset-0 pointer-events-none border-2 border-emerald-500/80 rounded" />
      )}
    </div>
  )
})
