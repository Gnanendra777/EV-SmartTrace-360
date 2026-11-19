import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { 
  RotateCw, Eye, EyeOff, Compass, Zap, Shield, AlertTriangle, 
  CheckCircle2, XCircle, Info, Maximize2, RefreshCw, Thermometer,
  Gauge, Radio, Disc, Cpu, Wind, Lock, BatteryCharging
} from 'lucide-react';
import { TyreStatus, DoorStatus, SeatbeltStatus, ClimateStatus, ComponentHealthDetail } from '../../types';

interface VehicleDigitalTwin3DProps {
  vehicleName?: string;
  soc?: number;
  soh?: number;
  packVoltage?: number;
  packTemp?: number;
  tyres?: TyreStatus | null;
  doors?: DoorStatus | null;
  seatbelts?: SeatbeltStatus | null;
  climate?: ClimateStatus | null;
  healthComponents?: ComponentHealthDetail[];
  onComponentClick?: (componentId: string) => void;
  className?: string;
}

type ViewAngle = 'front' | 'rear' | 'left' | 'right' | 'top' | 'interior';

export const VehicleDigitalTwin3D: React.FC<VehicleDigitalTwin3DProps> = ({
  vehicleName = 'CyberPulse GT',
  soc = 70,
  soh = 96,
  packVoltage = 398.5,
  packTemp = 28.5,
  tyres,
  doors,
  seatbelts,
  climate,
  healthComponents = [],
  onComponentClick,
  className = ''
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [isXray, setIsXray] = useState(false);
  const [autoRotate, setAutoRotate] = useState(true);
  const [selectedCompId, setSelectedCompId] = useState<string | null>(null);
  const [hoveredCompId, setHoveredCompId] = useState<string | null>(null);
  const [inspectionModal, setInspectionModal] = useState<ComponentHealthDetail | null>(null);
  const [currentAngle, setCurrentAngle] = useState<ViewAngle | 'free'>('free');

  // Internal Three.js references
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const carGroupRef = useRef<THREE.Group | null>(null);
  const bodyMeshGroupRef = useRef<THREE.Group | null>(null);
  const xrayGroupRef = useRef<THREE.Group | null>(null);
  const clickableObjectsRef = useRef<Map<string, THREE.Object3D>>(new Map());
  const raycasterRef = useRef(new THREE.Raycaster());
  const mouseRef = useRef(new THREE.Vector2());

  // Component Status Map based on props
  const getComponentStatus = useCallback((compId: string): 'normal' | 'warning' | 'critical' | 'unavailable' => {
    const found = healthComponents.find(c => c.component_id === compId);
    if (found) return found.status as any;
    if (compId === 'tyres' && tyres?.tpms_status) return tyres.tpms_status;
    if (compId === 'battery' && soc < 20) return 'warning';
    if (compId === 'cooling') return 'warning'; // default advisory
    return 'normal';
  }, [healthComponents, tyres, soc]);

  const getStatusColorHex = (status: string): number => {
    switch (status) {
      case 'warning': return 0xF5B942; // amber
      case 'critical': return 0xF15B65; // red
      case 'unavailable': return 0x64748B; // grey
      case 'normal':
      default: return 0x20D6C2; // electric cyan/green
    }
  };

  // Initialize Three.js Scene
  useEffect(() => {
    if (!mountRef.current) return;
    const container = mountRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight || 480;

    // 1. Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x06151B);
    scene.fog = new THREE.FogExp2(0x06151B, 0.04);
    sceneRef.current = scene;

    // 2. Camera
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(3.8, 2.2, 4.8);
    cameraRef.current = camera;

    // 3. Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // 4. Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2 - 0.02; // Don't flip under the floor
    controls.minDistance = 2.0;
    controls.maxDistance = 14.0;
    controls.autoRotate = autoRotate;
    controls.autoRotateSpeed = 0.8;
    controlsRef.current = controls;

    // 5. Lighting
    const ambientLight = new THREE.AmbientLight(0x0d303b, 1.8);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 2.2);
    dirLight.position.set(5, 8, 5);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    scene.add(dirLight);

    const cyanRimLight = new THREE.PointLight(0x20D6C2, 4.0, 12);
    cyanRimLight.position.set(-4, 2, -3);
    scene.add(cyanRimLight);

    const blueBackLight = new THREE.PointLight(0x438CFF, 3.5, 12);
    blueBackLight.position.set(0, 3, -5);
    scene.add(blueBackLight);

    const underglowLight = new THREE.PointLight(0x20D6C2, 5.0, 5);
    underglowLight.position.set(0, 0.2, 0);
    scene.add(underglowLight);

    // 6. Ground Radar Grid
    const gridHelper = new THREE.GridHelper(16, 24, 0x20D6C2, 0x0e3a45);
    gridHelper.position.y = -0.01;
    scene.add(gridHelper);

    // Circular Hologram telemetry rings
    const ringGeo = new THREE.RingGeometry(2.8, 3.0, 64);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x20D6C2, side: THREE.DoubleSide, transparent: true, opacity: 0.25 });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.rotation.x = Math.PI / 2;
    ringMesh.position.y = 0.005;
    scene.add(ringMesh);

    const outerRingGeo = new THREE.RingGeometry(4.8, 4.9, 64);
    const outerRingMat = new THREE.MeshBasicMaterial({ color: 0x438CFF, side: THREE.DoubleSide, transparent: true, opacity: 0.15 });
    const outerRingMesh = new THREE.Mesh(outerRingGeo, outerRingMat);
    outerRingMesh.rotation.x = Math.PI / 2;
    outerRingMesh.position.y = 0.004;
    scene.add(outerRingMesh);

    // 7. BUILD PROCEDURAL 3D EV DIGITAL TWIN
    const carGroup = new THREE.Group();
    carGroupRef.current = carGroup;
    scene.add(carGroup);

    const clickableMap = clickableObjectsRef.current;
    clickableMap.clear();

    // Group for Outer Body (which toggles transparency/wireframe in X-ray)
    const bodyGroup = new THREE.Group();
    bodyMeshGroupRef.current = bodyGroup;
    carGroup.add(bodyGroup);

    // Group for Internal Powertrain & Components
    const internalGroup = new THREE.Group();
    xrayGroupRef.current = internalGroup;
    carGroup.add(internalGroup);

    // --- OUTER BODYWORK ---
    // Aerodynamic Chassis & Cockpit Cabin
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x0B1920,
      metalness: 0.92,
      roughness: 0.18,
      envMapIntensity: 1.5,
    });

    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0x163842,
      metalness: 0.1,
      roughness: 0.1,
      transmission: 0.85,
      transparent: true,
      opacity: 0.7,
      reflectivity: 0.9
    });

    // Lower Main Body Pan
    const lowerBodyGeo = new THREE.BoxGeometry(1.82, 0.45, 4.2, 4, 2, 8);
    const lowerBodyMesh = new THREE.Mesh(lowerBodyGeo, bodyMat);
    lowerBodyMesh.position.set(0, 0.45, 0);
    lowerBodyMesh.castShadow = true;
    lowerBodyMesh.receiveShadow = true;
    bodyGroup.add(lowerBodyMesh);

    // Upper Cabin Canopy (Glass Cockpit)
    const cabinGeo = new THREE.CylinderGeometry(0.72, 0.90, 2.1, 16, 2, false);
    cabinGeo.rotateZ(Math.PI / 2);
    cabinGeo.scale(0.85, 1.35, 1.0);
    const cabinMesh = new THREE.Mesh(cabinGeo, glassMat);
    cabinMesh.position.set(0, 0.88, -0.15);
    cabinMesh.rotation.y = Math.PI / 2;
    bodyGroup.add(cabinMesh);

    // Roof Top Shell
    const roofGeo = new THREE.BoxGeometry(1.35, 0.08, 1.8);
    const roofMesh = new THREE.Mesh(roofGeo, bodyMat);
    roofMesh.position.set(0, 1.25, -0.15);
    bodyGroup.add(roofMesh);

    // Aerodynamic Hood & Front Grille
    const hoodGeo = new THREE.ConeGeometry(0.95, 1.1, 4);
    hoodGeo.rotateX(-Math.PI / 2);
    hoodGeo.scale(1.0, 0.32, 1.2);
    const hoodMesh = new THREE.Mesh(hoodGeo, bodyMat);
    hoodMesh.position.set(0, 0.52, 1.6);
    bodyGroup.add(hoodMesh);

    // Front Cyber LED Light Bar (Electric Cyan Glow)
    const frontLightGeo = new THREE.BoxGeometry(1.5, 0.06, 0.08);
    const frontLightMat = new THREE.MeshStandardMaterial({
      color: 0x20D6C2,
      emissive: 0x20D6C2,
      emissiveIntensity: 3.5,
      roughness: 0.1
    });
    const frontLightMesh = new THREE.Mesh(frontLightGeo, frontLightMat);
    frontLightMesh.position.set(0, 0.52, 2.12);
    bodyGroup.add(frontLightMesh);

    // Rear Full-Width Tail Light Bar (Neon Crimson Glow)
    const rearLightGeo = new THREE.BoxGeometry(1.6, 0.06, 0.08);
    const rearLightMat = new THREE.MeshStandardMaterial({
      color: 0xF15B65,
      emissive: 0xF15B65,
      emissiveIntensity: 3.0,
      roughness: 0.1
    });
    const rearLightMesh = new THREE.Mesh(rearLightGeo, rearLightMat);
    rearLightMesh.position.set(0, 0.65, -2.12);
    bodyGroup.add(rearLightMesh);

    // --- COMPONENT 1: HIGH VOLTAGE BATTERY PACK (Between front & rear axles) ---
    const batteryGroup = new THREE.Group();
    const battStatus = getComponentStatus('battery');
    const battColor = getStatusColorHex(battStatus);
    const battCaseMat = new THREE.MeshStandardMaterial({
      color: 0x0e2b33,
      metalness: 0.8,
      roughness: 0.3
    });
    const battGlowMat = new THREE.MeshStandardMaterial({
      color: battColor,
      emissive: battColor,
      emissiveIntensity: battStatus === 'critical' ? 3.0 : 1.4,
      metalness: 0.5,
      roughness: 0.2
    });

    const battEnclosureGeo = new THREE.BoxGeometry(1.4, 0.18, 2.4);
    const battEnclosureMesh = new THREE.Mesh(battEnclosureGeo, battCaseMat);
    battEnclosureMesh.position.set(0, 0.22, 0);
    batteryGroup.add(battEnclosureMesh);

    // Individual Battery Modules inside
    for (let r = -1; r <= 1; r += 0.66) {
      for (let c = -0.5; c <= 0.5; c += 0.5) {
        const modGeo = new THREE.BoxGeometry(0.38, 0.12, 0.55);
        const modMesh = new THREE.Mesh(modGeo, battGlowMat);
        modMesh.position.set(c, 0.25, r);
        batteryGroup.add(modMesh);
      }
    }
    // Set user data for raycaster
    batteryGroup.name = 'battery';
    batteryGroup.userData = { id: 'battery', name: 'High-Voltage Battery Pack & Modules' };
    clickableMap.set('battery', batteryGroup);
    internalGroup.add(batteryGroup);

    // --- COMPONENT 2: ELECTRIC TRACTION MOTOR & INVERTER (Rear & Front) ---
    const motorGroup = new THREE.Group();
    const motorStatus = getComponentStatus('motor');
    const motorColor = getStatusColorHex(motorStatus);
    const motorMat = new THREE.MeshStandardMaterial({
      color: motorColor,
      emissive: motorColor,
      emissiveIntensity: 1.2,
      metalness: 0.9,
      roughness: 0.2
    });
    // Rear Primary Motor
    const rearMotorGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.68, 24);
    rearMotorGeo.rotateZ(Math.PI / 2);
    const rearMotorMesh = new THREE.Mesh(rearMotorGeo, motorMat);
    rearMotorMesh.position.set(0, 0.35, -1.35);
    motorGroup.add(rearMotorMesh);

    // Inverter unit atop rear motor
    const invGeo = new THREE.BoxGeometry(0.48, 0.18, 0.42);
    const invMat = new THREE.MeshStandardMaterial({
      color: 0x1f4f5a,
      emissive: 0x20D6C2,
      emissiveIntensity: 0.6,
      metalness: 0.7
    });
    const invMesh = new THREE.Mesh(invGeo, invMat);
    invMesh.position.set(0, 0.52, -1.35);
    motorGroup.add(invMesh);

    // Front Motor (Dual Motor AWD)
    const frontMotorGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.55, 20);
    frontMotorGeo.rotateZ(Math.PI / 2);
    const frontMotorMesh = new THREE.Mesh(frontMotorGeo, motorMat);
    frontMotorMesh.position.set(0, 0.35, 1.35);
    motorGroup.add(frontMotorMesh);

    motorGroup.name = 'motor';
    motorGroup.userData = { id: 'motor', name: 'Permanent Magnet Traction Motor' };
    clickableMap.set('motor', motorGroup);
    internalGroup.add(motorGroup);

    // --- COMPONENT 3 & 4: WHEELS, TYRES (TPMS) & BRAKE SYSTEM ---
    const tyreGroup = new THREE.Group();
    const brakeGroup = new THREE.Group();
    const tyreStatus = getComponentStatus('tyres');
    const tyreColor = getStatusColorHex(tyreStatus);

    const rubberMat = new THREE.MeshStandardMaterial({
      color: 0x111111,
      roughness: 0.85,
      metalness: 0.1
    });
    const rimMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      metalness: 0.95,
      roughness: 0.15
    });
    const rimNeonMat = new THREE.MeshStandardMaterial({
      color: tyreColor,
      emissive: tyreColor,
      emissiveIntensity: tyreStatus !== 'normal' ? 2.5 : 1.2
    });
    const brakeDiscMat = new THREE.MeshStandardMaterial({
      color: 0x94A3B8,
      metalness: 0.95,
      roughness: 0.1
    });
    const caliperMat = new THREE.MeshStandardMaterial({
      color: 0xF15B65,
      emissive: 0xF15B65,
      emissiveIntensity: 0.8
    });

    const wheelPositions = [
      { id: 'wheel_fl', x: -0.92, y: 0.35, z: 1.35, isLeft: true },
      { id: 'wheel_fr', x: 0.92, y: 0.35, z: 1.35, isLeft: false },
      { id: 'wheel_rl', x: -0.92, y: 0.35, z: -1.35, isLeft: true },
      { id: 'wheel_rr', x: 0.92, y: 0.35, z: -1.35, isLeft: false },
    ];

    wheelPositions.forEach((wp) => {
      const singleWheel = new THREE.Group();
      singleWheel.position.set(wp.x, wp.y, wp.z);

      // Tyre rubber torus
      const tyreGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.24, 28);
      tyreGeo.rotateZ(Math.PI / 2);
      const tyreMesh = new THREE.Mesh(tyreGeo, rubberMat);
      tyreMesh.castShadow = true;
      singleWheel.add(tyreMesh);

      // Rim
      const rimGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.25, 20);
      rimGeo.rotateZ(Math.PI / 2);
      const rimMesh = new THREE.Mesh(rimGeo, rimMat);
      singleWheel.add(rimMesh);

      // Neon rim accent ring
      const ringAccentGeo = new THREE.TorusGeometry(0.23, 0.015, 12, 32);
      ringAccentGeo.rotateY(Math.PI / 2);
      const ringAccentMesh = new THREE.Mesh(ringAccentGeo, rimNeonMat);
      singleWheel.add(ringAccentMesh);

      tyreGroup.add(singleWheel);

      // Brake rotor disc
      const discGeo = new THREE.CylinderGeometry(0.19, 0.19, 0.04, 20);
      discGeo.rotateZ(Math.PI / 2);
      const discMesh = new THREE.Mesh(discGeo, brakeDiscMat);
      discMesh.position.set(wp.x * 0.88, wp.y, wp.z);
      brakeGroup.add(discMesh);

      // Brake Caliper
      const caliperGeo = new THREE.BoxGeometry(0.08, 0.12, 0.10);
      const caliperMesh = new THREE.Mesh(caliperGeo, caliperMat);
      caliperMesh.position.set(wp.x * 0.88, wp.y + 0.12, wp.z + (wp.isLeft ? 0.08 : -0.08));
      brakeGroup.add(caliperMesh);
    });

    tyreGroup.name = 'tyres';
    tyreGroup.userData = { id: 'tyres', name: 'Tyre Pressure Monitoring System (TPMS)' };
    clickableMap.set('tyres', tyreGroup);
    carGroup.add(tyreGroup);

    brakeGroup.name = 'brakes';
    brakeGroup.userData = { id: 'brakes', name: 'Electro-Hydraulic & Regenerative Braking' };
    clickableMap.set('brakes', brakeGroup);
    internalGroup.add(brakeGroup);

    // --- COMPONENT 5: COOLING SYSTEM & THERMAL FLUID LOOP ---
    const coolingGroup = new THREE.Group();
    const coolStatus = getComponentStatus('cooling');
    const coolColor = getStatusColorHex(coolStatus);
    const coolMat = new THREE.MeshStandardMaterial({
      color: coolColor,
      emissive: coolColor,
      emissiveIntensity: 2.0,
      roughness: 0.15
    });

    // Front Active Heat Exchanger Radiator
    const radGeo = new THREE.BoxGeometry(1.2, 0.28, 0.12);
    const radMesh = new THREE.Mesh(radGeo, coolMat);
    radMesh.position.set(0, 0.42, 1.95);
    coolingGroup.add(radMesh);

    // Coolant Delivery Loop Tubes (curve from front radiator to battery pack and rear motor)
    const curvePointsLeft = [
      new THREE.Vector3(-0.45, 0.38, 1.9),
      new THREE.Vector3(-0.55, 0.22, 1.2),
      new THREE.Vector3(-0.55, 0.22, -0.8),
      new THREE.Vector3(-0.25, 0.35, -1.3)
    ];
    const curvePointsRight = [
      new THREE.Vector3(0.45, 0.38, 1.9),
      new THREE.Vector3(0.55, 0.22, 1.2),
      new THREE.Vector3(0.55, 0.22, -0.8),
      new THREE.Vector3(0.25, 0.35, -1.3)
    ];

    const tubeGeoL = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(curvePointsLeft), 28, 0.024, 8, false);
    const tubeMeshL = new THREE.Mesh(tubeGeoL, coolMat);
    coolingGroup.add(tubeMeshL);

    const tubeGeoR = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(curvePointsRight), 28, 0.024, 8, false);
    const tubeMeshR = new THREE.Mesh(tubeGeoR, coolMat);
    coolingGroup.add(tubeMeshR);

    coolingGroup.name = 'cooling';
    coolingGroup.userData = { id: 'cooling', name: 'Thermal Management & Cooling Loop' };
    clickableMap.set('cooling', coolingGroup);
    internalGroup.add(coolingGroup);

    // --- COMPONENT 6: POWER ELECTRONICS & HIGH VOLTAGE HARNESS ---
    const electronicsGroup = new THREE.Group();
    const elecStatus = getComponentStatus('electronics');
    const elecColor = getStatusColorHex(elecStatus);
    const hvCableMat = new THREE.MeshStandardMaterial({
      color: 0xFF6B2B, // High Voltage Orange
      emissive: 0xFF6B2B,
      emissiveIntensity: 0.8,
      roughness: 0.4
    });
    const dcDcMat = new THREE.MeshStandardMaterial({
      color: elecColor,
      emissive: elecColor,
      emissiveIntensity: 1.2
    });

    // 12V Auxiliary DC-DC converter unit
    const dcDcGeo = new THREE.BoxGeometry(0.38, 0.16, 0.32);
    const dcDcMesh = new THREE.Mesh(dcDcGeo, dcDcMat);
    dcDcMesh.position.set(0.45, 0.65, 1.15);
    electronicsGroup.add(dcDcMesh);

    // High Voltage Conduits connecting battery to front & rear inverters
    const hvCurveRear = [
      new THREE.Vector3(0.12, 0.28, -1.0),
      new THREE.Vector3(0.12, 0.48, -1.25)
    ];
    const hvTubeR = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(hvCurveRear), 8, 0.035, 8, false);
    electronicsGroup.add(new THREE.Mesh(hvTubeR, hvCableMat));

    const hvCurveFront = [
      new THREE.Vector3(-0.12, 0.28, 1.0),
      new THREE.Vector3(-0.12, 0.42, 1.25)
    ];
    const hvTubeF = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(hvCurveFront), 8, 0.035, 8, false);
    electronicsGroup.add(new THREE.Mesh(hvTubeF, hvCableMat));

    electronicsGroup.name = 'electronics';
    electronicsGroup.userData = { id: 'electronics', name: 'Power Electronics & 12V Auxiliary Bus' };
    clickableMap.set('electronics', electronicsGroup);
    internalGroup.add(electronicsGroup);

    // --- COMPONENT 7: CHARGING PORT (Rear Left Quarter Panel) ---
    const portGroup = new THREE.Group();
    const portStatus = getComponentStatus('charging_port');
    const portColor = getStatusColorHex(portStatus);
    const portMat = new THREE.MeshStandardMaterial({
      color: portColor,
      emissive: portColor,
      emissiveIntensity: 2.2
    });
    // Inlet ring
    const portRingGeo = new THREE.TorusGeometry(0.08, 0.015, 12, 24);
    portRingGeo.rotateY(Math.PI / 2);
    const portRingMesh = new THREE.Mesh(portRingGeo, portMat);
    portRingMesh.position.set(-0.92, 0.68, -1.72);
    portGroup.add(portRingMesh);

    // Charging port housing
    const portBoxGeo = new THREE.BoxGeometry(0.08, 0.15, 0.15);
    const portBoxMesh = new THREE.Mesh(portBoxGeo, new THREE.MeshStandardMaterial({ color: 0x1f2937 }));
    portBoxMesh.position.set(-0.88, 0.68, -1.72);
    portGroup.add(portBoxMesh);

    portGroup.name = 'charging_port';
    portGroup.userData = { id: 'charging_port', name: 'High-Power Charging Port & Actuator' };
    clickableMap.set('charging_port', portGroup);
    carGroup.add(portGroup);

    // --- COMPONENT 8: DOORS & SEAT-BELT SAFETY SYSTEMS ---
    const doorsGroup = new THREE.Group();
    // Front and Rear Bucket Seats with illuminated seatbelt buckles
    const seatMat = new THREE.MeshStandardMaterial({ color: 0x1a2630, roughness: 0.7 });
    const buckleMat = new THREE.MeshStandardMaterial({ color: 0xF15B65, emissive: 0xF15B65, emissiveIntensity: 1.5 });

    const seatPositions = [
      { x: -0.42, y: 0.65, z: 0.15, name: 'Driver Seat' },
      { x: 0.42, y: 0.65, z: 0.15, name: 'Passenger Seat' },
      { x: -0.42, y: 0.68, z: -0.65, name: 'Rear Left Seat' },
      { x: 0.42, y: 0.68, z: -0.65, name: 'Rear Right Seat' },
    ];

    seatPositions.forEach(sp => {
      const seatBottom = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.12, 0.42), seatMat);
      seatBottom.position.set(sp.x, sp.y, sp.z);
      doorsGroup.add(seatBottom);

      const seatBack = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.45, 0.10), seatMat);
      seatBack.position.set(sp.x, sp.y + 0.24, sp.z - 0.18);
      doorsGroup.add(seatBack);

      // Seat belt buckle
      const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.06, 0.04), buckleMat);
      buckle.position.set(sp.x + (sp.x < 0 ? 0.22 : -0.22), sp.y + 0.08, sp.z);
      doorsGroup.add(buckle);
    });

    doorsGroup.name = 'doors';
    doorsGroup.userData = { id: 'doors', name: 'Doors, Trunk & Seat-Belt Restraints' };
    clickableMap.set('doors', doorsGroup);
    internalGroup.add(doorsGroup);

    // 8. Animation Loop
    let animId: number;
    let clock = new THREE.Clock();

    const animate = () => {
      animId = requestAnimationFrame(animate);
      const elapsedTime = clock.getElapsedTime();

      // Gentle pulse on glowing materials (coolant loop & battery)
      battGlowMat.emissiveIntensity = 1.2 + 0.4 * Math.sin(elapsedTime * 3.0);
      coolMat.emissiveIntensity = 1.6 + 0.5 * Math.sin(elapsedTime * 2.5);

      // Orbit controls update
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
      const h = container.clientHeight || 480;
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
        const mat = mesh.material as THREE.MeshStandardMaterial;
        if (isXray) {
          mat.transparent = true;
          mat.opacity = 0.16;
          mat.wireframe = true;
          mat.emissive = new THREE.Color(0x0e3a45);
        } else {
          mat.transparent = false;
          mat.opacity = 1.0;
          mat.wireframe = false;
          mat.emissive = new THREE.Color(0x000000);
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

  // Camera Presets
  const setCameraView = (angle: ViewAngle) => {
    if (!cameraRef.current || !controlsRef.current) return;
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    setCurrentAngle(angle);
    setAutoRotate(false);

    switch (angle) {
      case 'front':
        camera.position.set(0, 1.2, 5.2);
        break;
      case 'rear':
        camera.position.set(0, 1.2, -5.2);
        break;
      case 'left':
        camera.position.set(-5.2, 1.2, 0);
        break;
      case 'right':
        camera.position.set(5.2, 1.2, 0);
        break;
      case 'top':
        camera.position.set(0, 6.8, 0.05);
        break;
      case 'interior':
        camera.position.set(0, 1.0, 0.4);
        setIsXray(true); // Auto enable cutaway so interior is visible
        break;
    }
    controls.target.set(0, 0.45, 0);
    controls.update();
  };

  const handleSelectComponent = (compId: string) => {
    setSelectedCompId(compId);
    if (onComponentClick) onComponentClick(compId);

    // Find health detail
    const detail = healthComponents.find(c => c.component_id === compId);
    if (detail) {
      setInspectionModal(detail);
    } else {
      // Fallback synthetic detail
      const fallbackDetails: Record<string, ComponentHealthDetail> = {
        battery: {
          component_id: 'battery',
          name: 'High-Voltage Battery Pack & Modules',
          status: getComponentStatus('battery'),
          current_reading: `${soc}% SOC | ${packVoltage}V | ${packTemp}°C | SOH ${soh}%`,
          temperature_c: packTemp,
          voltage_v: packVoltage,
          severity: 'normal',
          description: 'NMC 811 Lithium-ion cell chemistry arranged in 16 modular sub-packs. Liquid cooling channels maintain pack temperature gradient under 2.5°C across all modules.',
          recommendation: 'Maintain standard 20%-80% charging habits for maximum cathode preservation.',
          diagnostic_history: []
        },
        motor: {
          component_id: 'motor',
          name: 'Permanent Magnet Traction Motor',
          status: getComponentStatus('motor'),
          current_reading: 'Dual-Inverter AWD | Stator 54.0°C | Inverter PWM 98.2%',
          temperature_c: 54.0,
          severity: 'normal',
          description: 'High-torque permanent magnet synchronous motor with silicon carbide (SiC) MOSFET power stages and integrated helical reduction gear.',
          recommendation: 'Drive unit lubricant scheduled for check at 80,000 km.',
          diagnostic_history: []
        },
        tyres: {
          component_id: 'tyres',
          name: 'Tyre Pressure Monitoring System (TPMS)',
          status: tyres?.tpms_status || 'normal',
          current_reading: `FL: ${tyres?.fl.psi || 36.0} PSI | FR: ${tyres?.fr.psi || 35.8} PSI | RL: ${tyres?.rl.psi || 36.2} PSI | RR: ${tyres?.rr.psi || 36.0} PSI`,
          temperature_c: 31.5,
          severity: tyres?.tpms_status === 'warning' ? 'warning' : 'normal',
          description: 'Continuous valve-stem TPMS transducers reporting pressure and cavity temperature every 5 seconds over secure 433 MHz CAN interface.',
          recommendation: tyres?.tpms_alert || 'All tyres at manufacturer recommended 36 PSI specification.',
          diagnostic_history: tyres?.tpms_alert ? [tyres.tpms_alert] : []
        },
        brakes: {
          component_id: 'brakes',
          name: 'Electro-Hydraulic & Regenerative Braking',
          status: 'normal',
          current_reading: 'Regen Efficiency 94% | Friction Wear 18% | Fluid Nominal',
          temperature_c: 42.0,
          severity: 'normal',
          description: 'Blended braking blending induction stator back-EMF recuperation with four-wheel ventilated hydraulic disc brakes.',
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
          name: 'Power Electronics & 12V Auxiliary Bus',
          status: 'normal',
          current_reading: '12V Aux: 13.8V Float | DC-DC 95.8% | Isolation >500 MΩ',
          voltage_v: 13.8,
          severity: 'normal',
          description: 'Central vehicle power distribution module with high-voltage isolation barrier (>500 MOhm) and 3 kW DC-DC buck converter.',
          recommendation: 'Auxiliary electrical bus healthy. Float voltage steady.',
          diagnostic_history: []
        },
        charging_port: {
          component_id: 'charging_port',
          name: 'High-Power Charging Port & Actuator',
          status: 'normal',
          current_reading: `${doors?.charge_port ? 'Port Open' : 'Port Closed'} | CCS2 / Type 2 | Ready`,
          severity: 'normal',
          description: 'Motorized weather-sealed charging flap with integrated LED status halo, solenoid latch lock, and inlet temperature monitoring.',
          recommendation: 'Ensure charging pins remain clean and dry.',
          diagnostic_history: []
        },
        doors: {
          component_id: 'doors',
          name: 'Doors, Trunk & Seat-Belt Restraints',
          status: 'normal',
          current_reading: `${doors?.locked ? 'All Doors Locked' : 'Unlocked'} | Driver Belt Fastened`,
          severity: 'normal',
          description: 'Integrated cabin security and restraint network with capacitive door handles, ultrasonic intrusion sensors, and belt pretensioners.',
          recommendation: 'All 5 occupant restraint sensors operating with zero fault codes.',
          diagnostic_history: []
        }
      };

      if (fallbackDetails[compId]) {
        setInspectionModal(fallbackDetails[compId]);
      }
    }
  };

  return (
    <div className={`relative bg-gradient-to-b from-[#071B22] to-[#0A262E] border border-cyan-500/30 rounded-2xl overflow-hidden shadow-2xl ${className}`}>
      {/* Top Cockpit Header Bar */}
      <div className="absolute top-0 left-0 right-0 z-10 px-4 py-3 bg-[#06151B]/80 backdrop-blur-md border-b border-cyan-500/20 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-emerald-400 animate-ping" />
          <div>
            <h3 className="text-base font-bold text-white tracking-wide flex items-center gap-2">
              <span>{vehicleName}</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-mono">
                360° DIGITAL TWIN
              </span>
            </h3>
            <p className="text-xs text-slate-400 font-mono">
              Live CAN-Bus Telemetry • 3D Component Inspection Engine
            </p>
          </div>
        </div>

        {/* View Presets & Controls */}
        <div className="flex items-center flex-wrap gap-1.5 sm:gap-2">
          {/* X-Ray Cutaway Toggle */}
          <button
            onClick={() => setIsXray(!isXray)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
              isXray
                ? 'bg-cyan-500 text-black shadow-lg shadow-cyan-500/30 font-bold'
                : 'bg-slate-800/80 text-cyan-300 border border-cyan-500/30 hover:bg-slate-700/80'
            }`}
            title="Toggle X-Ray Cutaway View"
          >
            {isXray ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            <span>{isXray ? 'X-Ray View ON' : 'Normal View'}</span>
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
            <RotateCw className={`w-4 h-4 ${autoRotate ? 'animate-spin' : ''}`} style={{ animationDuration: '6s' }} />
          </button>

          {/* Camera View Buttons */}
          <div className="hidden sm:flex items-center bg-slate-900/90 rounded-lg p-0.5 border border-cyan-500/20">
            {(['front', 'left', 'rear', 'right', 'top', 'interior'] as ViewAngle[]).map((angle) => (
              <button
                key={angle}
                onClick={() => setCameraView(angle)}
                className={`px-2 py-1 text-[11px] rounded font-medium transition-all capitalize ${
                  currentAngle === angle
                    ? 'bg-cyan-500 text-black font-bold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {angle}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main 3D Canvas Mount */}
      <div 
        ref={mountRef} 
        className="w-full h-[460px] sm:h-[540px] cursor-grab active:cursor-grabbing outline-none" 
      />

      {/* Hover Info Tooltip */}
      {hoveredCompId && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20 pointer-events-none px-3 py-1.5 rounded-full bg-slate-900/90 border border-cyan-400/50 text-cyan-300 text-xs font-mono shadow-xl backdrop-blur-md flex items-center gap-2 animate-pulse">
          <Zap className="w-3.5 h-3.5 text-cyan-400" />
          <span>Click to Inspect: <strong className="text-white capitalize">{hoveredCompId.replace('_', ' ')}</strong></span>
        </div>
      )}

      {/* Bottom Component Selector Bar */}
      <div className="absolute bottom-3 left-3 right-3 z-10 p-2 rounded-xl bg-[#06151B]/85 backdrop-blur-md border border-cyan-500/20 flex items-center overflow-x-auto gap-2 scrollbar-none">
        <span className="text-[11px] font-mono text-cyan-400 uppercase tracking-wider px-2 whitespace-nowrap flex items-center gap-1">
          <Compass className="w-3.5 h-3.5" /> Subsystems:
        </span>
        {[
          { id: 'battery', name: 'Battery Pack', icon: Zap },
          { id: 'motor', name: 'Traction Motor', icon: Gauge },
          { id: 'tyres', name: 'TPMS Tyres', icon: Disc },
          { id: 'brakes', name: 'Brake System', icon: Shield },
          { id: 'cooling', name: 'Thermal Loop', icon: Wind },
          { id: 'electronics', name: '12V Power Bus', icon: Cpu },
          { id: 'charging_port', name: 'Charging Port', icon: BatteryCharging },
          { id: 'doors', name: 'Doors & Restraints', icon: Lock },
        ].map((comp) => {
          const status = getComponentStatus(comp.id);
          const Icon = comp.icon;
          const isSelected = selectedCompId === comp.id;

          return (
            <button
              key={comp.id}
              onClick={() => handleSelectComponent(comp.id)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap flex items-center gap-1.5 transition-all ${
                isSelected
                  ? 'bg-cyan-500 text-black font-bold shadow-md shadow-cyan-500/30'
                  : 'bg-slate-900/80 text-slate-300 border border-slate-800 hover:border-cyan-500/40 hover:text-white'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${
                status === 'critical' ? 'bg-rose-500' :
                status === 'warning' ? 'bg-amber-400' : 'bg-emerald-400'
              }`} />
              <Icon className="w-3.5 h-3.5" />
              <span>{comp.name}</span>
            </button>
          );
        })}
      </div>

      {/* Floating TPMS Mini Callouts Hovering in 3D Box */}
      <div className="absolute top-16 right-4 z-10 hidden md:flex flex-col gap-2 pointer-events-none">
        <div className="p-2.5 rounded-xl bg-slate-900/90 border border-cyan-500/30 text-white text-xs font-mono backdrop-blur-md shadow-xl">
          <div className="text-[10px] text-cyan-400 font-bold mb-1 flex items-center gap-1">
            <Radio className="w-3 h-3 text-cyan-400 animate-pulse" /> TPMS SENSORS
          </div>
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div className="px-1.5 py-0.5 rounded bg-slate-800/80 border border-slate-700">
              <span className="text-slate-400">FL:</span> <strong>{tyres?.fl.psi || 36.0}</strong> PSI
            </div>
            <div className="px-1.5 py-0.5 rounded bg-slate-800/80 border border-slate-700">
              <span className="text-slate-400">FR:</span> <strong>{tyres?.fr.psi || 35.8}</strong> PSI
            </div>
            <div className="px-1.5 py-0.5 rounded bg-slate-800/80 border border-slate-700">
              <span className="text-slate-400">RL:</span> <strong>{tyres?.rl.psi || 36.2}</strong> PSI
            </div>
            <div className="px-1.5 py-0.5 rounded bg-slate-800/80 border border-slate-700">
              <span className="text-slate-400">RR:</span> <strong>{tyres?.rr.psi || 36.0}</strong> PSI
            </div>
          </div>
        </div>
      </div>

      {/* DETAILED COMPONENT INSPECTION MODAL */}
      {inspectionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-lg bg-[#071B22] border border-cyan-500/40 rounded-2xl shadow-2xl overflow-hidden animate-scaleUp">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-slate-900/80 border-b border-cyan-500/20 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-xl ${
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
                className="w-8 h-8 rounded-lg bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 flex items-center justify-center transition-all"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4">
              {/* Status Badge & Sensor Reading Card */}
              <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 flex items-center justify-between">
                <div>
                  <div className="text-[11px] text-slate-400 uppercase font-mono">Current Live Reading</div>
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

              {/* Engineering Description */}
              <div>
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                  Architecture & Function
                </label>
                <p className="text-xs sm:text-sm text-slate-300 leading-relaxed bg-slate-900/50 p-3 rounded-lg border border-slate-800/80">
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
            <div className="px-6 py-4 bg-slate-900/80 border-t border-slate-800 flex justify-end gap-3">
              <button
                onClick={() => setInspectionModal(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-all"
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
