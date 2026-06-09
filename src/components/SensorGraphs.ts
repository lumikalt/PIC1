import * as THREE from "three";
import { Chart, type ChartDataset } from "chart.js/auto";

const MAXPTS = 80;
const API_POLL_MS = 200;
const DEG2RAD = Math.PI / 180;

type Lang = "pt" | "en";

// Motor string format from firmware: "Left | Motor A: + | Motor B: 0"
// Maps the leading word to the button data-cmd value
function motorStringToCmd(motor: string): string {
  const s = motor.toLowerCase();
  if (s.startsWith("left"))     return "pos1";
  if (s.startsWith("front"))    return "pos2";
  if (s.startsWith("right"))    return "pos3";
  if (s.startsWith("sequence")) return "auto";
  // Portuguese fallbacks
  if (s.startsWith("esquerda")) return "pos1";
  if (s.startsWith("frente"))   return "pos2";
  if (s.startsWith("direita"))  return "pos3";
  if (s.startsWith("sequência") || s.startsWith("sequencia")) return "auto";
  return "stop";
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
// Model kept exactly as defined — satellite with solar panel, camera, back details
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

  const chip = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshPhongMaterial({ color: 0x888888 }),
  );
  group.add(chip);

  const solar = new THREE.Mesh(
    new THREE.BoxGeometry(0.05, 0.6, 0.6),
    new THREE.MeshPhongMaterial({ color: 0x0000bb, reflectivity: 0.2 }),
  );
  solar.position.set(0.501, 0, 0);

  const camera_hole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2, 0.2, 0.2, 8),
    new THREE.MeshBasicMaterial({ color: 0x000000 }),
  );
  camera_hole.position.set(0, 0, 0.55);
  camera_hole.rotation.x = Math.PI / 2;
  group.add(camera_hole);

  const back1 = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 0.05, 0.02),
    new THREE.MeshPhongMaterial({ color: 0x4ab9a3 }),
  );
  back1.position.set(0, 0.2, -0.51);
  group.add(back1);

  const red1 = new THREE.Mesh(
    new THREE.BoxGeometry(0.2, 0.05, 0.02),
    new THREE.MeshPhongMaterial({ color: 0xff0000 }),
  );
  red1.position.set(-0.25, 0.25, -0.51);
  group.add(red1);

  const back2 = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 0.05, 0.02),
    new THREE.MeshPhongMaterial({ color: 0x4ab9a3 }),
  );
  back2.position.set(0, 0.05, -0.51);
  group.add(back2);

  const red2 = new THREE.Mesh(
    new THREE.BoxGeometry(0.2, 0.05, 0.02),
    new THREE.MeshPhongMaterial({ color: 0xff0000 }),
  );
  red2.position.set(0.2, 0.1, -0.51);
  group.add(red2);

  const back3 = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 0.3, 0.02),
    new THREE.MeshPhongMaterial({ color: 0xffffff }),
  );
  back3.position.set(0, -0.2, -0.51);
  group.add(back3);

  group.add(solar);
  group.add(new THREE.AxesHelper(1.8));
  scene.add(group);

  const grid = new THREE.GridHelper(10, 20, 0x334455, 0x223344);
  grid.position.y = -1;
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

// ── Motor controls ───────────────────────────────────────────────────
function initMotorControls(apiBase: string) {
  const buttons =
    document.querySelectorAll<HTMLButtonElement>(".switch-btn");

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const cmd = btn.dataset.cmd;
      if (!cmd) return;

      // Optimistic UI update
      buttons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      fetch(`${apiBase}/motor?cmd=${cmd}`, { cache: "no-store" }).catch((e) =>
        console.warn("[Motor] command failed:", e),
      );
    });
  });
}

function syncMotorUI(motorState: string) {
  const cmd = motorStringToCmd(motorState);
  const buttons =
    document.querySelectorAll<HTMLButtonElement>(".switch-btn");
  buttons.forEach((b) => {
    b.classList.toggle("active", b.dataset.cmd === cmd);
  });
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

  initMotorControls(apiBase);

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
      motorEl.textContent = d.motor;
      syncMotorUI(d.motor);
      statusEl.textContent = `[OK] Live — ${new Date().toLocaleTimeString()}`;
    } catch {
      statusEl.textContent = `[ERROR] No connection`;
    }
  }

  setInterval(poll, API_POLL_MS);
  poll();
}
