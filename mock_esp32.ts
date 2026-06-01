// mock-esp32.ts  —  run with: pnpm dlx tsx ./mock_esp32.ts
import { createServer } from "http";

const start = Date.now();
const t = () => (Date.now() - start) / 1000;

function sensorData() {
  const s = t();
  return {
    mx: 0.4 + 0.05 * Math.sin(s * 0.3),
    my: -0.63 + 0.04 * Math.cos(s * 0.4),
    mz: -0.67 + 0.03 * Math.sin(s * 0.5),
    heading: (305 + 10 * Math.sin(s * 0.2)) % 360,
    ax: 0.02 * Math.sin(s * 0.7),
    ay: 0.03 * Math.cos(s * 0.5),
    az: 1.0 + 0.01 * Math.sin(s * 1.1),
    roll: 20 * Math.sin(s * 0.4),
    pitch: 15 * Math.sin(s * 0.3 + 1.0),
    yaw: (s * 10) % 360,
    motor:
      Math.floor(s) % 8 < 4
        ? Math.floor(s) % 8 < 2
          ? "Frente / Ativo (+)"
          : "Parado"
        : Math.floor(s) % 8 < 6
        ? "Trás / Ativo (-)"
        : "Parado",
  };
}

createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json");
  if (req.url === "/data") {
    res.end(JSON.stringify(sensorData()));
  } else {
    res.writeHead(404);
    res.end();
  }
}).listen(5001, () => console.log("Mock ESP32 at http://localhost:5001/data"));
