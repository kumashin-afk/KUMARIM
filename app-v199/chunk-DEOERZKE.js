import {
  fernPlacementsSteps,
  frozenMarks,
  grassPlacementsSteps,
  hydrology,
  meadowCountSteps,
  planHabitatMeadowSteps,
  planRiparianBaseSteps,
  terrainFunctionsBase
} from "./chunk-JAHX26BK.js";
import "./chunk-EO3UMVBE.js";
import "./chunk-7BT4KW6E.js";
import "./chunk-LJZWUHHS.js";
import "./chunk-HBXKLBXO.js";
import "./chunk-Z77F3JAE.js";
import "./chunk-RO4SQODB.js";
import "./chunk-2OXLF6NH.js";
import "./chunk-MLKGABMK.js";

// chunk-plan-core.js
var planWorld = { terrainFunctions: terrainFunctionsBase(), hydrology, landmarks: [], quality: "high", removed: /* @__PURE__ */ new Set() };
var contexts = /* @__PURE__ */ new Map();
function drain(steps) {
  let step;
  do {
    step = steps.next();
  } while (!step.done);
  return step.value;
}
function reviveGroundcover(list, frozen) {
  for (let i = 0; i < list.length; i++) if (frozen[i]) {
    const points = list[i].points;
    for (const p of points) Object.freeze(p);
    Object.freeze(points);
  }
  return { layers: { groundcover: list } };
}
function reviveObstacles(obstacles) {
  const list = obstacles.list;
  list.cells = obstacles.cells;
  return list;
}
function keep(msg) {
  if (!msg.groundcover || contexts.has(msg.id)) return contexts.get(msg.id) ?? null;
  const kept = { plannedReservations: reviveGroundcover(msg.groundcover, msg.frozen), habitatObstacles: reviveObstacles(msg.obstacles) };
  contexts.set(msg.id, kept);
  while (contexts.size > 16) contexts.delete(contexts.keys().next().value);
  return kept;
}
function planChunk(msg) {
  planWorld.landmarks = msg.landmarks;
  planWorld.quality = msg.quality;
  planWorld.removed = new Set(msg.ferns?.removed || []);
  const kept = contexts.get(msg.ref ?? msg.id) ?? keep(msg);
  if (!kept) throw Error("The chunk's reservations are no longer kept");
  const c = { cx: msg.cx, cz: msg.cz, plannedReservations: kept.plannedReservations, habitatObstacles: kept.habitatObstacles }, out = {}, transfer = [];
  if (msg.meadow) {
    const { max, cap } = msg.meadow, count = Number.isInteger(msg.meadow.count) ? msg.meadow.count : drain(meadowCountSteps(planWorld, c, max, cap)), plan = drain(planHabitatMeadowSteps(planWorld, c, count));
    out.meadow = { max, count, plan };
    if (plan) transfer.push(plan.matrix.buffer, plan.colors.buffer, plan.seatedBankIds.buffer);
  }
  if (msg.grass) {
    const placed = drain(grassPlacementsSteps(planWorld, c, msg.grass.density));
    out.grass = { density: msg.grass.density, grass: placed.grass, tall: placed.tall };
  }
  if (msg.ferns) {
    c.trees = msg.ferns.trees;
    c.rocks = msg.ferns.rocks;
    out.ferns = drain(fernPlacementsSteps(planWorld, c));
  }
  if (msg.riparian) {
    const records = drain(planRiparianBaseSteps(planWorld, c));
    out.riparian = { records, frozen: frozenMarks(records) };
  }
  return { result: out, transfer };
}
export {
  keep,
  planChunk,
  planWorld,
  reviveGroundcover,
  reviveObstacles
};
