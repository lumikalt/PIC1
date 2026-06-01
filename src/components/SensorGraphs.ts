import * as THREE from "three";
import { Chart, type ChartDataset } from "chart.js/auto";

const MAXPTS = 80;
const API_POLL_MS = 200;
const DEG2RAD = Math.PI / 180;

type Lang = "pt" | "en";

const MOTOR_TRANSLATIONS: Record<string, Record<Lang, string>> = {
  "Parado":             { pt: "Parado",             en: "Stopped" },
  "Frente / Ativo (+)": { pt: "Frente / Ativo (+)", en: "Forward / Active (+)" },
  "Trás / Ativo (-)":   { pt: "Trás / Ativo (-)",   en: "Reverse / Active (-)" },
  "Desligado":          { pt: "Desligado",           en: "Off" },
};

function translateMotor(value: string, lang: Lang): string {
  return MOTOR_TRANSLATIONS[value]?.[lang] ?? value; // fallback: return as-is
}

interface SensorData {
  mx: number;
  my: number;
  mz: number;
  heading: number;
  ax: number;
  ay: number;
  az: number;
  roll: number;
  pitch: number;
  yaw: number;
  motor: string;
}

// ── Three.js ────────────────────────────────────────────────────────
function initThree(container: HTMLElement) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    45,
    container.clientWidth / container.clientHeight,
    0.1,
    100,
  );
  camera.position.set(0, 1.5, 4);
  camera.lookAt(0, 0, 0);

  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const dir = new THREE.DirectionalLight(0xffffff, 1.2);
  dir.position.set(5, 8, 5);
  scene.add(dir);

  const group = new THREE.Group();
  group.add(
    new THREE.Mesh(
      new THREE.BoxGeometry(3, 0.15, 2),
      new THREE.MeshPhongMaterial({ color: 0x1a6b1a }),
    ),
  );
  const chip = new THREE.Mesh(
    new THREE.BoxGeometry(0.8, 0.12, 0.8),
    new THREE.MeshPhongMaterial({ color: 0x222222 }),
  );
  chip.position.set(0, 0.135, 0);
  group.add(chip);

  const ant = new THREE.Mesh(
    new THREE.BoxGeometry(0.15, 0.4, 0.05),
    new THREE.MeshPhongMaterial({ color: 0x888888 }),
  );
  ant.position.set(1.35, 0.27, 0);
  group.add(ant);
  group.add(new THREE.AxesHelper(1.8));
  scene.add(group);

  const grid = new THREE.GridHelper(10, 20, 0x334455, 0x223344);
  grid.position.y = -1.5;
  scene.add(grid);

  let targetRoll = 0,
    targetPitch = 0,
    targetYaw = 0;

  const animate = () => {
    requestAnimationFrame(animate);
    group.rotation.x += (targetPitch - group.rotation.x) * 0.15;
    group.rotation.z += (targetRoll - group.rotation.z) * 0.15;
    group.rotation.y += (targetYaw - group.rotation.y) * 0.15;
    renderer.render(scene, camera);
  };
  animate();

  window.addEventListener("resize", () => {
    const w = container.clientWidth,
      h = container.clientHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  });

  return (roll: number, pitch: number, yaw: number) => {
    targetRoll = roll;
    targetPitch = pitch;
    targetYaw = yaw;
  };
}

// ── Chart.js ────────────────────────────────────────────────────────
function makeChart(id: string, labels: string[], colors: string[]): Chart {
  const el = document.getElementById(id);
  if (!(el instanceof HTMLCanvasElement)) {
    throw new Error(
      `[Dashboard] #${id} is not a canvas element (got ${el?.tagName})`,
    );
  }

  const ctx = el.getContext("2d");
  if (!ctx) {
    throw new Error(`[Dashboard] Could not get 2D context from #${id}`);
  }

  const ds = (label: string, color: string): ChartDataset<"line"> => ({
    label,
    borderColor: color,
    backgroundColor: "transparent",
    borderWidth: 1.8,
    pointRadius: 0,
    data: [],
  });

  return new Chart(ctx, {
    // ← pass ctx directly, not the element
    type: "line",
    data: {
      labels: [],
      datasets: labels.map((l, i) => ds(l, colors[i] ?? "#ccc")),
    },
    options: {
      animation: false,
      responsive: true,
      maintainAspectRatio: true,
      plugins: { legend: { labels: { color: "#aaa", boxWidth: 12 } } },
      scales: {
        x: { display: false },
        y: { ticks: { color: "#888" }, grid: { color: "#223" } },
      },
    },
  });
}

function pushChart(chart: Chart, ...values: number[]) {
  const d = chart.data;
  if ((d.labels as string[]).length >= MAXPTS) {
    (d.labels as string[]).shift();
    d.datasets.forEach((ds) => (ds.data as number[]).shift());
  }
  (d.labels as string[]).push(new Date().toLocaleTimeString());
  values.forEach((v, i) => (d.datasets?.[i]?.data as number[]).push(v));
  chart.update("none");
}

// ── Entry point ─────────────────────────────────────────────────────
export function initDashboard(apiBase: string, lang: Lang = "en") {
  const container = document.getElementById("three-container")!;
  const setAngles = initThree(container);

  const magChart = makeChart(
    "magChart",
    ["X (µT)", "Y (µT)", "Z (µT)"],
    ["#f55", "#5f5", "#55f"],
  );
  const accChart = makeChart(
    "accChart",
    ["X (g)", "Y (g)", "Z (g)"],
    ["#f90", "#0cf", "#f0f"],
  );

  const statusEl = document.getElementById("status")!;
  const motorEl = document.getElementById("motor-val")!;
  const vRoll = document.getElementById("v-roll")!;
  const vPitch = document.getElementById("v-pitch")!;
  const vYaw = document.getElementById("v-yaw")!;

  async function poll() {
    try {
      const d: SensorData = await fetch(`${apiBase}/data`, {
        cache: "no-store",
      }).then((r) => r.json());
      setAngles(d.roll * DEG2RAD, d.pitch * DEG2RAD, d.yaw * DEG2RAD);
      vRoll.textContent = d.roll.toFixed(2);
      vPitch.textContent = d.pitch.toFixed(2);
      vYaw.textContent = d.yaw.toFixed(2);
      pushChart(magChart, d.mx, d.my, d.mz);
      pushChart(accChart, d.ax, d.ay, d.az);
      motorEl.textContent = translateMotor(d.motor, lang);
      statusEl.textContent = `[OK] Live — ${new Date().toLocaleTimeString()}`;
    } catch {
      statusEl.textContent = `[ERROR] No connection`;
    }
  }

  setInterval(poll, API_POLL_MS);
  poll();
}
