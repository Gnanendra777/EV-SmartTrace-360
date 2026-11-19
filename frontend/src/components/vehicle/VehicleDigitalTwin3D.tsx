import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { 
  RotateCw, Eye, EyeOff, Compass, Zap, Shield, AlertTriangle, 
  CheckCircle2, XCircle, Info, Maximize2, RefreshCw, Thermometer,
  Gauge, Radio, Disc, Cpu, Wind, Lock, BatteryCharging, ZoomIn, ZoomOut
} from 'lucide-react';
import { TyreStatus, DoorStatus, SeatbeltStatus, ClimateStatus, ComponentHealthDetail } from '../../types';

interface VehicleDigitalTwin3DProps {
  vehicleName?: string;
  soc?: number;
  soh?: number;
  packVoltage?: number;
  packTemp?: number;
  selectedCompId?: string | null;
  tyres?: TyreStatus | null;
  doors?: DoorStatus | null;
  seatbelts?: SeatbeltStatus | null;
  climate?: ClimateStatus | null;
  healthComponents?: ComponentHealthDetail[];
  onComponentClick?: (componentId: string) => void;
  className?: string;
}

type ViewAngle = 'free' | 'front' | 'rear' | 'left' | 'right' | 'top' | 'battery';

export const VehicleDigitalTwin3D: React.FC<VehicleDigitalTwin3DProps> = ({
  vehicleName = 'CyberPulse GT',
  soc = 70,
  soh = 96,
  packVoltage = 401.5,
  packTemp = 28.5,
  selectedCompId = null,
  tyres,
  doors,
  seatbelts,
  climate,
  healthComponents = [],
  onComponentClick,
  className = ''
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [isXray, setIsXray] = useState(true); // Default to transparent wireframe/X-ray as in reference image
  const [autoRotate, setAutoRotate] = useState(false);
  const [activeCompId, setActiveCompId] = useState<string | null>(selectedCompId || 'battery');
  const [hoveredCompId, setHoveredCompId] = useState<string | null>(null);
  const [inspectionModal, setInspectionModal] = useState<ComponentHealthDetail | null>(null);
  const [currentAngle, setCurrentAngle] = useState<ViewAngle>('free');

  // Internal Three.js references
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const carGroupRef = useRef<THREE.Group | null>(null);
  const bodyMeshGroupRef = useRef<THREE.Group | null>(null);
  const internalGroupRef = useRef<THREE.Group | null>(null);
  const clickableObjectsRef = useRef<Map<string, THREE.Object3D>>(new Map());
  const dynamicMaterialsRef = useRef<Map<string, THREE.MeshStandardMaterial>>(new Map());
  const raycasterRef = useRef(new THREE.Raycaster());
  const mouseRef = useRef(new THREE.Vector2());

  // Component Status Map based on real-time props
  const getComponentStatus = useCallback((compId: string): 'normal' | 'warning' | 'critical' | 'unavailable' => {
    const found = healthComponents.find(c => c.component_id === compId);
    if (found) return found.status as any;
    if (compId === 'tyres' && tyres?.tpms_status) return tyres.tpms_status;
    if (compId === 'cooling') return 'warning'; // Live CAN-bus P0A93 notice
    if (compId === 'battery' && soc < 20) return 'warning';
    return 'normal';
  }, [healthComponents, tyres, soc]);

  const getStatusColorHex = (status: string): number => {
    switch (status) {
      case 'warning': return 0xF5B942; // glowing amber
      case 'critical': return 0xF15B65; // glowing crimson
      case 'unavailable': return 0x64748B; // muted grey
      case 'normal':
      default: return 0x20D6C2; // electric cyan
    }
  };

  // Sync selectedCompId from parent
  useEffect(() => {
    if (selectedCompId) {
      setActiveCompId(selectedCompId);
    }
  }, [selectedCompId]);

  // Helper to create transparent body mesh with glowing edge lines (Image 1 aesthetic)
  const createWireframePart = (
    geometry: THREE.BufferGeometry, 
    glassMaterial: THREE.Material, 
    edgeColor: number = 0x20D6C2, 
    opacity: number = 0.85
  ): THREE.Group => {
    const group = new THREE.Group();
    const mesh = new THREE.Mesh(geometry, glassMaterial);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);

    const edges = new THREE.EdgesGeometry(geometry, 24);
    const line = new THREE.LineSegments(
      edges, 
      new THREE.LineBasicMaterial({ color: edgeColor, transparent: true, opacity })
    );
    group.add(line);
    return group;
  };

  // Initialize Three.js Scene
  useEffect(() => {
    if (!mountRef.current) return;
    const container = mountRef.current;
    const width = container.clientWidth || 600;
    const height = container.clientHeight || 520;

    // 1. Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x06151B); // Dark Aurora Electric theme
    scene.fog = new THREE.FogExp2(0x06151B, 0.035);
    sceneRef.current = scene;

    // 2. Camera - High-angle 3/4 perspective matching Image 1
    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);
    camera.position.set(4.2, 2.5, 4.6);
    cameraRef.current = camera;

    // 3. Renderer with soft shadows and tone mapping
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.35;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // 4. OrbitControls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.target.set(0, 0.45, 0);
    controls.minDistance = 2.2;
    controls.maxDistance = 12.0;
    controls.autoRotate = autoRotate;
    controls.autoRotateSpeed = 0.8;
    controlsRef.current = controls;

    // 5. Lighting Setup - Diagnostic Bay Ambience
    const ambientLight = new THREE.AmbientLight(0x0D2B35, 2.2);
    scene.add(ambientLight);

    // Key directional light from above
    const dirLight = new THREE.DirectionalLight(0xE0F7FA, 2.4);
    dirLight.position.set(5, 8, 4);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    scene.add(dirLight);

    // Electric Cyan Underglow Light (shines UP into battery pack & chassis)
    const batteryUnderglow = new THREE.PointLight(0x20D6C2, 6.0, 7.5);
    batteryUnderglow.position.set(0, 0.05, 0);
    scene.add(batteryUnderglow);

    // Electric-blue side rim light
    const blueRimLight = new THREE.PointLight(0x438CFF, 4.5, 12);
    blueRimLight.position.set(-4.5, 2.2, -3.5);
    scene.add(blueRimLight);

    // Neon cyan front projector fill
    const frontCyanFill = new THREE.PointLight(0x20D6C2, 3.5, 10);
    frontCyanFill.position.set(0, 1.8, 5.0);
    scene.add(frontCyanFill);

    // 6. Ground Radar Testbed Grid
    const gridHelper = new THREE.GridHelper(16, 28, 0x20D6C2, 0x0E3842);
    gridHelper.position.y = -0.01;
    scene.add(gridHelper);

    // Concentric Hologram telemetry circles
    const innerRingGeo = new THREE.RingGeometry(2.6, 2.75, 64);
    const innerRingMat = new THREE.MeshBasicMaterial({ color: 0x20D6C2, side: THREE.DoubleSide, transparent: true, opacity: 0.3 });
    const innerRingMesh = new THREE.Mesh(innerRingGeo, innerRingMat);
    innerRingMesh.rotation.x = Math.PI / 2;
    innerRingMesh.position.y = 0.005;
    scene.add(innerRingMesh);

    const outerRingGeo = new THREE.RingGeometry(4.6, 4.75, 64);
    const outerRingMat = new THREE.MeshBasicMaterial({ color: 0x438CFF, side: THREE.DoubleSide, transparent: true, opacity: 0.2 });
    const outerRingMesh = new THREE.Mesh(outerRingGeo, outerRingMat);
    outerRingMesh.rotation.x = Math.PI / 2;
    outerRingMesh.position.y = 0.004;
    scene.add(outerRingMesh);

    // 7. BUILD THE 3D ELECTRIC VEHICLE DIGITAL TWIN
    const carGroup = new THREE.Group();
    carGroupRef.current = carGroup;
    scene.add(carGroup);

    const clickableMap = clickableObjectsRef.current;
    clickableMap.clear();
    const dynamicMats = dynamicMaterialsRef.current;
    dynamicMats.clear();

    // Outer Body Shell Group (Transparent Wireframe / X-ray)
    const bodyGroup = new THREE.Group();
    bodyMeshGroupRef.current = bodyGroup;
    carGroup.add(bodyGroup);

    // Internal Powertrain & Hardware Components Group
    const internalGroup = new THREE.Group();
    internalGroupRef.current = internalGroup;
    carGroup.add(internalGroup);

    // --- MATERIALS ---
    // Holographic Translucent Glass Material for Aerodynamic Panels
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0x0A222C,
      metalness: 0.15,
      roughness: 0.08,
      transmission: 0.85,
      transparent: true,
      opacity: isXray ? 0.22 : 0.88,
      reflectivity: 0.95,
      clearcoat: 1.0,
      clearcoatRoughness: 0.1
    });

    // Solid aerodynamic carbon-fiber accents
    const carbonMat = new THREE.MeshStandardMaterial({
      color: 0x07151B,
      metalness: 0.9,
      roughness: 0.25,
      wireframe: isXray
    });

    // --- A. AERODYNAMIC CAR BODY (Matching Reference Image 1) ---
    // Lower Chassis Tub & Aerodynamic Sills
    const chassisGeo = new THREE.BoxGeometry(1.86, 0.42, 4.3, 4, 2, 8);
    const chassisPart = createWireframePart(chassisGeo, glassMat, 0x20D6C2, 0.9);
    chassisPart.position.set(0, 0.44, 0);
    bodyGroup.add(chassisPart);

    // Sleek Front Hood with Aero Splitter
    const hoodGeo = new THREE.ConeGeometry(0.96, 1.15, 4);
    hoodGeo.rotateX(-Math.PI / 2);
    hoodGeo.scale(1.0, 0.32, 1.15);
    const hoodPart = createWireframePart(hoodGeo, glassMat, 0x20D6C2, 0.95);
    hoodPart.position.set(0, 0.52, 1.62);
    bodyGroup.add(hoodPart);

    // Front Bumper Lower Aerodynamic Splitter
    const splitterGeo = new THREE.BoxGeometry(1.78, 0.06, 0.45);
    const splitterPart = createWireframePart(splitterGeo, carbonMat, 0x438CFF, 0.8);
    splitterPart.position.set(0, 0.22, 2.05);
    bodyGroup.add(splitterPart);

    // Aerodynamic Greenhouse Cabin Canopy (Cockpit Glass Dome)
    const cabinGeo = new THREE.CylinderGeometry(0.72, 0.92, 2.25, 16, 2, false);
    cabinGeo.rotateZ(Math.PI / 2);
    cabinGeo.scale(0.86, 1.35, 1.0);
    const cabinPart = createWireframePart(cabinGeo, glassMat, 0x20D6C2, 0.95);
    cabinPart.position.set(0, 0.90, -0.15);
    cabinPart.rotation.y = Math.PI / 2;
    bodyGroup.add(cabinPart);

    // Fastback Roof Shell
    const roofGeo = new THREE.BoxGeometry(1.36, 0.06, 1.85);
    const roofPart = createWireframePart(roofGeo, carbonMat, 0x20D6C2, 0.85);
    roofPart.position.set(0, 1.28, -0.15);
    bodyGroup.add(roofPart);

    // Rear Aerodynamic Diffuser & Decklid
    const rearDiffuserGeo = new THREE.BoxGeometry(1.75, 0.22, 0.4);
    const rearDiffuserPart = createWireframePart(rearDiffuserGeo, carbonMat, 0x438CFF, 0.85);
    rearDiffuserPart.position.set(0, 0.38, -2.12);
    bodyGroup.add(rearDiffuserPart);

    // Front Cyber Dual LED Light Bars (Electric Cyan Projector Glow)
    const frontLightGeo = new THREE.BoxGeometry(1.55, 0.05, 0.08);
    const frontLightMat = new THREE.MeshStandardMaterial({
      color: 0x20D6C2,
      emissive: 0x20D6C2,
      emissiveIntensity: 3.5,
      roughness: 0.1
    });
    const frontLightMesh = new THREE.Mesh(frontLightGeo, frontLightMat);
    frontLightMesh.position.set(0, 0.54, 2.14);
    bodyGroup.add(frontLightMesh);

    // Rear Full-Width Signature LED Light Bar (Neon Crimson Glow)
    const rearLightGeo = new THREE.BoxGeometry(1.65, 0.05, 0.08);
    const rearLightMat = new THREE.MeshStandardMaterial({
      color: 0xF15B65,
      emissive: 0xF15B65,
      emissiveIntensity: 3.2,
      roughness: 0.1
    });
    const rearLightMesh = new THREE.Mesh(rearLightGeo, rearLightMat);
    rearLightMesh.position.set(0, 0.68, -2.14);
    bodyGroup.add(rearLightMesh);

    // Side Mirrors
    [-0.98, 0.98].forEach((x) => {
      const mirrorGeo = new THREE.BoxGeometry(0.18, 0.08, 0.12);
      const mirrorPart = createWireframePart(mirrorGeo, glassMat, 0x20D6C2, 0.7);
      mirrorPart.position.set(x, 0.88, 0.45);
      bodyGroup.add(mirrorPart);
    });

    // --- B. COMPONENT 1: HIGH-VOLTAGE SKATEBOARD BATTERY PACK (CENTERPIECE OF IMAGE 1) ---
    const batteryGroup = new THREE.Group();
    const battStatus = getComponentStatus('battery');
    const battColorHex = getStatusColorHex(battStatus);

    const battTrayMat = new THREE.MeshStandardMaterial({
      color: 0x0A262E,
      metalness: 0.85,
      roughness: 0.3
    });

    const battCellGlowMat = new THREE.MeshStandardMaterial({
      color: battColorHex,
      emissive: battColorHex,
      emissiveIntensity: battStatus === 'critical' ? 3.5 : 2.2,
      metalness: 0.4,
      roughness: 0.15
    });
    dynamicMats.set('battery', battCellGlowMat);

    // Structural Aluminum Battery Enclosure Tray
    const battTrayGeo = new THREE.BoxGeometry(1.55, 0.16, 2.65);
    const battTrayPart = createWireframePart(battTrayGeo, battTrayMat, battColorHex, 0.9);
    battTrayPart.position.set(0, 0.22, 0);
    batteryGroup.add(battTrayPart);

    // Distinct Rows of Glowing Cylindrical / Prismatic Cells (exact visual match to Image 1)
    // 6 module banks along the chassis, each packed with glowing cells
    for (let mz = -1.05; mz <= 1.05; mz += 0.42) {
      for (let mx = -0.52; mx <= 0.52; mx += 0.52) {
        // Module housing frame
        const modFrameGeo = new THREE.BoxGeometry(0.44, 0.11, 0.36);
        const modFrameMat = new THREE.MeshStandardMaterial({ color: 0x081C22, metalness: 0.9 });
        const modFrameMesh = new THREE.Mesh(modFrameGeo, modFrameMat);
        modFrameMesh.position.set(mx, 0.23, mz);
        batteryGroup.add(modFrameMesh);

        // Individual glowing cell cylinders inside the module
        for (let cz = -0.12; cz <= 0.12; cz += 0.12) {
          for (let cx = -0.14; cx <= 0.14; cx += 0.14) {
            const cellGeo = new THREE.CylinderGeometry(0.045, 0.045, 0.12, 14);
            const cellMesh = new THREE.Mesh(cellGeo, battCellGlowMat);
            cellMesh.position.set(mx + cx, 0.25, mz + cz);
            batteryGroup.add(cellMesh);

            // Glowing terminal cap
            const capGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.02, 10);
            const capMat = new THREE.MeshBasicMaterial({ color: 0xE0F7FA });
            const capMesh = new THREE.Mesh(capGeo, capMat);
            capMesh.position.set(mx + cx, 0.32, mz + cz);
            batteryGroup.add(capMesh);
          }
        }
      }
    }

    // Battery Management System (BMS) Master Circuit Boards (Front & Rear)
    const bmsGeo = new THREE.BoxGeometry(0.5, 0.08, 0.18);
    const bmsMat = new THREE.MeshStandardMaterial({
      color: 0x0F3842,
      emissive: 0x20D6C2,
      emissiveIntensity: 0.8,
      metalness: 0.6
    });
    const bmsFront = new THREE.Mesh(bmsGeo, bmsMat);
    bmsFront.position.set(0, 0.25, 1.25);
    batteryGroup.add(bmsFront);

    const bmsRear = new THREE.Mesh(bmsGeo, bmsMat);
    bmsRear.position.set(0, 0.25, -1.25);
    batteryGroup.add(bmsRear);

    // Sinuous liquid coolant ribbons weaving between the battery modules (electric blue fluid)
    const battCoolantPath = [
      new THREE.Vector3(-0.62, 0.24, 1.15),
      new THREE.Vector3(-0.62, 0.24, -1.15),
      new THREE.Vector3(0, 0.24, -1.15),
      new THREE.Vector3(0, 0.24, 1.15),
      new THREE.Vector3(0.62, 0.24, 1.15),
      new THREE.Vector3(0.62, 0.24, -1.15),
    ];
    const battCoolantGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(battCoolantPath), 36, 0.018, 8, false);
    const battCoolantMat = new THREE.MeshStandardMaterial({
      color: 0x00E5FF,
      emissive: 0x00E5FF,
      emissiveIntensity: 2.0
    });
    batteryGroup.add(new THREE.Mesh(battCoolantGeo, battCoolantMat));

    batteryGroup.name = 'battery';
    batteryGroup.userData = { id: 'battery', name: 'High-Voltage Battery Pack & Modules' };
    clickableMap.set('battery', batteryGroup);
    internalGroup.add(batteryGroup);

    // --- C. COMPONENT 2: ELECTRIC TRACTION MOTOR & INVERTER (AWD DUAL MOTOR) ---
    const motorGroup = new THREE.Group();
    const motorStatus = getComponentStatus('motor');
    const motorColorHex = getStatusColorHex(motorStatus);

    const motorMat = new THREE.MeshStandardMaterial({
      color: motorColorHex,
      emissive: motorColorHex,
      emissiveIntensity: 1.4,
      metalness: 0.9,
      roughness: 0.2
    });
    dynamicMats.set('motor', motorMat);

    // Primary Rear Traction Motor
    const rearMotorGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.68, 24);
    rearMotorGeo.rotateZ(Math.PI / 2);
    const rearMotorMesh = new THREE.Mesh(rearMotorGeo, motorMat);
    rearMotorMesh.position.set(0, 0.35, -1.35);
    motorGroup.add(rearMotorMesh);

    // Stator cooling ribs
    for (let i = -0.28; i <= 0.28; i += 0.08) {
      const ribGeo = new THREE.TorusGeometry(0.25, 0.012, 8, 24);
      ribGeo.rotateY(Math.PI / 2);
      const ribMesh = new THREE.Mesh(ribGeo, new THREE.MeshBasicMaterial({ color: 0x20D6C2 }));
      ribMesh.position.set(i, 0.35, -1.35);
      motorGroup.add(ribMesh);
    }

    // Rear Inverter Unit atop Motor
    const invGeo = new THREE.BoxGeometry(0.48, 0.18, 0.42);
    const invMat = new THREE.MeshStandardMaterial({
      color: 0x163C47,
      emissive: 0x20D6C2,
      emissiveIntensity: 0.8,
      metalness: 0.8
    });
    const invMesh = new THREE.Mesh(invGeo, invMat);
    invMesh.position.set(0, 0.54, -1.35);
    motorGroup.add(invMesh);

    // Front Secondary Motor (AWD performance)
    const frontMotorGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.56, 20);
    frontMotorGeo.rotateZ(Math.PI / 2);
    const frontMotorMesh = new THREE.Mesh(frontMotorGeo, motorMat);
    frontMotorMesh.position.set(0, 0.35, 1.35);
    motorGroup.add(frontMotorMesh);

    motorGroup.name = 'motor';
    motorGroup.userData = { id: 'motor', name: 'Permanent Magnet Traction Motor' };
    clickableMap.set('motor', motorGroup);
    internalGroup.add(motorGroup);

    // --- D. COMPONENT 3: WHEELS, TYRES (TPMS) & REGENERATIVE BRAKES ---
    const tyreGroup = new THREE.Group();
    const brakeGroup = new THREE.Group();
    const tyreStatus = getComponentStatus('tyres');
    const tyreColorHex = getStatusColorHex(tyreStatus);

    const rubberMat = new THREE.MeshStandardMaterial({
      color: 0x11161B,
      roughness: 0.85,
      metalness: 0.1,
      wireframe: isXray
    });

    const rimMat = new THREE.MeshStandardMaterial({
      color: 0x334E5A,
      metalness: 0.95,
      roughness: 0.15
    });

    const rimNeonMat = new THREE.MeshStandardMaterial({
      color: tyreColorHex,
      emissive: tyreColorHex,
      emissiveIntensity: tyreStatus !== 'normal' ? 3.0 : 1.4
    });
    dynamicMats.set('tyres', rimNeonMat);

    const brakeRotorMat = new THREE.MeshStandardMaterial({
      color: 0x94A3B8,
      metalness: 0.95,
      roughness: 0.1
    });

    const caliperMat = new THREE.MeshStandardMaterial({
      color: 0xF15B65,
      emissive: 0xF15B65,
      emissiveIntensity: 1.0
    });

    const wheelCoordinates = [
      { id: 'wheel_fl', x: -0.94, y: 0.36, z: 1.35, isLeft: true },
      { id: 'wheel_fr', x: 0.94, y: 0.36, z: 1.35, isLeft: false },
      { id: 'wheel_rl', x: -0.94, y: 0.36, z: -1.35, isLeft: true },
      { id: 'wheel_rr', x: 0.94, y: 0.36, z: -1.35, isLeft: false },
    ];

    wheelCoordinates.forEach((wp) => {
      const singleWheel = new THREE.Group();
      singleWheel.position.set(wp.x, wp.y, wp.z);

      // Tyre rubber
      const tyreGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.24, 28);
      tyreGeo.rotateZ(Math.PI / 2);
      const tyreMesh = new THREE.Mesh(tyreGeo, rubberMat);
      tyreMesh.castShadow = true;
      singleWheel.add(tyreMesh);

      // Multi-spoke Rim
      const rimGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.25, 20);
      rimGeo.rotateZ(Math.PI / 2);
      const rimMesh = new THREE.Mesh(rimGeo, rimMat);
      singleWheel.add(rimMesh);

      // Glowing Neon Rim Accent Ring (matching Image 1)
      const ringAccentGeo = new THREE.TorusGeometry(0.23, 0.015, 12, 32);
      ringAccentGeo.rotateY(Math.PI / 2);
      const ringAccentMesh = new THREE.Mesh(ringAccentGeo, rimNeonMat);
      singleWheel.add(ringAccentMesh);

      tyreGroup.add(singleWheel);

      // Brake Rotor Disc
      const discGeo = new THREE.CylinderGeometry(0.19, 0.19, 0.04, 20);
      discGeo.rotateZ(Math.PI / 2);
      const discMesh = new THREE.Mesh(discGeo, brakeRotorMat);
      discMesh.position.set(wp.x * 0.88, wp.y, wp.z);
      brakeGroup.add(discMesh);

      // Brake Caliper
      const caliperGeo = new THREE.BoxGeometry(0.08, 0.12, 0.10);
      const caliperMesh = new THREE.Mesh(caliperGeo, caliperMat);
      caliperMesh.position.set(wp.x * 0.88, wp.y + 0.12, wp.z + (wp.isLeft ? 0.08 : -0.08));
      brakeGroup.add(caliperMesh);

      // Suspension Coilover Strut
      const strutGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.45, 12);
      const strutMesh = new THREE.Mesh(strutGeo, new THREE.MeshStandardMaterial({ color: 0x20D6C2, metalness: 0.8 }));
      strutMesh.position.set(wp.x * 0.75, wp.y + 0.24, wp.z);
      strutMesh.rotation.z = wp.isLeft ? 0.2 : -0.2;
      internalGroup.add(strutMesh);
    });

    tyreGroup.name = 'tyres';
    tyreGroup.userData = { id: 'tyres', name: 'Tyre Pressure Monitoring System (TPMS)' };
    clickableMap.set('tyres', tyreGroup);
    carGroup.add(tyreGroup);

    brakeGroup.name = 'brakes';
    brakeGroup.userData = { id: 'brakes', name: 'Electro-Hydraulic & Regenerative Braking' };
    clickableMap.set('brakes', brakeGroup);
    internalGroup.add(brakeGroup);

    // --- E. COMPONENT 4: COOLING SYSTEM & THERMAL MANAGEMENT LOOP ---
    const coolingGroup = new THREE.Group();
    const coolStatus = getComponentStatus('cooling');
    const coolColorHex = getStatusColorHex(coolStatus); // Amber because P0A93 notice

    const coolMat = new THREE.MeshStandardMaterial({
      color: coolColorHex,
      emissive: coolColorHex,
      emissiveIntensity: 2.2,
      roughness: 0.15
    });
    dynamicMats.set('cooling', coolMat);

    // Front Active Heat Exchanger Radiator
    const radGeo = new THREE.BoxGeometry(1.25, 0.28, 0.12);
    const radMesh = new THREE.Mesh(radGeo, coolMat);
    radMesh.position.set(0, 0.42, 1.95);
    coolingGroup.add(radMesh);

    // Cooling loop fluid conduits routing through chassis to inverters and battery pack
    const coolCurveLeft = [
      new THREE.Vector3(-0.50, 0.38, 1.90),
      new THREE.Vector3(-0.65, 0.22, 1.15),
      new THREE.Vector3(-0.65, 0.22, -0.85),
      new THREE.Vector3(-0.25, 0.35, -1.30)
    ];
    const coolCurveRight = [
      new THREE.Vector3(0.50, 0.38, 1.90),
      new THREE.Vector3(0.65, 0.22, 1.15),
      new THREE.Vector3(0.65, 0.22, -0.85),
      new THREE.Vector3(0.25, 0.35, -1.30)
    ];

    const tubeGeoL = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(coolCurveLeft), 32, 0.026, 8, false);
    coolingGroup.add(new THREE.Mesh(tubeGeoL, coolMat));

    const tubeGeoR = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(coolCurveRight), 32, 0.026, 8, false);
    coolingGroup.add(new THREE.Mesh(tubeGeoR, coolMat));

    coolingGroup.name = 'cooling';
    coolingGroup.userData = { id: 'cooling', name: 'Thermal Management & Cooling Loop' };
    clickableMap.set('cooling', coolingGroup);
    internalGroup.add(coolingGroup);

    // --- F. COMPONENT 5: HIGH-VOLTAGE HARNESS & 12V DC-DC POWER CONVERTER ---
    const electronicsGroup = new THREE.Group();
    const elecStatus = getComponentStatus('electronics');
    const elecColorHex = getStatusColorHex(elecStatus);

    const hvCableMat = new THREE.MeshStandardMaterial({
      color: 0xFF6B2B, // Automotive Safety Orange
      emissive: 0xFF6B2B,
      emissiveIntensity: 1.0,
      roughness: 0.3
    });

    const dcDcMat = new THREE.MeshStandardMaterial({
      color: elecColorHex,
      emissive: elecColorHex,
      emissiveIntensity: 1.2
    });

    // 12V DC-DC Auxiliary Converter Unit
    const dcDcGeo = new THREE.BoxGeometry(0.38, 0.16, 0.32);
    const dcDcMesh = new THREE.Mesh(dcDcGeo, dcDcMat);
    dcDcMesh.position.set(0.45, 0.62, 1.15);
    electronicsGroup.add(dcDcMesh);

    // Thick High-Voltage Cables from Battery to Rear & Front Inverters
    const hvRearCurve = [
      new THREE.Vector3(0.12, 0.26, -1.10),
      new THREE.Vector3(0.12, 0.48, -1.25)
    ];
    const hvTubeR = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(hvRearCurve), 8, 0.035, 8, false);
    electronicsGroup.add(new THREE.Mesh(hvTubeR, hvCableMat));

    const hvFrontCurve = [
      new THREE.Vector3(-0.12, 0.26, 1.10),
      new THREE.Vector3(-0.12, 0.44, 1.25)
    ];
    const hvTubeF = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(hvFrontCurve), 8, 0.035, 8, false);
    electronicsGroup.add(new THREE.Mesh(hvTubeF, hvCableMat));

    electronicsGroup.name = 'electronics';
    electronicsGroup.userData = { id: 'electronics', name: '12V Auxiliary DC-DC & Power Electronics' };
    clickableMap.set('electronics', electronicsGroup);
    internalGroup.add(electronicsGroup);

    // --- G. COMPONENT 6: HIGH-POWER CHARGING PORT (CCS2) ---
    const portGroup = new THREE.Group();
    const portStatus = getComponentStatus('charging_port');
    const portColorHex = getStatusColorHex(portStatus);

    const portMat = new THREE.MeshStandardMaterial({
      color: portColorHex,
      emissive: portColorHex,
      emissiveIntensity: 2.5
    });

    // Illuminated CCS2 Receptacle Ring
    const portRingGeo = new THREE.TorusGeometry(0.08, 0.016, 12, 24);
    portRingGeo.rotateY(Math.PI / 2);
    const portRingMesh = new THREE.Mesh(portRingGeo, portMat);
    portRingMesh.position.set(-0.95, 0.68, -1.72);
    portGroup.add(portRingMesh);

    // Weather-sealed Port Housing
    const portBoxGeo = new THREE.BoxGeometry(0.08, 0.16, 0.16);
    const portBoxMesh = new THREE.Mesh(portBoxGeo, new THREE.MeshStandardMaterial({ color: 0x162A33 }));
    portBoxMesh.position.set(-0.90, 0.68, -1.72);
    portGroup.add(portBoxMesh);

    portGroup.name = 'charging_port';
    portGroup.userData = { id: 'charging_port', name: 'Combined Charging System (CCS2) & Inverter' };
    clickableMap.set('charging_port', portGroup);
    carGroup.add(portGroup);

    // 8. Animation Loop
    let animId: number;
    const clock = new THREE.Clock();

    const animate = () => {
      animId = requestAnimationFrame(animate);
      const elapsedTime = clock.getElapsedTime();

      // Gentle futuristic pulse on glowing materials (battery cells & coolant loop)
      if (battCellGlowMat) {
        battCellGlowMat.emissiveIntensity = 2.0 + 0.5 * Math.sin(elapsedTime * 3.2);
      }
      if (coolMat) {
        coolMat.emissiveIntensity = 1.8 + 0.6 * Math.sin(elapsedTime * 2.6);
      }

      // Update controls
      if (controlsRef.current) {
        controlsRef.current.update();
      }

      renderer.render(scene, camera);
    };

    animate();

    // 9. Resize Listener
    const handleResize = () => {
      if (!container || !rendererRef.current || !cameraRef.current) return;
      const w = container.clientWidth;
      const h = container.clientHeight || 520;
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
    };

    window.addEventListener('resize', handleResize);

    // 10. Pointer Interactions (Raycasting for Click & Hover)
    const handlePointerDown = (event: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      mouseRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouseRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycasterRef.current.setFromCamera(mouseRef.current, camera);
      const allObjects: THREE.Object3D[] = [];
      clickableMap.forEach(obj => {
        allObjects.push(...obj.children);
      });

      const intersects = raycasterRef.current.intersectObjects(allObjects, true);
      if (intersects.length > 0) {
        let current: THREE.Object3D | null = intersects[0].object;
        while (current && current.parent && !current.userData?.id) {
          current = current.parent;
        }
        if (current && current.userData?.id) {
          const compId = current.userData.id;
          handleSelectComponent(compId);
        }
      }
    };

    const handlePointerMove = (event: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      mouseRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouseRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycasterRef.current.setFromCamera(mouseRef.current, camera);
      const allObjects: THREE.Object3D[] = [];
      clickableMap.forEach(obj => {
        allObjects.push(...obj.children);
      });

      const intersects = raycasterRef.current.intersectObjects(allObjects, true);
      if (intersects.length > 0) {
        let current: THREE.Object3D | null = intersects[0].object;
        while (current && current.parent && !current.userData?.id) {
          current = current.parent;
        }
        if (current && current.userData?.id) {
          setHoveredCompId(current.userData.id);
          container.style.cursor = 'pointer';
          return;
        }
      }
      setHoveredCompId(null);
      container.style.cursor = 'default';
    };

    container.addEventListener('click', handlePointerDown);
    container.addEventListener('mousemove', handlePointerMove);

    return () => {
      window.removeEventListener('resize', handleResize);
      container.removeEventListener('click', handlePointerDown);
      container.removeEventListener('mousemove', handlePointerMove);
      cancelAnimationFrame(animId);
      renderer.dispose();
      controls.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  // Handle X-ray Mode Toggle
  useEffect(() => {
    if (!bodyMeshGroupRef.current) return;
    bodyMeshGroupRef.current.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        if (Array.isArray(mesh.material)) return;
        const mat = mesh.material as THREE.MeshPhysicalMaterial;
        if (isXray) {
          mat.transparent = true;
          mat.opacity = 0.22;
          mat.wireframe = false;
        } else {
          mat.transparent = false;
          mat.opacity = 0.95;
          mat.wireframe = false;
        }
        mat.needsUpdate = true;
      }
    });
  }, [isXray]);

  // Handle Auto Rotate Toggle
  useEffect(() => {
    if (controlsRef.current) {
      controlsRef.current.autoRotate = autoRotate;
    }
  }, [autoRotate]);

  // Camera Presets & Smooth Focus
  const setCameraView = (angle: ViewAngle) => {
    if (!cameraRef.current || !controlsRef.current) return;
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    setCurrentAngle(angle);
    setAutoRotate(false);

    switch (angle) {
      case 'front':
        camera.position.set(0, 1.2, 5.0);
        controls.target.set(0, 0.45, 0);
        break;
      case 'rear':
        camera.position.set(0, 1.2, -5.0);
        controls.target.set(0, 0.45, 0);
        break;
      case 'left':
        camera.position.set(-5.0, 1.2, 0);
        controls.target.set(0, 0.45, 0);
        break;
      case 'right':
        camera.position.set(5.0, 1.2, 0);
        controls.target.set(0, 0.45, 0);
        break;
      case 'top':
        camera.position.set(0, 6.2, 0.05);
        controls.target.set(0, 0.2, 0);
        break;
      case 'battery':
        // Elevated underside 3/4 view focusing on the battery pack
        camera.position.set(3.4, 0.7, 3.4);
        controls.target.set(0, 0.2, 0);
        setIsXray(true);
        break;
      case 'free':
      default:
        camera.position.set(4.2, 2.5, 4.6);
        controls.target.set(0, 0.45, 0);
        break;
    }
    controls.update();
  };

  // Zoom In / Out Handlers
  const handleZoom = (direction: 'in' | 'out') => {
    if (!cameraRef.current || !controlsRef.current) return;
    const camera = cameraRef.current;
    const factor = direction === 'in' ? 0.85 : 1.18;
    camera.position.multiplyScalar(factor);
    controlsRef.current.update();
  };

  const handleSelectComponent = (compId: string) => {
    setActiveCompId(compId);
    if (onComponentClick) onComponentClick(compId);

    // Look for real-time telemetry details
    const detail = healthComponents.find(c => c.component_id === compId);
    if (detail) {
      setInspectionModal(detail);
    } else {
      // Fallback telemetry detail
      const fallbackDetails: Record<string, ComponentHealthDetail> = {
        battery: {
          component_id: 'battery',
          name: 'High-Voltage Battery Pack & Modules',
          status: getComponentStatus('battery'),
          current_reading: `${soc}% SOC | ${packVoltage}V | ${packTemp}°C | SOH ${soh}% | Delta 6.5mV`,
          temperature_c: packTemp,
          voltage_v: packVoltage,
          severity: 'normal',
          description: 'NMC 811 Lithium-ion cell chemistry arranged in 16 modular sub-packs with skateboard chassis integration. Active liquid cooling channels maintain cell delta below 8 mV.',
          recommendation: 'Maintain standard 20%-80% charging habits for maximum pack lifecycle longevity.',
          diagnostic_history: []
        },
        motor: {
          component_id: 'motor',
          name: 'Permanent Magnet Traction Motor',
          status: getComponentStatus('motor'),
          current_reading: 'Dual-Inverter AWD | Stator 56.2°C | Inverter PWM 98.2%',
          temperature_c: 56.2,
          severity: 'normal',
          description: 'High-torque permanent magnet synchronous motor with silicon carbide (SiC) MOSFET power stages and integrated helical reduction gearbox.',
          recommendation: 'Drive unit lubricant scheduled for routine inspection at 80,000 km.',
          diagnostic_history: []
        },
        tyres: {
          component_id: 'tyres',
          name: 'Tyre Pressure Monitoring System (TPMS)',
          status: tyres?.tpms_status || 'normal',
          current_reading: `FL: ${tyres?.fl.psi || 36.0} PSI | FR: ${tyres?.fr.psi || 35.8} PSI | RL: ${tyres?.rl.psi || 36.2} PSI | RR: ${tyres?.rr.psi || 36.0} PSI`,
          temperature_c: 31.5,
          severity: tyres?.tpms_status === 'warning' ? 'warning' : 'normal',
          description: 'Direct valve-mounted wheel pressure sensors with real-time cavity temperature telemetry and rolling frequency calibration.',
          recommendation: tyres?.tpms_alert || 'All tyres at manufacturer recommended 36.0 PSI specification.',
          diagnostic_history: tyres?.tpms_alert ? [tyres.tpms_alert] : []
        },
        brakes: {
          component_id: 'brakes',
          name: 'Electro-Hydraulic & Regenerative Braking',
          status: 'normal',
          current_reading: 'Regen Efficiency 94% | Friction Wear 18% | Fluid Nominal',
          temperature_c: 42.0,
          severity: 'normal',
          description: 'Blended regenerative braking with brake-by-wire hydraulic modulation and integrated ABS/ESC safety algorithms.',
          recommendation: 'Friction brake pads have over 65,000 km of service life remaining.',
          diagnostic_history: []
        },
        cooling: {
          component_id: 'cooling',
          name: 'Thermal Management & Cooling Loop',
          status: 'warning',
          current_reading: 'Coolant 42.0°C | Loop 1.4 Bar | Heat Pump Active',
          temperature_c: 42.0,
          severity: 'warning',
          description: 'Reversible dual-circuit ethylene glycol liquid cooling loop with chiller heat exchanger and active front aero shutter system.',
          recommendation: 'P0A93-00 advisory: Check inverter coolant reservoir fluid level and ensure active aero shutters are unobstructed.',
          diagnostic_history: ['P0A93-00: Inverter cooling loop flow restriction notice']
        },
        electronics: {
          component_id: 'electronics',
          name: '12V Auxiliary DC-DC & Power Electronics',
          status: 'normal',
          current_reading: '12V Aux: 13.8V Float | DC-DC 95.8% | Isolation >500 MΩ',
          voltage_v: 13.8,
          severity: 'normal',
          description: 'High-voltage to low-voltage DC-DC buck converter maintaining stable float voltage for safety ECUs, steering, and infotainment.',
          recommendation: 'Auxiliary electrical bus healthy. Float voltage steady.',
          diagnostic_history: []
        },
        charging_port: {
          component_id: 'charging_port',
          name: 'Combined Charging System (CCS2) & Inverter',
          status: 'normal',
          current_reading: `${doors?.charge_port ? 'Port Open' : 'Port Closed'} | CCS2 / Type 2 | Ready`,
          severity: 'normal',
          description: 'Motorized weather-sealed charging flap with integrated LED status halo, solenoid latch lock, and thermal sensor on charge inlet pins.',
          recommendation: 'Ensure charging pins remain clean of debris or moisture.',
          diagnostic_history: []
        }
      };

      if (fallbackDetails[compId]) {
        setInspectionModal(fallbackDetails[compId]);
      }
    }
  };

  return (
    <div className={`relative bg-gradient-to-b from-[#071B22] to-[#0A262E] border border-cyan-500/30 rounded-2xl overflow-hidden shadow-2xl flex flex-col ${className}`}>
      
      {/* Top Cockpit Header Bar */}
      <div className="z-10 px-4 py-3 bg-[#06151B]/85 backdrop-blur-md border-b border-cyan-500/20 flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-3">
          <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping" />
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm sm:text-base font-bold text-white tracking-wide">
                {vehicleName}
              </h3>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-500/40 font-mono font-bold">
                360° 3D COCKPIT
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-mono">
              Transparent Wireframe • High-Voltage Battery Architecture
            </p>
          </div>
        </div>

        {/* View Presets & Controls */}
        <div className="flex items-center flex-wrap gap-1.5 sm:gap-2">
          
          {/* X-Ray Cutaway Toggle */}
          <button
            onClick={() => setIsXray(!isXray)}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
              isXray
                ? 'bg-cyan-500 text-black shadow-md shadow-cyan-500/30 font-bold'
                : 'bg-slate-800/80 text-cyan-300 border border-cyan-500/30 hover:bg-slate-700/80'
            }`}
            title="Toggle Transparent Wireframe / Solid Mode"
          >
            {isXray ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{isXray ? 'X-Ray Wireframe' : 'Solid Body'}</span>
          </button>

          {/* Zoom In & Out */}
          <div className="flex items-center bg-slate-900/90 rounded-lg p-0.5 border border-cyan-500/20">
            <button
              onClick={() => handleZoom('in')}
              className="p-1.5 text-slate-400 hover:text-cyan-300 transition"
              title="Zoom In"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => handleZoom('out')}
              className="p-1.5 text-slate-400 hover:text-cyan-300 transition"
              title="Zoom Out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Reset Camera Position */}
          <button
            onClick={() => setCameraView('free')}
            className="p-1.5 rounded-lg bg-slate-800/80 text-slate-300 hover:text-white border border-slate-700 transition"
            title="Reset Camera View"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>

          {/* Auto Rotate Toggle */}
          <button
            onClick={() => setAutoRotate(!autoRotate)}
            className={`p-1.5 rounded-lg text-xs transition-all ${
              autoRotate
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                : 'bg-slate-800/80 text-slate-400 border border-slate-700'
            }`}
            title="Toggle 360° Auto-Rotation"
          >
            <RotateCw className={`w-3.5 h-3.5 ${autoRotate ? 'animate-spin' : ''}`} style={{ animationDuration: '6s' }} />
          </button>

          {/* Camera View Buttons */}
          <div className="hidden md:flex items-center bg-slate-900/90 rounded-lg p-0.5 border border-cyan-500/20">
            {(['front', 'battery', 'left', 'rear', 'top'] as ViewAngle[]).map((angle) => (
              <button
                key={angle}
                onClick={() => setCameraView(angle)}
                className={`px-2 py-0.5 text-[11px] rounded font-medium transition-all capitalize ${
                  currentAngle === angle
                    ? 'bg-cyan-500 text-black font-bold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {angle === 'battery' ? 'Battery' : angle}
              </button>
            ))}
          </div>

        </div>
      </div>

      {/* Main 3D Canvas Mount */}
      <div 
        ref={mountRef} 
        className="relative flex-1 w-full min-h-[440px] sm:min-h-[480px] cursor-grab active:cursor-grabbing outline-none" 
      />

      {/* Hover Info Tooltip */}
      {hoveredCompId && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20 pointer-events-none px-3.5 py-1.5 rounded-full bg-slate-950/90 border border-cyan-400/50 text-cyan-300 text-xs font-mono shadow-2xl backdrop-blur-md flex items-center gap-2 animate-pulse">
          <Zap className="w-3.5 h-3.5 text-cyan-400" />
          <span>Click to Inspect: <strong className="text-white capitalize">{hoveredCompId.replace('_', ' ')}</strong></span>
        </div>
      )}

      {/* Bottom Component Selector Bar */}
      <div className="z-10 p-2.5 bg-[#06151B]/90 backdrop-blur-md border-t border-cyan-500/20 flex items-center overflow-x-auto gap-2 scrollbar-none">
        <span className="text-[11px] font-mono text-cyan-400 uppercase tracking-wider px-2 whitespace-nowrap flex items-center gap-1 font-bold">
          <Compass className="w-3.5 h-3.5" /> Subsystems:
        </span>
        {[
          { id: 'battery', name: 'Battery Pack', icon: Zap },
          { id: 'motor', name: 'Traction Motor', icon: Gauge },
          { id: 'cooling', name: 'Cooling Loop', icon: Wind },
          { id: 'charging_port', name: 'CCS2 Port', icon: BatteryCharging },
          { id: 'electronics', name: '12V DC-DC', icon: Cpu },
          { id: 'tyres', name: 'TPMS Tyres', icon: Disc },
          { id: 'brakes', name: 'Brakes', icon: Shield },
        ].map((comp) => {
          const status = getComponentStatus(comp.id);
          const Icon = comp.icon;
          const isSelected = activeCompId === comp.id;

          return (
            <button
              key={comp.id}
              onClick={() => handleSelectComponent(comp.id)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap flex items-center gap-1.5 transition-all ${
                isSelected
                  ? 'bg-cyan-500 text-black font-bold shadow-md shadow-cyan-500/30'
                  : 'bg-slate-900/80 text-slate-300 border border-slate-800 hover:border-cyan-500/40 hover:text-white'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${
                status === 'critical' ? 'bg-rose-500 animate-pulse' :
                status === 'warning' ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'
              }`} />
              <Icon className="w-3.5 h-3.5" />
              <span>{comp.name}</span>
            </button>
          );
        })}
      </div>

      {/* DETAILED COMPONENT INSPECTION MODAL */}
      {inspectionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fadeIn">
          <div className="w-full max-w-lg bg-[#071B22] border border-cyan-500/40 rounded-2xl shadow-2xl overflow-hidden animate-scaleUp">
            
            {/* Modal Header */}
            <div className="px-6 py-4 bg-slate-900/90 border-b border-cyan-500/20 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-xl ${
                  inspectionModal.status === 'critical' ? 'bg-rose-500/20 text-rose-400' :
                  inspectionModal.status === 'warning' ? 'bg-amber-500/20 text-amber-400' :
                  'bg-emerald-500/20 text-emerald-400'
                }`}>
                  {inspectionModal.status === 'critical' ? <XCircle className="w-5 h-5" /> :
                   inspectionModal.status === 'warning' ? <AlertTriangle className="w-5 h-5" /> :
                   <CheckCircle2 className="w-5 h-5" />}
                </div>
                <div>
                  <h4 className="text-base font-bold text-white tracking-wide">
                    {inspectionModal.name}
                  </h4>
                  <p className="text-xs text-slate-400 font-mono">
                    Subsystem ID: {inspectionModal.component_id.toUpperCase()}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setInspectionModal(null)}
                className="w-8 h-8 rounded-lg bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 flex items-center justify-center transition-all font-bold"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4">
              {/* Status Badge & Sensor Reading Card */}
              <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 flex items-center justify-between">
                <div>
                  <div className="text-[11px] text-slate-400 uppercase font-mono">Current Live CAN-Bus Reading</div>
                  <div className="text-sm font-bold text-cyan-300 font-mono mt-0.5">
                    {inspectionModal.current_reading}
                  </div>
                </div>
                <div className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                  inspectionModal.status === 'critical' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40' :
                  inspectionModal.status === 'warning' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' :
                  'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                }`}>
                  {inspectionModal.status}
                </div>
              </div>

              {/* Architecture & Function */}
              <div>
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                  Architecture & Function
                </label>
                <p className="text-xs sm:text-sm text-slate-300 leading-relaxed bg-slate-900/60 p-3 rounded-lg border border-slate-800">
                  {inspectionModal.description}
                </p>
              </div>

              {/* Recommended Action */}
              <div>
                <label className="text-xs font-semibold text-cyan-400 uppercase tracking-wider block mb-1 flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 text-cyan-400" /> Maintenance Recommendation
                </label>
                <div className="p-3 rounded-lg bg-cyan-950/30 border border-cyan-500/30 text-xs sm:text-sm text-cyan-200">
                  {inspectionModal.recommendation}
                </div>
              </div>

              {/* Diagnostic History */}
              {inspectionModal.diagnostic_history && inspectionModal.diagnostic_history.length > 0 && (
                <div>
                  <label className="text-xs font-semibold text-amber-400 uppercase tracking-wider block mb-1">
                    Recorded CAN-Bus Diagnostic Events
                  </label>
                  <div className="space-y-1.5">
                    {inspectionModal.diagnostic_history.map((event, idx) => (
                      <div key={idx} className="p-2 rounded bg-amber-950/20 border border-amber-500/30 text-xs font-mono text-amber-200 flex items-center gap-2">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                        <span>{event}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-slate-900/90 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => setInspectionModal(null)}
                className="px-5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black text-xs font-bold transition-all shadow-md shadow-cyan-500/20"
              >
                Close Inspection
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default VehicleDigitalTwin3D;