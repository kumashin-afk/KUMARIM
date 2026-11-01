import {
  convexFootprint,
  reservationAllows,
  reservationAllowsPolygon,
  reservationContext,
  stableHash
} from "./chunk-EO3UMVBE.js";
import {
  ISLAND_BIOME_DEFINITIONS,
  ISLAND_BIOME_SEED,
  MEADOW_GUST_GLSL,
  islandBiomeGLSL,
  islandBiomes,
  meadowUniforms,
  sampleIslandBiome,
  worldModel
} from "./chunk-7BT4KW6E.js";
import {
  Box3,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  InstancedBufferAttribute,
  InstancedMesh,
  MathUtils,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  Raycaster,
  ShaderChunk,
  Vector3,
  Vector4
} from "./chunk-HBXKLBXO.js";
import {
  ABYSS,
  approachPoint,
  creaseSplit,
  decimateStages,
  fallAtEnd,
  fallAtStart,
  fallEdge,
  fieldShading,
  generateAbyss,
  hash2,
  hashString,
  lipRowPoint,
  meshFieldStages,
  randomSource,
  restoreVolume,
  sharpenStages,
  signedVolume
} from "./chunk-2OXLF6NH.js";

// resource-rock-water.js
var ORDINARY_ROCK_OCEAN_MAX_DEPTH = 6;
function ordinaryRockWaterAllowed(water, candidateIndex) {
  return water?.kind !== "ocean" || candidateIndex < 19 && Number.isFinite(water.depth) && water.depth <= ORDINARY_ROCK_OCEAN_MAX_DEPTH;
}
var contexts = /* @__PURE__ */ new WeakMap();
function underwaterResourceRockContext(context, rock) {
  if (!rock.underwaterResource) return context;
  let next = contexts.get(context);
  if (!next) {
    const rocks = context.layers.rocks.filter((r) => !(r.hydrology === true && r.id.endsWith(":water-reserve")));
    next = rocks.length === context.layers.rocks.length ? context : { ...context, layers: { ...context.layers, rocks } };
    contexts.set(context, next);
  }
  return next;
}
var COAST_BOULDERS = Object.freeze({ first: 200, count: 24, reach: 140, below: 1.6, above: 3.8 });
var coastScratch = {};
function ordinaryRockCoastAllowed(world, x, z) {
  const c2 = world.terrainFunctions?.coastAt?.(x, z, coastScratch);
  if (!c2) return true;
  const t = Math.min(1, Math.max(0, (c2.dune - 0.06) / 0.39)), dune = t * t * (3 - 2 * t);
  const sandBeach = Math.abs(c2.shore) < 30 && c2.rock + c2.pebble + c2.mud < 0.2 && c2.cliff < 0.1;
  return !sandBeach && c2.mud + 0.8 * dune < 0.45;
}
function coastalBouldersPossible(world, cx, cz) {
  const coastAt = world.terrainFunctions?.coastAt;
  return !!coastAt && Math.abs(coastAt(cx * 64 + 32, cz * 64 + 32, coastScratch).shore) < COAST_BOULDERS.reach;
}
function coastalBoulderCandidate(world, cx, cz, j, rng2, height2) {
  const f2 = world.terrainFunctions, s = COAST_BOULDERS.first + j, x = cx * 64 + rng2(s, 9) * 64, z = cz * 64 + rng2(s, 10) * 64;
  const c2 = f2.coastAt(x, z, coastScratch);
  if (!(c2.rock > 0.08)) return null;
  const y = height2(x, z), above = y - (world.worldModel?.seaLevel ?? world.islandTerrain?.params?.seaLevel ?? 0);
  if (above < -COAST_BOULDERS.below || above > COAST_BOULDERS.above) return null;
  if (rng2(s, 15) > c2.rock * (1 - c2.pebble) * 0.9 * (1 - Math.max(0, above - 1.5) / 2.3)) return null;
  const water = world.hydrology?.waterAt(x, z, y);
  if (water && water.kind !== "ocean") return null;
  const t = rng2(s, 11);
  return { x, y, z, r: 0.55 + t * t * 2.8, id: cx + "," + cz + ":coast-rock:" + j, name: "海辺の岩", ...water ? { underwaterResource: true } : {} };
}

// vegetation-climate.js
function vegetationClimate(functions, x, z, altitude, out = {}) {
  const sample = functions.climate || sampleIslandBiome;
  const result = sample(x, z, altitude ?? functions.height(x, z), out);
  result.dry = result.ash;
  result.winter = result.snow;
  return result;
}
function vegetationCover(climate3) {
  return (1 - climate3.ash * 0.965) * (1 - climate3.snow * 0.99) * (1 - climate3.swamp * 0.45);
}
function vegetationSpecies(climate3, choice) {
  const broadThreshold = climate3.swamp > 0.45 ? 0.1 : 0.35 + Math.max(climate3.ash, climate3.snow, climate3.mountain * 0.7) * 0.65;
  return choice > broadThreshold ? "broadleaf" : "pine";
}
function vegetationLeafless(climate3, choice) {
  return climate3.ash > 0.84 || climate3.swamp > 0.62 && choice > 0.89 || climate3.ash < 0.3 && climate3.snow < 0.3 && climate3.swamp < 0.4 && choice > 0.972;
}
function vegetationTint(climate3, leafless) {
  return climate3.snow > 0.7 ? 13884890 : climate3.ash > 0.7 ? 11511179 : climate3.swamp > 0.6 ? 12765609 : leafless ? 11709346 : 16777215;
}
var chunkClimate = {};
function vegetationChunkCover(functions, cx, cz) {
  let cap = 0;
  for (let iz = 0; iz < 3; iz++) for (let ix = 0; ix < 3; ix++) cap = Math.max(cap, vegetationCover(vegetationClimate(functions, cx * 64 + ix * 32, cz * 64 + iz * 32, void 0, chunkClimate)));
  return Math.min(1, cap + 0.08);
}

// river-reach-morphology.js
var RIVER_REACH_MORPHOLOGY = Object.freeze({ revision: "river-reach-morphology-v72-r1", range: 160, cellSize: 64, indexEntries: 262144, blendBand: 4, curvatureSteps: 5, wetGuard: 6, maxRise: 30, maxCutRise: 14, maxShelfCut: 8, backdropGuard: 23, backdropFade: 40 });
var EMPTY = Object.freeze([]);
var cache = /* @__PURE__ */ new WeakMap();
var clamp = (x) => Math.max(0, Math.min(1, x));
var smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a));
  return t * t * t * (t * (t * 6 - 15) + 10);
};
var mix = (a, b, t) => a + (b - a) * t;
function riverSeed(seed, id) {
  let h = seed >>> 0;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function edge(a, b, side) {
  const dx = b.x - a.x, dz = b.z - a.z;
  return { a, b, dx, dz, length2: dx * dx + dz * dz, side };
}
function project(e, x, z) {
  return clamp(((x - e.a.x) * e.dx + (z - e.a.z) * e.dz) / e.length2);
}
function distance2(e, x, z, t) {
  const dx = x - e.a.x - e.dx * t, dz = z - e.a.z - e.dz * t;
  return dx * dx + dz * dz;
}
function createRiverReachMorphology({ plan, geometry } = {}) {
  if (!Number.isSafeInteger(plan?.seed) || geometry?.plan !== plan || !Array.isArray(geometry.segments)) throw TypeError("Final matching river plan and geometry required");
  const L = plan.generated ? { ...RIVER_REACH_MORPHOLOGY, range: 40 } : RIVER_REACH_MORPHOLOGY, stationData = /* @__PURE__ */ new Map();
  for (const river of plan.rivers) {
    const reaches = river.reaches.filter((r) => !r.oceanConnected), lengths = reaches.map((r) => r.points.at(-1).along - r.points[0].along), total = lengths.reduce((a, b) => a + b, 0), landformSeed = riverSeed(plan.seed, river.id);
    let offset = 0;
    if (!(total > 0)) continue;
    for (let r = 0; r < reaches.length; r++) {
      const points = reaches[r].points;
      for (let i = 0; i < points.length; i++) {
        const p = points[i], lo = Math.max(0, i - L.curvatureSteps), hi = Math.min(points.length - 1, i + L.curvatureSteps), a = points[lo], b = points[hi];
        let ds = 0;
        for (let j = lo + 1; j <= hi; j++) ds += Math.hypot(points[j].x - points[j - 1].x, points[j].z - points[j - 1].z);
        const curvature = ds ? Math.atan2(a.fx * b.fz - a.fz * b.fx, a.fx * b.fx + a.fz * b.fz) / ds : 0;
        const along = offset + p.along - points[0].along;
        stationData.set(p, { progress: clamp(along / total), along, curvature, landformSeed });
      }
      offset += lengths[r];
    }
  }
  const cells = /* @__PURE__ */ new Map(), terrainCells = /* @__PURE__ */ new Set(), records = [];
  let entries = 0, maxBucket = 0;
  for (const s of geometry.segments) {
    if (s.stream.oceanConnected) continue;
    const a = stationData.get(s.a), b = stationData.get(s.b);
    if (!a || !b) throw TypeError("River morphology requires final public station identity");
    const record = { s, a, b, edges: [edge(s.leftA, s.leftB, -1), edge(s.rightA, s.rightB, 1)] };
    records.push(record);
    const bounds2 = s.bounds, x0 = Math.floor((bounds2.minX - L.range) / L.cellSize), x1 = Math.floor((bounds2.maxX + L.range) / L.cellSize), z0 = Math.floor((bounds2.minZ - L.range) / L.cellSize), z1 = Math.floor((bounds2.maxZ + L.range) / L.cellSize);
    if ((x1 - x0 + 1) * (z1 - z0 + 1) > L.indexEntries - entries) throw RangeError("River morphology index budget exceeded");
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      const key = x + "," + z;
      let list = cells.get(key);
      if (!list) cells.set(key, list = []);
      list.push(record);
      entries++;
      maxBucket = Math.max(maxBucket, list.length);
      if (Math.min(a.progress, b.progress) < 0.75) terrainCells.add(key);
    }
  }
  const distances = new Float64Array(maxBucket * 2), projections = new Float64Array(maxBucket * 2);
  function sample(x, z, out = {}) {
    if (!Number.isFinite(x) || !Number.isFinite(z)) throw TypeError("Finite river morphology coordinates required");
    const nearby = cells.get(Math.floor(x / L.cellSize) + "," + Math.floor(z / L.cellSize)) || EMPTY;
    let nearest = Infinity, target = null;
    for (let i = 0; i < nearby.length; i++) for (let j = 0; j < 2; j++) {
      const r = nearby[i], e = r.edges[j], t = project(e, x, z), d2 = distance2(e, x, z, t), index2 = i * 2 + j;
      projections[index2] = t;
      distances[index2] = d2;
      if (d2 < nearest) {
        nearest = d2;
        target = r.s.featureId;
      }
    }
    if (nearest >= L.range * L.range) return null;
    const bankDistance = Math.sqrt(nearest), nearLimit = (bankDistance + L.blendBand) * (bankDistance + L.blendBand);
    let sum = 0, progress = 0, along = 0, bankSide = 0, curvature = 0, width = 0, level = 0, inner = 0, outer = 0, riverId = null, landformSeed = 0;
    for (let i = 0; i < nearby.length; i++) {
      const r = nearby[i];
      if (r.s.featureId !== target) continue;
      riverId = r.s.riverId;
      landformSeed = r.a.landformSeed;
      for (let j = 0; j < 2; j++) {
        const index2 = i * 2 + j;
        if (distances[index2] >= nearLimit) continue;
        const d = Math.sqrt(distances[index2]) - bankDistance;
        const t = projections[index2], w = 1 - smooth(0, L.blendBand, d), k = mix(r.a.curvature, r.b.curvature, t), hw = mix(r.s.a.halfWidth, r.s.b.halfWidth, t), bend = smooth(0.01, 0.085, Math.abs(k) * hw);
        sum += w;
        progress += w * mix(r.a.progress, r.b.progress, t);
        along += w * mix(r.a.along, r.b.along, t);
        bankSide += w * r.edges[j].side;
        curvature += w * k;
        width += w * hw;
        level += w * mix(r.s.a.level, r.s.b.level, t);
        if (k * r.edges[j].side > 0) inner += w * bend;
        else outer += w * bend;
      }
    }
    const q = progress / sum;
    out.featureId = target;
    out.riverId = riverId;
    out.progress = q;
    out.signedCurvature = curvature / sum;
    out.bendStrength = (inner + outer) / sum;
    out.innerWeight = inner / sum;
    out.outerWeight = outer / sum;
    out.upper = 1 - smooth(0.16, 0.34, q);
    out.middle = smooth(0.24, 0.36, q) * (1 - smooth(0.6, 0.75, q));
    out.lower = smooth(0.65, 0.8, q);
    out.bankDistance = bankDistance;
    out.level = level / sum;
    out.halfWidth = width / sum;
    out.along = along / sum;
    out.bankSide = bankSide / sum;
    out.landformSeed = landformSeed;
    return out;
  }
  return Object.freeze({ seed: plan.seed, sample, hasTerrain(x, z) {
    return terrainCells.has(Math.floor(x / L.cellSize) + "," + Math.floor(z / L.cellSize));
  }, stats: Object.freeze({ revision: L.revision, segments: records.length, indexEntries: entries, indexCells: cells.size, maxBucket, scratchBytes: distances.byteLength + projections.byteLength }) });
}
function getRiverReachMorphology({ plan, geometry } = {}) {
  if (!geometry || geometry.plan !== plan) throw TypeError("River morphology requires matching final geometry");
  let value = cache.get(geometry);
  if (!value) {
    value = createRiverReachMorphology({ plan, geometry });
    cache.set(geometry, value);
  }
  return value;
}

// river-bank-surface.js
var RIVER_BANK_SURFACE = Object.freeze({ range: 22, widthMin: 1.2, widthMax: 9, heightStart: 0.55, heightEnd: 5.4, tileMeters: 2.15, revision: "river-bank-mosaic-v59" });
var clamp2 = (v) => Math.max(0, Math.min(1, v));
var smooth2 = (a, b, v) => {
  const t = clamp2((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
var mix2 = (a, b, t) => a + (b - a) * t;
var morphologyScratch = {};
function lattice(x, z, seed) {
  let h = Math.imul(x, 374761393) ^ Math.imul(z, 668265263) ^ seed;
  h = Math.imul(h ^ h >>> 13, 1274126177);
  return ((h ^ h >>> 16) >>> 0) / 4294967295;
}
function noise(x, z, seed) {
  const ix = Math.floor(x), iz = Math.floor(z), tx = smooth2(0, 1, x - ix), tz = smooth2(0, 1, z - iz);
  return mix2(mix2(lattice(ix, iz, seed), lattice(ix + 1, iz, seed), tx), mix2(lattice(ix, iz + 1, seed), lattice(ix + 1, iz + 1, seed), tx), tz);
}
function riverBankPatchAt(seed, x, z) {
  return noise(x * 0.071 + 71, z * 0.071 - 17, seed >>> 0 ^ 7639725) * 0.7 + noise(x * 0.173 - 12, z * 0.173 + 23, seed >>> 0 ^ 2603665) * 0.3;
}
function riverBankDepositAt(hydrology2, x, z, seed = hydrology2.seed) {
  const patch = riverBankPatchAt(seed, x, z), geometry = hydrology2.geometry;
  if (hydrology2.generationMode !== "water-first" || !geometry?.plan) return patch;
  const m = getRiverReachMorphology({ plan: geometry.plan, geometry }).sample(x, z, morphologyScratch);
  if (!m || m.middle <= 0) return patch;
  return clamp2(patch + m.middle * (m.innerWeight * 0.26 - m.outerWeight * 0.2));
}
function vegetationFromPatch(patch, rise, distance) {
  const colony = 1 - smooth2(0.33, 0.62, patch);
  return colony * smooth2(0.28, 0.95, rise) * (1 - smooth2(3.8, 5.4, rise)) * smooth2(0.6, 2.6, distance) * (1 - smooth2(13, 22, distance));
}
function riverBankVegetationAt(seed, x, y, z, shore, hydrology2 = null) {
  if (shore?.kind !== "stream" || !Number.isFinite(shore.level) || !Number.isFinite(shore.distance)) return 0;
  const rise = y - shore.level;
  if (rise <= 0.28 || rise >= 5.4 || shore.distance >= 22) return 0;
  return vegetationFromPatch(hydrology2 ? riverBankDepositAt(hydrology2, x, z, seed) : riverBankPatchAt(seed, x, z), rise, shore.distance);
}
function riverBankSurfaceAt(hydrology2, x, y, z, shore) {
  if (hydrology2?.generationMode !== "water-first" || shore?.kind !== "stream" || !Number.isFinite(shore.level) || !Number.isFinite(shore.distance)) return 0;
  const rise = y - shore.level;
  if (rise <= -2.5 || rise >= RIVER_BANK_SURFACE.heightEnd || shore.distance >= RIVER_BANK_SURFACE.range) return 0;
  const patch = riverBankDepositAt(hydrology2, x, z), bar = smooth2(0.35, 0.67, patch), width = mix2(RIVER_BANK_SURFACE.widthMin, RIVER_BANK_SURFACE.widthMax, bar);
  const bank = 1 - smooth2(0.1, width, shore.distance), elevation = (1 - smooth2(0.4, 2 + bar * 0.8, rise)) * smooth2(-2.5, -0.35, rise);
  const deposit = bank * elevation * (0.1 + bar * 0.87), vegetation = vegetationFromPatch(patch, rise, shore.distance);
  return clamp2(deposit) - clamp2(vegetation) * 0.9;
}
function replaceOnce(source, needle, replacement, label) {
  if (!source.includes(needle) || source.indexOf(needle) !== source.lastIndexOf(needle)) throw Error("River bank shader seam missing/duplicated: " + label);
  return source.replace(needle, replacement);
}
function patchRiverBankSurfaceShader(shader) {
  shader.vertexShader = "attribute float hydroRiverBank;varying float vRiverBank;\n" + shader.vertexShader;
  shader.vertexShader = replaceOnce(shader.vertexShader, "vHydroWetness=hydroWetness;", "vHydroWetness=hydroWetness;vRiverBank=hydroRiverBank;", "bank attribute");
  let source = "varying float vRiverBank;\n" + shader.fragmentShader;
  source = replaceOnce(source, "   vec3 contextData=texture2D(land_context,contextUV).rgb;", "   vec4 contextData=texture2D(land_context,contextUV);", "actual vegetation context alpha");
  source = replaceOnce(source, "   vec3 landColor=mix(grassSample,soilData.rgb,soilMix);", `
   float riverBankTurf=smoothstep(.03,.70,clamp(-vRiverBank,0.,1.));
   riverBankTurf*=(1.-smoothstep(.08,.22,landSlope))*(1.-landSnow)*(1.-landDesert)*(1.-landPath)*(1.-v28ShoreBand);
   riverBankTurf*=1.-smoothstep(land_contextRange.x,land_contextRange.y,landDistance);
   // Loaded accepted roots drive this close-up material. Unknown/unloaded
   // context and all distant ground retain the previous turf photograph.
   float bankRootValid=smoothstep(.32,128./255.,contextData.a);
   float bankRootCover=smoothstep(.05,.68,clamp((contextData.a-128./255.)/(127./255.),0.,1.));
   float bankRootInfluence=bankRootValid*(1.-smoothstep(24.,54.,landDistance))*smoothstep(8.,24.,min(edge.x,edge.y));
   float bankExposedSoil=riverBankTurf*bankRootInfluence*(1.-bankRootCover)*.88;
   riverBankTurf*=mix(1.,bankRootCover,bankRootInfluence);
   soilMix=max(soilMix,bankExposedSoil);
   float riverBankCoverage=smoothstep(.03,.78,clamp(vRiverBank,0.,1.))*.96;
   riverBankCoverage*=(1.-smoothstep(.18,.38,landSlope))*(1.-landSnow)*(1.-landPath);
   riverBankCoverage*=1.-smoothstep(land_contextRange.x,land_contextRange.y,landDistance);
   // Evaluate UV derivatives outside the masked branch. Two existing-photo
   // reads on bank pixels; zero new samplers or persistent GPU textures.
   mat2 riverBankFrame=mat2(.79863551,.60181502,-.60181502,.79863551);
   vec2 riverBankUV=riverBankFrame*(vLandPosition.xz/2.15)+vec2(4.73,1.91);
   vec2 riverBankDX=dFdx(riverBankUV),riverBankDY=dFdy(riverBankUV);
   vec4 riverBankPhoto=vec4(0.);vec3 riverBankPhotoN=vec3(.5,.5,1.);
   if(riverBankCoverage>.001){
    riverBankPhoto=textureGrad(land_soil,riverBankUV,riverBankDX,riverBankDY);
    riverBankPhotoN=textureGrad(land_soilN,riverBankUV,riverBankDX,riverBankDY).xyz;
   }
   vec3 landColor=mix(grassSample,soilData.rgb,soilMix);`, "bank photograph");
  source = replaceOnce(source, "   landColor=mix(landColor,litterData.rgb,litterMix);", "   landColor=mix(landColor,litterData.rgb,litterMix);\n   if(riverBankCoverage>.001)landColor=mix(landColor,riverBankPhoto.rgb,riverBankCoverage);\n   landColor=mix(landColor,soilData.rgb,bankExposedSoil);\n   landColor=mix(landColor,grassSample*vec3(.88,1.04,.82),riverBankTurf);", "final habitat composition");
  source = replaceOnce(source, "   float landTurfWeight=habitatInfluence*coverMix*(1.-landDesert)*(1.-landPath)*(1.-rockMix*.86)*(1.-cliffMix)*(1.-litterMix);", "   float landTurfWeight=habitatInfluence*coverMix*(1.-landDesert)*(1.-landPath)*(1.-rockMix*.86)*(1.-cliffMix)*(1.-litterMix)*(1.-riverBankCoverage);\n   landTurfWeight*=1.-bankExposedSoil;\n   landTurfWeight=max(landTurfWeight,riverBankTurf);", "turf response excludes new deposit");
  source = replaceOnce(source, "   diffuseColor.rgb=temperateMineralColor(diffuseColor.rgb,temperateVisibleCliff);", `
   diffuseColor.rgb=temperateMineralColor(diffuseColor.rgb,temperateVisibleCliff);
   if(riverBankCoverage>.001){
    float bankLuma=dot(diffuseColor.rgb,vec3(.2126,.7152,.0722));
    vec3 bankTone=vec3(.98,1.,1.03);bankTone/=dot(bankTone,vec3(.2126,.7152,.0722));
    diffuseColor.rgb=mix(diffuseColor.rgb,bankLuma*bankTone,riverBankCoverage*.88);
   }`, "mineral chroma after vertex colour");
  source = replaceOnce(source, "   normal=normalize(mix(normal,normalize(mat3(viewMatrix)*landN),v28ShoreWet*.24));", `
   normal=normalize(mix(normal,normalize(mat3(viewMatrix)*landN),v28ShoreWet*.24));
   if(riverBankCoverage>.001){
    vec2 bankSlope=transpose(riverBankFrame)*mineralPhotoSlope(riverBankPhotoN);
    vec3 bankNormal=mineralSurfaceNormal(landN,vec3(bankSlope.x,0.,bankSlope.y),.82);
    normal=normalize(mix(normal,normalize(mat3(viewMatrix)*bankNormal),riverBankCoverage));
   }
   if(riverBankTurf>.001){
    vec3 bankGrassN=groundGrassPhotoN*2.-1.;bankGrassN.xy*=.82;
    normal=normalize(mix(normal,normalize(mat3(viewMatrix)*normalize(landN+vec3(bankGrassN.x,0.,bankGrassN.y))),riverBankTurf));
   }`, "matching bank normal");
  source = replaceOnce(source, "   roughnessFactor=mix(roughnessFactor,min(roughnessFactor,.58),v28ShoreWet*.78);", `
   roughnessFactor=mix(roughnessFactor,min(roughnessFactor,.58),v28ShoreWet*.78);
   roughnessFactor=mix(roughnessFactor,.94,riverBankTurf);
   if(riverBankCoverage>.001)roughnessFactor=mix(roughnessFactor,clamp(riverBankPhoto.a*mix(1.,.66,localHydroWet),mix(.42,.36,localHydroWet),.98),riverBankCoverage);`, "matching bank roughness");
  shader.fragmentShader = source;
  return shader;
}

// river-bank-placement.js
var DRY_BANK_PLANT_LIMITS = Object.freeze({ radius: 2, shoreRange: 22, shoreMargin: 0.35, minRise: 0.28, maxRise: 5.4, maxGrade: 0.42, maxSupportError: 0.045, minCover: 0.18, nativeStep: 4 / 3, maxGridProbes: 36 });
var filtered = /* @__PURE__ */ new WeakMap();
function dryContext(context, featureId) {
  let ids = filtered.get(context);
  if (!ids) {
    ids = /* @__PURE__ */ new Map();
    filtered.set(context, ids);
  }
  let value = ids.get(featureId);
  if (value) return value;
  const omit = (r) => r.hydrology === true && r.ownerId === featureId && r.shape === "polyline";
  const list = context.layers.groundcover || [];
  if (!list.some(omit)) return null;
  value = { layers: { groundcover: list.filter((r) => !omit(r)) } };
  ids.set(featureId, value);
  return value;
}
function dryRiverBankGrassProof(world, context, x, z, radius, polygon = null) {
  const h = world.hydrology, f2 = world.terrainFunctions, L = DRY_BANK_PLANT_LIMITS;
  if (h?.generationMode !== "water-first" || !h.surfaceAt || !h.nearWater || typeof f2?.height !== "function" || ![x, z, radius].every(Number.isFinite) || radius < 0 || radius > L.radius) return null;
  if (h.surfaceAt(x, z)) return null;
  const shore = h.nearWater(x, z, L.shoreRange);
  if (shore?.kind !== "stream" || !shore.featureId || shore.distance <= radius + L.shoreMargin) return null;
  const next = dryContext(context, shore.featureId);
  if (!next) return null;
  if (polygon ? !reservationAllowsPolygon(next, "groundcover", polygon, 0.035) : !reservationAllows(next, "groundcover", x, z, radius)) return null;
  const y = f2.height(x, z), rise = y - shore.level;
  if (!Number.isFinite(y) || rise < L.minRise || rise > L.maxRise || h.waterAt(x, z, y) || riverBankVegetationAt(h.seed, x, y, z, shore, h) < L.minCover) return null;
  const dx = (f2.height(x + 0.6, z) - f2.height(x - 0.6, z)) / 1.2, dz = (f2.height(x, z + 0.6) - f2.height(x, z - 0.6)) / 1.2;
  if (!Number.isFinite(dx + dz) || Math.hypot(dx, dz) > L.maxGrade) return null;
  const s = L.nativeStep, minX = Math.floor((x - radius) / s), maxX = Math.ceil((x + radius) / s), minZ = Math.floor((z - radius) / s), maxZ = Math.ceil((z + radius) / s);
  if ((maxX - minX + 1) * (maxZ - minZ + 1) > L.maxGridProbes) return null;
  let minError = 0, maxError = 0, probes = 0;
  for (let iz = minZ; iz <= maxZ; iz++) for (let ix = minX; ix <= maxX; ix++) {
    const px = ix * s, pz = iz * s, ground = f2.height(px, pz), error = ground - y - dx * (px - x) - dz * (pz - z);
    probes++;
    if (!Number.isFinite(error) || Math.abs(error) > L.maxSupportError) return null;
    minError = Math.min(minError, error);
    maxError = Math.max(maxError, error);
  }
  return { featureId: shore.featureId, x, z, y, radius, dx, dz, sink: 4e-3 - minError, maxError: maxError - minError, probes };
}

// reservation-footprints.js
var slots = /* @__PURE__ */ new WeakMap();
var boxes = /* @__PURE__ */ new WeakMap();
var bodyBands = /* @__PURE__ */ new WeakMap();
var matrix = new Object3D();
var point = new Vector3();
var inst = new Matrix4();
var bankUp = new Vector3(0, 1, 0);
var bankNormal = new Vector3();
var bankPosition = new Vector3();
var bankRotation = new Quaternion();
var bankAlign = new Quaternion();
var bankScale = new Vector3();
var legacyPlacementSlot = (record, fallback) => slots.get(record) ?? fallback;
function rememberPlacementSlot(record, slot) {
  slots.set(record, slot);
  return record;
}
var treeClimate = {};
function reservationTreeSpecies(world, t) {
  const climate3 = vegetationClimate(world.terrainFunctions, t.x, t.z, t.y, treeClimate);
  return vegetationSpecies(climate3, world.terrainFunctions.hash(t.x, t.z));
}
function installTreeReservationResolver(world, resolver, { expectedGeneratorSha256 } = {}) {
  if (!expectedGeneratorSha256 || resolver.metadata?.generatorSha256 !== expectedGeneratorSha256) throw new Error("Tree footprint table must match the accepted geometry generator SHA");
  const hadBody = Object.prototype.hasOwnProperty.call(world, "worldgenTreeBodyFootprint"), hadFull = Object.prototype.hasOwnProperty.call(world, "worldgenTreeFullFootprint"), previous = world.worldgenTreeBodyFootprint, previousFull = world.worldgenTreeFullFootprint;
  const callback = (t, options) => resolver.resolve(t, reservationTreeSpecies(world, t), options).lowBody.polygon;
  const fullCallback = (t) => {
    const result = resolver.resolve(t, reservationTreeSpecies(world, t), { includeCrown: true }), b = result.bounds, pad = Math.max(result.lowBody.margin || 0, result.crown?.margin || 0) + (result.crown?.windMargin || 0);
    return fullBoundsPolygon(b.min[0], b.min[2], b.max[0], b.max[2], pad);
  };
  world.worldgenTreeBodyFootprint = callback;
  world.worldgenTreeFullFootprint = fullCallback;
  return () => {
    if (world.worldgenTreeBodyFootprint === callback) {
      if (hadBody) world.worldgenTreeBodyFootprint = previous;
      else delete world.worldgenTreeBodyFootprint;
    }
    if (world.worldgenTreeFullFootprint === fullCallback) {
      if (hadFull) world.worldgenTreeFullFootprint = previousFull;
      else delete world.worldgenTreeFullFootprint;
    }
  };
}
function assetBox(asset) {
  if (!boxes.has(asset)) {
    const box = new Box3();
    for (const p of asset.parts) {
      if (!p.geometry.boundingBox) p.geometry.computeBoundingBox();
      box.union(p.geometry.boundingBox);
    }
    boxes.set(asset, box);
  }
  return boxes.get(asset);
}
function boxFootprint(box, transform) {
  const points = [];
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
    point.set(x, y, z).applyMatrix4(transform);
    points.push({ x: point.x, z: point.z });
  }
  return convexFootprint(points);
}
function transformedBox(asset, position, rotation, scale) {
  matrix.position.set(...position);
  matrix.rotation.set(...rotation);
  matrix.scale.set(...scale);
  matrix.updateMatrix();
  return boxFootprint(assetBox(asset), matrix.matrix);
}
function sourceTreeBody(world, t) {
  const species = reservationTreeSpecies(world, t), broad = species === "broadleaf", asset = world.nature?.[species];
  if (!asset) throw new Error("Prepare tree assets before generated reservations");
  const sy = t.h / asset.height, sx = sy * t.width, lean = t.lean * 0.45, burial = broad ? 0.35 : 0.22, box = assetBox(asset), cut = (2.5 + burial + Math.max(Math.abs(box.min.x), Math.abs(box.max.x)) * sx * Math.abs(Math.sin(lean))) / (sy * Math.cos(lean)), band = Math.ceil(cut * 2) / 2;
  let cache2 = bodyBands.get(asset);
  if (!cache2) {
    cache2 = /* @__PURE__ */ new Map();
    bodyBands.set(asset, cache2);
  }
  let points = cache2.get(band);
  if (!points) {
    points = [];
    for (const part of asset.parts) {
      if (part.leaf) continue;
      const p = part.geometry.attributes.position, index2 = part.geometry.index?.array;
      for (let i = 0; i < (index2?.length || p.count); i += 3) {
        const tri = [0, 1, 2].map((j) => {
          const k = index2 ? index2[i + j] : i + j;
          return { x: p.getX(k), y: p.getY(k), z: p.getZ(k) };
        });
        for (let j = 0; j < 3; j++) {
          const a = tri[j], b = tri[(j + 1) % 3];
          if (a.y <= band) points.push(a);
          if (a.y < band !== b.y < band) {
            const u = (band - a.y) / (b.y - a.y);
            points.push({ x: a.x + (b.x - a.x) * u, y: band, z: a.z + (b.z - a.z) * u });
          }
        }
      }
    }
    cache2.set(band, points);
  }
  matrix.position.set(t.x, t.y - burial, t.z);
  matrix.rotation.set(0, t.r * Math.PI * 2, lean);
  matrix.scale.set(sx, sy, sx);
  matrix.updateMatrix();
  return convexFootprint(points.map((p) => {
    point.set(p.x, p.y, p.z).applyMatrix4(matrix.matrix);
    return { x: point.x, z: point.z };
  }));
}
function treeReservationFootprint(world, t) {
  return world.worldgenTreeBodyFootprint?.(t, { worldHeight: 2.5 }) || sourceTreeBody(world, t);
}
function fullBoundsPolygon(minX, minZ, maxX, maxZ, pad = 0) {
  return [{ x: minX - pad, z: minZ - pad }, { x: maxX + pad, z: minZ - pad }, { x: maxX + pad, z: maxZ + pad }, { x: minX - pad, z: maxZ + pad }];
}
function sourceTreeFull(world, t) {
  const species = reservationTreeSpecies(world, t), asset = world.nature?.[species];
  if (!asset) throw new Error("Prepare tree assets before giant crown reservations");
  const sy = t.h / asset.height, sx = sy * t.width, box = assetBox(asset).clone(), lod = world.nature?.[species + "_lod"];
  if (lod) box.union(assetBox(lod));
  matrix.position.set(t.x, t.y - (species === "broadleaf" ? 0.35 : 0.22), t.z);
  matrix.rotation.set(0, t.r * Math.PI * 2, t.lean * 0.45);
  matrix.scale.set(sx, sy, sx);
  matrix.updateMatrix();
  const poly = boxFootprint(box, matrix.matrix), wind = sx * (species === "pine" ? 0.22 : 0.035);
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (const p of poly) {
    minX = Math.min(minX, p.x);
    minZ = Math.min(minZ, p.z);
    maxX = Math.max(maxX, p.x);
    maxZ = Math.max(maxZ, p.z);
  }
  return fullBoundsPolygon(minX, minZ, maxX, maxZ, wind + 1e-3);
}
function treeFullReservationFootprint(world, t) {
  return world.worldgenTreeFullFootprint?.(t) || sourceTreeFull(world, t);
}
function treePlacementAllowed(world, context, t) {
  if (context.layers.trees.length && !reservationAllowsPolygon(context, "trees", treeReservationFootprint(world, t), 0.08)) return false;
  return !context.layers.treeCrowns?.length || reservationAllowsPolygon(context, "treeCrowns", treeFullReservationFootprint(world, t), 0.08);
}
function rockReservationFootprint(world, r, slot, cx, cz) {
  const generated = world.proceduralRockEnvelope?.(r);
  if (generated) return generated.polygon;
  const asset = world.nature?.[["rock-1", "rock-3", "rock-4"][slot % 3]];
  if (!asset) throw new Error("Prepare rock assets before generated reservations");
  const rng2 = (i, n) => world.terrainFunctions.hash(cx * 229 + cz * 733 + i * 13, n), scale = r.r * 0.92;
  return transformedBox(asset, [r.x, r.y, r.z], [(rng2(slot, 12) - 0.5) * 0.25, rng2(slot, 13) * Math.PI * 2, 0], [scale, scale, scale]);
}
function rockPlacementAllowed(world, context, r, slot, cx, cz) {
  const target = underwaterResourceRockContext(context, r);
  return !target.layers.rocks.length || reservationAllowsPolygon(target, "rocks", rockReservationFootprint(world, r, slot, cx, cz), 0.06);
}
function logPlacementAllowed(world, context, o, slot, cx, cz) {
  if (!context.layers.decor.length) return true;
  const asset = world.nature?.fallen_log;
  if (!asset) throw new Error("Prepare deadwood assets before generated reservations");
  const rng2 = (i, n) => world.terrainFunctions.hash(cx * 229 + cz * 733 + i * 13, n), scale = 0.8 + rng2(slot, 510) * 0.6;
  return reservationAllowsPolygon(context, "decor", transformedBox(asset, [o.x, o.y - 0.04, o.z], [0, rng2(slot, 511) * 6.28, 0], [scale, scale, scale]), 0.06);
}
function contactPatchAllowed(context, x, z, rx, rz) {
  if (!context.layers.groundcover.length) return true;
  const grid = 4 / 3, r = Math.max(rx, rz), x0 = Math.floor((x - r) / grid) * grid, z0 = Math.floor((z - r) / grid) * grid, x1 = Math.ceil((x + r) / grid) * grid, z1 = Math.ceil((z + r) / grid) * grid;
  return reservationAllowsPolygon(context, "groundcover", [{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }]);
}
var flatBounds = /* @__PURE__ */ new WeakMap();
function layerBounds(list) {
  let b = flatBounds.get(list);
  if (!b) {
    b = new Float64Array(list.length * 4);
    list.forEach((r, i) => {
      b[i * 4] = r.bounds.minX;
      b[i * 4 + 1] = r.bounds.maxX;
      b[i * 4 + 2] = r.bounds.minZ;
      b[i * 4 + 3] = r.bounds.maxZ;
    });
    flatBounds.set(list, b);
  }
  return b;
}
function boundsReach(b, x, z, rx, rz, pad) {
  for (let k = 0; k < b.length; k += 4) if (x - rx <= b[k + 1] + pad && x + rx >= b[k] - pad && z - rz <= b[k + 3] + pad && z + rz >= b[k + 2] - pad) return true;
  return false;
}
function* pruneReservedDecorSteps(world, c2) {
  const base = reservationContext(world, c2), context = world.hydrologyGeology?.context(base, c2.cx, c2.cz) || base;
  if (!context.all.length) return 0;
  let removed = 0;
  for (const mesh of c2.group.children) {
    const type = mesh.userData.natureType;
    if (!mesh.isInstancedMesh || mesh.userData.fernFarOf || !(["grass", "grass_tall", "shrub", "meadow", "fern", "ecology-gravel"].includes(type) || ["forest-fern", "local-pebbles"].includes(mesh.name) || mesh.name.startsWith("ecology-fern-"))) continue;
    const layer = type === "shrub" ? "decor" : "groundcover";
    if (!context.layers[layer].length) continue;
    const source = mesh.userData.originalMatrices || mesh.instanceMatrix.array, count = mesh.userData.natureCount ?? mesh.count, colors = mesh.userData.originalColors || mesh.instanceColor?.array, entries = mesh.userData.entries, lod = mesh.userData.courtLodIndices;
    c2.reservePreparationBytes?.(count * 8);
    const keep = [], bankMatrices = /* @__PURE__ */ new Map(), bankGrass = ["grass", "grass_tall", "meadow"].includes(type), hasBankCohort = Number.isInteger(mesh.userData.riverBankPrimaryCount), primaryCount = mesh.userData.riverBankPrimaryCount ?? count, finalBudget = mesh.userData.riverBankFinalBudget ?? count, seatedIds = new Set(mesh.userData.riverBankSeatedIds || []);
    const hasPending = hasBankCohort && (lod?.[count - 1] ?? count - 1) >= primaryCount;
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    const template2 = mesh.userData.meadowLayered ? new Box3(new Vector3(-0.55, -0.0233, -0.47), new Vector3(0.55, 1, 0.47)) : mesh.geometry.boundingBox;
    const near = layerBounds(context.layers[layer]), ax = Math.max(Math.abs(template2.min.x), Math.abs(template2.max.x)), ay = Math.max(Math.abs(template2.min.y), Math.abs(template2.max.y)), az = Math.max(Math.abs(template2.min.z), Math.abs(template2.max.z));
    for (let i = 0; i < count; i++) {
      if (i && (i & 127) === 0) yield "decor:prune";
      const identity = lod?.[i] ?? i, pending = hasBankCohort && identity >= primaryCount;
      if (pending && keep.length >= finalBudget) continue;
      if (!pending) {
        const o = i * 16, rx = Math.abs(source[o]) * ax + Math.abs(source[o + 4]) * ay + Math.abs(source[o + 8]) * az + 1e-4, rz = Math.abs(source[o + 2]) * ax + Math.abs(source[o + 6]) * ay + Math.abs(source[o + 10]) * az + 1e-4;
        if (!boundsReach(near, source[o + 12], source[o + 14], rx, rz, 0.035)) {
          keep.push(i);
          continue;
        }
      }
      inst.fromArray(source, i * 16);
      let poly = boxFootprint(template2, inst);
      if (!pending && reservationAllowsPolygon(context, layer, poly, 0.035)) {
        keep.push(i);
        continue;
      }
      const x = source[i * 16 + 12], z = source[i * 16 + 14], radius = Math.max(...poly.map((p) => Math.hypot(p.x - x, p.z - z))) + 0.035;
      const explicitBankLimit = mesh.userData.riverBankAdmissionLimit;
      const bankCap = Number.isInteger(explicitBankLimit) ? Math.max(0, Math.min(1024, explicitBankLimit)) : !pending && hasPending ? 64 : 192;
      let proof = bankGrass && bankMatrices.size < bankCap ? dryRiverBankGrassProof(world, context, x, z, radius, poly) : null;
      if (proof) {
        if (seatedIds.has(identity)) {
          bankMatrices.set(i, new Float32Array(inst.elements));
          keep.push(i);
          continue;
        }
        inst.decompose(bankPosition, bankRotation, bankScale);
        bankNormal.set(-proof.dx, 1, -proof.dz).normalize();
        bankAlign.setFromUnitVectors(bankUp, bankNormal);
        bankRotation.premultiply(bankAlign);
        bankPosition.y = proof.y - Math.max(proof.sink, proof.y - bankPosition.y);
        inst.compose(bankPosition, bankRotation, bankScale);
        poly = boxFootprint(template2, inst);
        proof = dryRiverBankGrassProof(world, context, x, z, Math.max(...poly.map((p) => Math.hypot(p.x - x, p.z - z))) + 0.035, poly);
        if (proof) {
          bankPosition.y = Math.min(bankPosition.y, proof.y - proof.sink);
          inst.compose(bankPosition, bankRotation, bankScale);
          c2.reservePreparationBytes?.(64);
          bankMatrices.set(i, new Float32Array(inst.elements));
          keep.push(i);
          continue;
        }
      }
      if (entries?.[i]?.ref) entries[i].ref.index = -1;
    }
    if (keep.length === count && !bankMatrices.size) continue;
    removed += count - keep.length;
    c2.reservePreparationBytes?.(keep.length * 96);
    const matrices = new Float32Array(keep.length * 16), nextColors = colors ? new Float32Array(keep.length * 3) : null, nextLod = new Uint32Array(keep.length), nextEntries = [];
    const restored = [];
    for (let j = 0; j < keep.length; j++) {
      if (j && (j & 127) === 0) yield "decor:compact";
      const i = keep[j], bank = bankMatrices.get(i);
      matrices.set(bank || source.subarray(i * 16, i * 16 + 16), j * 16);
      if (bank) restored.push(j);
      if (colors) nextColors.set(colors.subarray(i * 3, i * 3 + 3), j * 3);
      nextLod[j] = lod?.[i] ?? i;
      if (entries) {
        const e = entries[i];
        e.ref.index = j;
        nextEntries.push(e);
      }
    }
    mesh.instanceMatrix.array.set(matrices);
    mesh.instanceMatrix.needsUpdate = true;
    mesh.userData.originalMatrices = matrices;
    mesh.count = mesh.userData.natureCount = keep.length;
    mesh.visible = keep.length > 0;
    if (colors) {
      mesh.instanceColor.array.set(nextColors);
      mesh.instanceColor.needsUpdate = true;
      mesh.userData.originalColors = nextColors;
    }
    if (entries) mesh.userData.entries = nextEntries;
    mesh.userData.courtLodIndices = nextLod;
    mesh.userData.riverBankRestoredIndices = new Uint32Array(restored);
    mesh.userData.riverBankSeatedIds = Uint32Array.from(restored, (j) => nextLod[j]);
    mesh.computeBoundingSphere();
  }
  return removed;
}

// mineral-surface-gradient.js
var MINERAL_SURFACE_GRADIENT_GLSL = `
 vec2 mineralPhotoSlope(vec3 encoded){
  vec3 photoN=encoded*2.-1.;return photoN.xy/max(photoN.z,.35);
 }
 vec3 mineralSurfaceNormal(vec3 n,vec3 slope,float strength){
  vec3 tangentSlope=slope-n*dot(n,slope);
  return normalize(n+tangentSlope*strength);
 }
 vec3 mineralTriNormal(sampler2D photo,vec3 p,vec3 n,vec3 weights,float strength){
  vec2 x=mineralPhotoSlope(texture2D(photo,p.zy).xyz);
  vec2 y=mineralPhotoSlope(texture2D(photo,p.xz).xyz);
  vec2 z=mineralPhotoSlope(texture2D(photo,p.xy).xyz);
  vec3 slope=vec3(0.,x.y,x.x)*weights.x+vec3(y.x,0.,y.y)*weights.y+vec3(z.x,z.y,0.)*weights.z;
  return mineralSurfaceNormal(n,slope,strength);
 }
`;

// temperate-mineral.js
var TEMPERATE_MINERAL = Object.freeze({
  coastStart: 40,
  coastEnd: 120,
  climateEnd: 0.08,
  slopeStart: 0.12,
  slopeEnd: 0.3,
  cliffMinimum: 0.94,
  chromaStrength: 0.88
});
var f = (value) => Number(value).toFixed(8);
var c = TEMPERATE_MINERAL;
var TEMPERATE_MINERAL_GLSL = `
 float temperateMineralDomain(vec3 position,IslandClimate climate){
  return 1.-smoothstep(0.,${f(c.climateEnd)},max(climate.ash,climate.snow));
 }
 float temperateInland(float shoreDistance){return smoothstep(${f(c.coastStart)},${f(c.coastEnd)},shoreDistance);}
 float temperateFaceExposure(float normalY){
  return smoothstep(${f(c.slopeStart)},${f(c.slopeEnd)},1.-abs(normalY));
 }
 float temperateCliffCoverage(float previous,float exposure){
  if(exposure<=0.)return previous;
  return mix(previous,max(previous,${f(c.cliffMinimum)}),exposure);
 }
 vec3 temperateMineralColor(vec3 color,float weight){
  if(weight<=0.)return color;
  float luminance=dot(color,vec3(.2126,.7152,.0722));
  return mix(color,vec3(luminance),clamp(weight,0.,1.)*${f(c.chromaStrength)});
 }
`;

// material-albedo.js
var MATERIAL_ALBEDO = Object.freeze({
  // Procedural rocks (the cliff photo, greyed): .14-.16 -> about .22.
  rock: 1.45,
  // The ground's cliff photo (.16 near, .134 far) and rock photo (.097).
  cliff: 1.4,
  groundRock: 1.3,
  // Snow on the ground and on rocks (photo .379 x .96): -> about .65.
  snow: 1.8,
  // The world's mossy stone (moss-rock photo .056 x .77: .044, black): the
  // ground's pebbles, camp and fire stones, the ruins' platforms -> about .13.
  stone: 3,
  // Wet ground keeps about half its dry albedo (dry^exponent x scale: soil
  // .12 -> 48%, sand .33 -> 57%; it was .72 dry^.6, a fifth to a third).
  wetExponent: 0.18,
  wetScale: 0.7,
  // The sky light's bounce from the ground below the horizon (DynamicSky's
  // groundAlbedo, times its ground colour of luminance .23): .058 -> .15,
  // the island's grass, soil and sand rather than near-black.
  groundBounce: 0.65
});

// task-yield.js
var channel = null;
var nextId = 1;
var queued = /* @__PURE__ */ new Map();
function messagePort() {
  if (channel || typeof MessageChannel !== "function") return channel;
  channel = new MessageChannel();
  channel.port1.onmessage = (event) => {
    const run = queued.get(event.data);
    if (!run) return;
    queued.delete(event.data);
    run();
  };
  return channel;
}
var hidden = () => !!globalThis.document?.hidden;
function scheduleTask(run) {
  if (hidden() && messagePort()) {
    const id = nextId++;
    queued.set(id, run);
    channel.port2.postMessage(id);
    return { id };
  }
  return { timer: setTimeout(run, 0) };
}
function scheduleTaskNow(run) {
  if (messagePort()) {
    const id = nextId++;
    queued.set(id, run);
    channel.port2.postMessage(id);
    return { id };
  }
  return { timer: setTimeout(run, 0) };
}
var FRAME_IDLE = Object.freeze({ margin: 0.5, window: 90, minInterval: 1e3 / 500, maxGap: 1e3, again: 1 });
var frameIdle = { queue: [], requested: false, at: NaN, last: NaN, gaps: [], port: null, windowFor: NaN, windowEnd: 0 };
function frameInterval() {
  let least = Infinity;
  for (const g of frameIdle.gaps) if (g < least) least = g;
  return Number.isFinite(least) ? Math.max(FRAME_IDLE.minInterval, least) : 1e3 / 60;
}
function frameDrawn(event) {
  if (event?.data !== 1 || frameIdle.windowFor !== frameIdle.at) {
    const now = performance.now(), at = frameIdle.at, v = frameInterval();
    frameIdle.windowEnd = at + Math.max(1, Math.ceil((now - at + FRAME_IDLE.margin) / v)) * v - FRAME_IDLE.margin;
    frameIdle.windowFor = at;
  }
  const end = frameIdle.windowEnd, deadline = { didTimeout: false, timeRemaining: () => Math.max(0, end - performance.now()) };
  const entries = frameIdle.queue;
  frameIdle.queue = [];
  for (const e of entries) {
    if (e.done) continue;
    e.done = true;
    clearTimeout(e.timer);
    e.run(deadline);
  }
  if (frameIdle.queue.length) {
    if (end - performance.now() > FRAME_IDLE.again) frameIdle.port.postMessage(1);
    else requestFrame();
  }
}
function onFrame(t) {
  frameIdle.requested = false;
  const gap = t - frameIdle.last;
  frameIdle.last = t;
  frameIdle.at = t;
  if (gap > 0 && gap < FRAME_IDLE.maxGap) {
    frameIdle.gaps.push(gap);
    if (frameIdle.gaps.length > FRAME_IDLE.window) frameIdle.gaps.shift();
  }
  frameIdle.port.postMessage(0);
}
function requestFrame() {
  if (frameIdle.requested) return;
  frameIdle.requested = true;
  requestAnimationFrame(onFrame);
}
function scheduleIdleTask(run, timeout = 100) {
  if (hidden() || typeof globalThis.requestAnimationFrame !== "function" || typeof MessageChannel !== "function") return null;
  if (!frameIdle.port) {
    const c2 = new MessageChannel();
    c2.port1.onmessage = frameDrawn;
    c2.port1.unref?.();
    frameIdle.port = c2.port2;
  }
  const entry = { run, done: false, timer: null };
  entry.timer = setTimeout(() => {
    if (entry.done) return;
    entry.done = true;
    run({ didTimeout: true, timeRemaining: () => 0 });
  }, timeout);
  frameIdle.queue.push(entry);
  requestFrame();
  return { idle: entry };
}
function cancelTask(handle) {
  if (!handle) return;
  if (handle.idle !== void 0) {
    handle.idle.done = true;
    clearTimeout(handle.idle.timer);
  } else if (handle.timer !== void 0) clearTimeout(handle.timer);
  else queued.delete(handle.id);
}
function yieldTask() {
  return new Promise((resolve) => scheduleTask(resolve));
}

// rock-cache.js
var DB_NAME = "kumarim-rocks";
var STORE = "families";
var KEEP = 4;
function openDatabase() {
  return new Promise((resolve, reject) => {
    const idb = globalThis.indexedDB;
    if (!idb) {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const request = idb.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB open failed"));
    request.onblocked = () => reject(new Error("IndexedDB blocked"));
  });
}
var done = (tx) => new Promise((resolve, reject) => {
  tx.oncomplete = () => resolve();
  tx.onerror = tx.onabort = () => reject(tx.error || new Error("IndexedDB transaction failed"));
});
async function readRockFamilies(key) {
  let db;
  try {
    db = await openDatabase();
    const request = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
    const value = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return value?.key === key && value.families && typeof value.families === "object" ? value.families : null;
  } catch {
    return null;
  } finally {
    db?.close();
  }
}
async function writeRockFamilies(key, families, prefix) {
  let db;
  try {
    db = await openDatabase();
    const tx = db.transaction(STORE, "readwrite"), store = tx.objectStore(STORE);
    store.put({ key, savedAt: Date.now(), families }, key);
    const keys = await new Promise((resolve, reject) => {
      const r = store.getAllKeys();
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    const current = keys.filter((k) => String(k).startsWith(prefix));
    for (const k of keys) if (!String(k).startsWith(prefix)) store.delete(k);
    if (current.length > KEEP) for (const k of current.filter((k2) => k2 !== key).slice(0, current.length - KEEP)) store.delete(k);
    await done(tx);
    return true;
  } catch {
    return false;
  } finally {
    db?.close();
  }
}

// procedural-rocks.js
var TYPES = ["weathered", "jointed", "bedded", "waterworn"];
var TAU = Math.PI * 2;
var V = Vector3;
var clamp3 = MathUtils.clamp;
var PROCEDURAL_ROCK_VERSION = "v99.3-natural-r1";
function hash32(text) {
  let n = 2166136261;
  for (const c2 of String(text)) {
    n ^= c2.charCodeAt(0);
    n = Math.imul(n, 16777619);
  }
  return n >>> 0;
}
function rng(seed) {
  let n = seed >>> 0;
  return () => {
    n += 1831565813;
    let t = n;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function hashCorner(a, b, c2, seed) {
  let n = Math.imul(a, 374761393) ^ Math.imul(b, 668265263) ^ Math.imul(c2, 2147483647) ^ seed;
  n = Math.imul(n ^ n >>> 13, 1274126177);
  return ((n ^ n >>> 16) >>> 0) / 4294967295;
}
function noise2(x, y, z, seed) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  let u = x - ix, v = y - iy, w = z - iz;
  u = u * u * (3 - 2 * u);
  v = v * v * (3 - 2 * v);
  w = w * w * (3 - 2 * w);
  const a = hashCorner(ix, iy, iz, seed), b = hashCorner(ix + 1, iy, iz, seed), c2 = hashCorner(ix, iy + 1, iz, seed), d = hashCorner(ix + 1, iy + 1, iz, seed), e = hashCorner(ix, iy, iz + 1, seed), f2 = hashCorner(ix + 1, iy, iz + 1, seed), g = hashCorner(ix, iy + 1, iz + 1, seed), h = hashCorner(ix + 1, iy + 1, iz + 1, seed);
  const ab = a + (b - a) * u, cd = c2 + (d - c2) * u, ef = e + (f2 - e) * u, gh = g + (h - g) * u, lo = ab + (cd - ab) * v, hi = ef + (gh - ef) * v;
  return lo + (hi - lo) * w;
}
var smootherMax = (a, b, k) => {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.max(a, b) + h * h * k * 0.25;
};
var normalize = (a) => {
  const d = Math.hypot(...a);
  return a.map((v) => v / d);
};
var dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
var cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
function polytopeBounds(planes, margin = 0) {
  const vertices = [];
  for (let i = 0; i < planes.length; i++) for (let j = i + 1; j < planes.length; j++) for (let k = j + 1; k < planes.length; k++) {
    const a = planes[i], b = planes[j], c2 = planes[k], bc = cross(b.n, c2.n), ca = cross(c2.n, a.n), ab = cross(a.n, b.n), det = dot(a.n, bc);
    if (Math.abs(det) < 1e-7) continue;
    const v = [0, 1, 2].map((q) => ((a.d + margin) * bc[q] + (b.d + margin) * ca[q] + (c2.d + margin) * ab[q]) / det);
    if (planes.every((p) => dot(p.n, v) <= p.d + margin + 1e-7)) vertices.push(v);
  }
  if (!vertices.length) throw new Error("Unbounded or empty rock fracture field");
  return { min: [0, 1, 2].map((i) => Math.min(...vertices.map((v) => v[i]))), max: [0, 1, 2].map((i) => Math.max(...vertices.map((v) => v[i]))), vertices };
}
function createRockPlan(familyId, worldSeed = 728194) {
  const match = /^(weathered|jointed|bedded|waterworn)-(\d)$/.exec(familyId);
  if (!match || Number(match[2]) > 3) throw new Error("Unknown procedural rock family " + familyId);
  const type = match[1], variant = Number(match[2]), seed = hash32(worldSeed + ":rock:" + familyId), random = rng(seed), planes = [];
  const ratios = { weathered: [[1.12, 0.65, 0.81], [0.83, 0.91, 0.69], [1.04, 0.59, 0.93], [1.18, 0.78, 0.73]], jointed: [[0.8, 1.1, 0.69], [1.13, 0.72, 0.6], [0.86, 0.93, 0.96], [1.04, 0.87, 0.64]], bedded: [[1.31, 0.37, 0.8], [1.1, 0.49, 0.94], [1.34, 0.52, 0.62], [1.02, 0.43, 0.85]], waterworn: [[1.12, 0.43, 0.79], [0.86, 0.55, 1.02], [1.25, 0.38, 0.7], [0.93, 0.61, 0.81]] }[type][variant];
  const [width, height2, depth] = ratios.map((v) => v * (0.91 + random() * 0.17)), phase = random() * TAU;
  const dip = (random() - 0.5) * (type === "bedded" ? 0.75 : 0.95), bedding = normalize([Math.sin(dip), 1, (random() - 0.5) * 0.42]);
  const extent = (n) => Math.hypot(n[0] * width, n[1] * height2, n[2] * depth);
  const joints = 5 + (type === "jointed" ? 1 : 0) + (random() < 0.5 ? 1 : 0), leanRange = { weathered: [0.04, 0.3], jointed: [-0.06, 0.24], bedded: [0.08, 0.3], waterworn: [0.12, 0.43] }[type];
  for (let i = 0; i < joints; i++) {
    const a = phase + i * TAU / joints + (random() - 0.5) * 0.34;
    const lean = (leanRange[0] + random() * (leanRange[1] - leanRange[0])) * (type === "jointed" && i === 2 ? -0.6 : 1), n = normalize([Math.cos(a) / width, lean / height2, Math.sin(a) / depth]);
    planes.push({ n, d: extent(n) * (0.81 + random() * 0.3), kind: "major-joint" });
  }
  const top = normalize([bedding[0] + (random() - 0.5) * 0.7, 1, bedding[2] + (random() - 0.5) * 0.58]), bottom = normalize([(random() - 0.5) * 0.3, -1, (random() - 0.5) * 0.34]);
  planes.push({ n: top, d: extent(top) * (0.62 + random() * 0.22), kind: "sloping-bedding" });
  planes.push({ n: bottom, d: extent(bottom) * (0.91 + random() * 0.13), kind: "buried-base" });
  for (let i = 0; i < 3; i++) {
    const a = phase + (i * 0.73 + 0.14) * TAU + (random() - 0.5) * 0.55, n = normalize([Math.cos(a) / width, (0.6 + random() * 0.65) / height2, Math.sin(a) / depth]);
    planes.push({ n, d: extent(n) * (0.56 + random() * 0.2), kind: "shoulder-spall" });
  }
  const round = type === "waterworn" ? [0.19, 0.16, 0.22, 0.18][variant] : type === "weathered" ? 0.095 : type === "bedded" ? 0.04 : 0.035, erosion = type === "waterworn" ? 0.014 : type === "weathered" ? 0.029 : 0.02;
  const relief = type === "waterworn" ? 0.032 : type === "weathered" ? 0.135 : type === "bedded" ? 0.08 : 0.095;
  const seams = [];
  for (let i = 0; i < (type === "bedded" ? 2 : type === "jointed" ? 1 : type === "weathered" && random() < 0.5 ? 1 : 0); i++) {
    const n = type === "bedded" ? bedding : normalize([random() - 0.5, 0.25 + random() * 0.5, random() - 0.5]);
    seams.push({ n, offset: (random() - 0.5) * height2 * 0.85, width: type === "bedded" ? 0.13 : 0.1, depth: type === "bedded" ? 0.065 : 0.038, phase: random() * TAU });
  }
  const recessCount = type === "waterworn" ? 0 : type === "weathered" ? variant === 2 ? 0 : 1 : variant % 2 === 0 ? 1 : 0, recesses = [];
  for (let i = 0; i < recessCount; i++) {
    const a = phase + (i * 0.43 + 0.13) * TAU + (random() - 0.5) * 0.3, ny = 0.1 + random() * 0.42;
    void { center: [Math.cos(a) * width * (0.77 + random() * 0.08), ny * height2, Math.sin(a) * depth * (0.77 + random() * 0.1)], axes: [width * (0.36 + random() * 0.13), height2 * (0.28 + random() * 0.15), depth * (0.29 + random() * 0.11)], radial: [Math.cos(a), 0, Math.sin(a)], tangent: [-Math.sin(a), 0, Math.cos(a)], shear: (random() - 0.5) * 0.7, power: type === "weathered" ? 1.42 : 1.16, softness: type === "weathered" ? 0.04 : 0.024 };
  }
  const abrasion = type === "waterworn" ? { center: [width * (random() - 0.5) * 0.2, -height2 * 0.11, depth * (random() - 0.5) * 0.17], axes: [width * 0.99, height2 * 1.13, depth * 0.99], skew: (random() - 0.5) * 0.32 } : null;
  const rawBounds = polytopeBounds(planes, relief * 0.56 + erosion * 0.7 + 7e-3), originY = rawBounds.min[1], bounds2 = { min: [rawBounds.min[0], 0, rawBounds.min[2]], max: [rawBounds.max[0], rawBounds.max[1] - originY, rawBounds.max[2]] };
  const solid = polytopeBounds(planes, 0).vertices, meanRadius = (width + height2 + depth) / 3, chips = [];
  const chipCount = type === "waterworn" ? 0 : { weathered: 6, jointed: 8, bedded: 6 }[type] + Math.floor(random() * 4);
  for (let i = 0; i < chipCount; i++) {
    const a = random() * TAU, n = normalize([Math.cos(a) / width, (random() * 1.35 - 0.3) / height2, Math.sin(a) / depth]);
    let support = -Infinity;
    for (const v of solid) support = Math.max(support, dot(n, v));
    chips.push({ n, d: support - meanRadius * (0.05 + random() * 0.12) });
  }
  const roundBias = { weathered: [0.6, 1.5], jointed: [0.8, 1.25], bedded: [0.8, 1.3], waterworn: [1, 1] }[type], chipRound = { weathered: 0.7, jointed: 0.6, bedded: 0.65, waterworn: 1 }[type];
  const envelopeVertices = rawBounds.vertices.map((v) => [v[0], v[1] - originY, v[2]]);
  if (abrasion) {
    const patterns = [
      [[-0.22, -0.1, -0.1, 0.78, 1.5, 0.93], [0.36, -0.18, 0.15, 0.67, 1.15, 0.68]],
      [[-0.12, 0.04, 0.14, 0.82, 1.6, 0.82], [0.34, -0.15, -0.18, 0.62, 0.9, 0.66]],
      [[-0.15, -0.18, -0.14, 0.98, 1.08, 0.87], [0.45, -0.2, 0.23, 0.55, 0.96, 0.62]],
      [[0.06, 0.04, -0.05, 0.81, 1.56, 0.96], [-0.29, -0.15, 0.3, 0.6, 1.05, 0.69]]
    ][variant];
    abrasion.lobes = patterns.map(([x, y, z, sx, sy, sz]) => ({ center: [x * width, y * height2, z * depth], axes: [sx * width, sy * height2, sz * depth] }));
  }
  let bulk = null;
  if (false) {
    const center = rawBounds.min.map((v, i) => (v + rawBounds.max[i]) * 0.5), half = rawBounds.min.map((v, i) => (rawBounds.max[i] - v) * 0.5), long = half[0] >= half[2] ? 0 : 2, short = long === 0 ? 2 : 0;
    const mass = (along, vertical, across, proportions, turn) => {
      const origin = center.slice();
      origin[long] += along * half[long];
      origin[1] += vertical * half[1];
      origin[short] += across * half[short];
      const axes = half.map((v, i) => v * proportions[i]), facets = [];
      const add = (normal, offset) => {
        const metric = normal.map((v, i) => v / axes[i]), length = Math.hypot(...metric);
        facets.push({ n: metric.map((v) => v / length), d: offset / length });
      };
      for (let i = 0; i < 5; i++) {
        const a = phase + turn + i * TAU / 5 + [0.05, -0.11, 0.08, -0.04, 0.1][i];
        add([Math.cos(a), [-0.24, 0.34, 0.28, -0.3, 0.38][i], Math.sin(a)], [0.95, 0.88, 1.02, 0.92, 0.98][i]);
      }
      add([0.65, 0.65, -0.38], 0.74);
      add([-0.48, 0.75, 0.5], 0.82);
      add([0.16, -1, -0.19], 1.04);
      return { center: origin, planes: facets };
    };
    bulk = { masses: [mass(0.21, 0.07, 0.02, [0.6, 0.95, 0.78], 0), mass(-0.44, -0.3, -0.1, [0.5, 0.56, 0.68], 0.43)], round: 0.07, join: 0.105 };
  }
  let shoulderBreak = null;
  if (false) {
    const center = rawBounds.min.map((v, i) => (v + rawBounds.max[i]) * 0.5), half = rawBounds.min.map((v, i) => (rawBounds.max[i] - v) * 0.5), az = phase + 0.37;
    const metric = [Math.cos(az) / half[0], 0.47 / half[1], Math.sin(az) / half[2]], length = Math.hypot(...metric);
    shoulderBreak = { center, n: metric.map((v) => v / length), d: 0.48 / length, round: 0.025 };
  }
  const weatheredStructure = null;
  return Object.freeze({ ...weatheredStructure ? { weatheredStructure } : {}, id: familyId, type, variant, seed, planes, chips, roundBias, chipRound, seams, recesses, abrasion, bulk, shoulderBreak, relief, proportions: [width, height2, depth], round, erosion, bedding, rawBounds, bounds: bounds2, envelopeVertices, originY, metricTextureTile: 2.2, fieldVersion: PROCEDURAL_ROCK_VERSION + (weatheredStructure ? "-shoulder-v63-r1" : "") });
}
var compiledPlans = /* @__PURE__ */ new WeakMap();
function compilePlan(plan) {
  let c2 = compiledPlans.get(plan);
  if (c2) return c2;
  const flat = (list) => {
    const a = new Float64Array(list.length * 4);
    list.forEach((p, i) => {
      a.set(p.n, i * 4);
      a[i * 4 + 3] = p.d;
    });
    return a;
  };
  c2 = {
    planes: flat(plan.planes),
    chips: flat(plan.chips || []),
    yLow: plan.rawBounds.min[1],
    ySpan: plan.rawBounds.max[1] - plan.rawBounds.min[1],
    roundLow: plan.roundBias ? plan.roundBias[0] : 1,
    roundHigh: plan.roundBias ? plan.roundBias[1] : 1,
    lobes: plan.abrasion ? plan.abrasion.lobes.map((l) => ({ c: l.center, a: l.axes, min: Math.min(...l.axes) })) : null,
    recesses: plan.recesses.map((r) => ({ ...r, min: Math.min(...r.axes) })),
    masses: plan.bulk ? plan.bulk.masses.map((m) => ({ c: m.center, planes: flat(m.planes) })) : null
  };
  compiledPlans.set(plan, c2);
  return c2;
}
function rockField(plan, x, y, z) {
  const c2 = compilePlan(plan), P = c2.planes, t = clamp3((y - c2.yLow) / c2.ySpan, 0, 1), k = plan.round * (c2.roundLow + (c2.roundHigh - c2.roundLow) * t);
  let d = P[0] * x + P[1] * y + P[2] * z - P[3];
  for (let i = 4; i < P.length; i += 4) d = smootherMax(d, P[i] * x + P[i + 1] * y + P[i + 2] * z - P[i + 3], k);
  const C = c2.chips, kc = k * plan.chipRound;
  for (let i = 0; i < C.length; i += 4) d = smootherMax(d, C[i] * x + C[i + 1] * y + C[i + 2] * z - C[i + 3], kc);
  if (c2.lobes) {
    const skew = plan.abrasion.skew;
    let worn = Infinity;
    for (const lobe of c2.lobes) {
      const q0 = (x - lobe.c[0]) / lobe.a[0], taper = 1 + skew * q0, q1 = (y - lobe.c[1]) / lobe.a[1] / taper, q2 = (z - lobe.c[2]) / lobe.a[2] / taper, oval = (Math.sqrt(q0 * q0 + q1 * q1 + q2 * q2) - 1) * lobe.min;
      worn = worn === Infinity ? oval : -smootherMax(-worn, -oval, 0.075);
    }
    d = smootherMax(d, worn, 0.065);
  }
  const macro = noise2(x * 1.25 + 11, y * 1.05 - 9, z * 1.31 + 3, plan.seed ^ 424658) - 0.5;
  const broad = noise2(x * 3.2 + 7, y * 3.2 - 2, z * 3.2 + 5, plan.seed) - 0.5;
  d += macro * plan.relief + broad * 0.78 * plan.erosion;
  for (const seam of plan.seams) {
    const seamWarp = (noise2(x * 1.4 + 13, y * 1.4, z * 1.4 - 7, plan.seed ^ 93) - 0.5) * 0.08, q = Math.abs(seam.n[0] * x + seam.n[1] * y + seam.n[2] * z - seam.offset + seamWarp), t2 = clamp3(1 - q / seam.width, 0, 1), presence = 0.3 + 0.7 * clamp3(0.5 + 0.7 * Math.sin(x * 1.6 + z * 1.3 + seam.phase), 0, 1);
    d += t2 * t2 * (3 - 2 * t2) * seam.depth * presence;
  }
  for (const r of c2.recesses) {
    const ox = x - r.center[0], oy = y - r.center[1], oz = z - r.center[2], radial = ox * r.radial[0] + oy * r.radial[1] + oz * r.radial[2], q0 = (ox * r.tangent[0] + oy * r.tangent[1] + oz * r.tangent[2]) / r.axes[0], q1 = (oy + radial * r.shear) / r.axes[1], q2 = radial / r.axes[2], fragment = Math.pow(Math.pow(Math.abs(q0), r.power) + Math.pow(Math.abs(q1), r.power) + Math.pow(Math.abs(q2), r.power), 1 / r.power), missing = (1 - fragment) * r.min;
    d = smootherMax(d, missing, r.softness);
  }
  if (c2.masses) {
    let merged = Infinity;
    for (const mass of c2.masses) {
      const lx = x - mass.c[0], ly = y - mass.c[1], lz = z - mass.c[2], M = mass.planes;
      let block = M[0] * lx + M[1] * ly + M[2] * lz - M[3];
      for (let i = 4; i < M.length; i += 4) block = smootherMax(block, M[i] * lx + M[i + 1] * ly + M[i + 2] * lz - M[i + 3], plan.bulk.round);
      merged = merged === Infinity ? block : -smootherMax(-merged, -block, plan.bulk.join);
    }
    merged += macro * 0.08 + broad * 0.012;
    d = smootherMax(d, merged, 0.035);
  }
  if (plan.shoulderBreak) {
    const f2 = plan.shoulderBreak, lx = x - f2.center[0], ly = y - f2.center[1], lz = z - f2.center[2];
    const cut = f2.n[0] * lx + f2.n[1] * ly + f2.n[2] * lz - f2.d + macro * 0.035 + broad * 7e-3;
    d = smootherMax(d, cut, f2.round);
  }
  return d;
}
function surfaceNormals(geometry, guardCorners = false) {
  geometry.computeVertexNormals();
  const p = geometry.attributes.position.array, n = geometry.attributes.normal.array, ix = geometry.index.array;
  let corrections = 0;
  for (let pass = 0; pass < 8; pass++) {
    let changed = 0;
    for (let i = 0; i < ix.length; i += 3) {
      const a = ix[i] * 3, b = ix[i + 1] * 3, c2 = ix[i + 2] * 3, abx = p[b] - p[a], aby = p[b + 1] - p[a + 1], abz = p[b + 2] - p[a + 2], acx = p[c2] - p[a], acy = p[c2 + 1] - p[a + 1], acz = p[c2 + 2] - p[a + 2];
      let nx = aby * acz - abz * acy, ny = abz * acx - abx * acz, nz = abx * acy - aby * acx;
      const len = Math.hypot(nx, ny, nz);
      if (!len) continue;
      nx /= len;
      ny /= len;
      nz /= len;
      const dot2 = nx * (n[a] + n[b] + n[c2]) + ny * (n[a + 1] + n[b + 1] + n[c2 + 1]) + nz * (n[a + 2] + n[b + 2] + n[c2 + 2]);
      if (dot2 >= 0.06) continue;
      changed++;
      for (const j of [a, b, c2]) {
        const x = n[j] + nx * 0.36, y = n[j + 1] + ny * 0.36, z = n[j + 2] + nz * 0.36, l = Math.hypot(x, y, z);
        n[j] = x / l;
        n[j + 1] = y / l;
        n[j + 2] = z / l;
      }
    }
    corrections += changed;
    if (!changed) break;
  }
  if (guardCorners) {
    const faces = [];
    for (let i = 0; i < ix.length; i += 3) {
      const a = ix[i] * 3, b = ix[i + 1] * 3, c2 = ix[i + 2] * 3, abx = p[b] - p[a], aby = p[b + 1] - p[a + 1], abz = p[b + 2] - p[a + 2], acx = p[c2] - p[a], acy = p[c2 + 1] - p[a + 1], acz = p[c2 + 2] - p[a + 2], nx = aby * acz - abz * acy, ny = abz * acx - abx * acz, nz = abx * acy - aby * acx, len = Math.hypot(nx, ny, nz);
      if (len) faces.push([a, b, c2, nx / len, ny / len, nz / len]);
    }
    for (let pass = 0; pass < 64; pass++) {
      let changed = 0;
      for (const [a, b, c2, nx, ny, nz] of faces) for (const j of [a, b, c2]) {
        const dot2 = nx * n[j] + ny * n[j + 1] + nz * n[j + 2];
        if (dot2 >= 0.015) continue;
        const weight = 0.025 - dot2, x = n[j] + nx * weight, y = n[j + 1] + ny * weight, z = n[j + 2] + nz * weight, len = Math.hypot(x, y, z);
        n[j] = x / len;
        n[j + 1] = y / len;
        n[j + 2] = z / len;
        changed++;
      }
      corrections += changed;
      if (!changed) break;
    }
  }
  return corrections;
}
var CORNERS = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]];
var TETRA = [[0, 5, 1, 6], [0, 1, 2, 6], [0, 2, 3, 6], [0, 3, 7, 6], [0, 7, 4, 6], [0, 4, 5, 6]];
var EDGES = [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]];
function* rockGeometryStages(plan, { resolution = 16 } = {}) {
  if (!Number.isInteger(resolution) || resolution < 8 || resolution > 40) throw new Error("Rock mesh resolution must be 8..40");
  const margin = 0.045, min = plan.rawBounds.min.map((v) => v - margin), max = plan.rawBounds.max.map((v) => v + margin), step = min.map((v, i) => (max[i] - v) / resolution), n = resolution + 1, index2 = (x, y, z) => (z * n + y) * n + x, points = new Array(n * n * n), values = new Float32Array(n * n * n);
  for (let z = 0; z < n; z++) {
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const i = index2(x, y, z), p = [min[0] + x * step[0], min[1] + y * step[1], min[2] + z * step[2]];
      points[i] = p;
      values[i] = rockField(plan, ...p);
      if ((!x || !y || !z || x === resolution || y === resolution || z === resolution) && values[i] <= 0) throw new Error("Rock field touched mesh domain boundary");
    }
    yield { phase: "field", slice: z };
  }
  const positions = [], normals = [], uv = [], indices = [], cache2 = /* @__PURE__ */ new Map(), welded = /* @__PURE__ */ new Map();
  const crossing = (ia, ib) => {
    const key = ia < ib ? ia + "," + ib : ib + "," + ia;
    if (cache2.has(key)) return cache2.get(key);
    let a = points[ia], b = points[ib], fa = values[ia], fb = values[ib];
    for (let j = 0; j < 16; j++) {
      const p2 = a.map((v, k) => (v + b[k]) * 0.5), f2 = rockField(plan, ...p2);
      if (f2 < 0 === fa < 0) {
        a = p2;
        fa = f2;
      } else {
        b = p2;
        fb = f2;
      }
    }
    const t = clamp3(fa / (fa - fb), 0, 1), p = a.map((v, k) => v + (b[k] - v) * t), weldKey = [Math.fround(p[0]), Math.fround(p[1] - plan.originY), Math.fround(p[2])].join(",");
    if (welded.has(weldKey)) {
      const i2 = welded.get(weldKey);
      cache2.set(key, i2);
      return i2;
    }
    const i = positions.length / 3;
    positions.push(p[0], p[1] - plan.originY, p[2]);
    normals.push(0, 0, 0);
    uv.push(p[0] / plan.metricTextureTile, p[2] / plan.metricTextureTile);
    cache2.set(key, i);
    welded.set(weldKey, i);
    return i;
  };
  const triangle2 = (a, b, c2, outward) => {
    if (a === b || b === c2 || a === c2) return;
    const pa = new V(...positions.slice(a * 3, a * 3 + 3)), pb = new V(...positions.slice(b * 3, b * 3 + 3)), pc = new V(...positions.slice(c2 * 3, c2 * 3 + 3)), crossed = pb.sub(pa).cross(pc.sub(pa));
    if (crossed.lengthSq() === 0) return;
    if (!outward || crossed.dot(outward) > 0) indices.push(a, b, c2);
    else indices.push(a, c2, b);
  };
  for (let z = 0; z < resolution; z++) {
    for (let y = 0; y < resolution; y++) for (let x = 0; x < resolution; x++) {
      const cube = CORNERS.map((c2) => index2(x + c2[0], y + c2[1], z + c2[2]));
      for (const tet of TETRA) {
        const ids = tet.map((j) => cube[j]);
        let inside2 = 0;
        for (const i of ids) if (values[i] < 0) inside2++;
        if (inside2 === 0 || inside2 === 4) continue;
        const polygon = [], inner = new V(), outer = new V();
        for (const i of ids) (values[i] < 0 ? inner : outer).add(new V(...points[i]));
        const outward = outer.divideScalar(4 - inside2).sub(inner.divideScalar(inside2)).normalize();
        for (const [a2, b2] of EDGES) if (values[ids[a2]] < 0 !== values[ids[b2]] < 0) polygon.push(crossing(ids[a2], ids[b2]));
        if (polygon.length === 3) {
          triangle2(...polygon, outward);
          continue;
        }
        const innerIds = ids.filter((i) => values[i] < 0), outerIds = ids.filter((i) => values[i] >= 0), ordered = [crossing(innerIds[0], outerIds[0]), crossing(innerIds[0], outerIds[1]), crossing(innerIds[1], outerIds[1]), crossing(innerIds[1], outerIds[0])], point2 = (i) => new V(...positions.slice(i * 3, i * 3 + 3)), a = point2(ordered[0]), b = point2(ordered[1]), c2 = point2(ordered[2]), d = point2(ordered[3]), areaNormal = b.clone().sub(a).cross(c2.clone().sub(a)).add(c2.clone().sub(a).cross(d.clone().sub(a)));
        if (areaNormal.dot(outward) < 0) ordered.reverse();
        if (point2(ordered[0]).distanceToSquared(point2(ordered[2])) <= point2(ordered[1]).distanceToSquared(point2(ordered[3]))) {
          triangle2(ordered[0], ordered[1], ordered[2], null);
          triangle2(ordered[0], ordered[2], ordered[3], null);
        } else {
          triangle2(ordered[0], ordered[1], ordered[3], null);
          triangle2(ordered[1], ordered[2], ordered[3], null);
        }
      }
    }
    yield { phase: "mesh", slice: z };
  }
  const g = new BufferGeometry();
  g.name = "procedural-rock:" + plan.id + ":" + resolution;
  g.setAttribute("position", new Float32BufferAttribute(positions, 3));
  g.setAttribute("normal", new Float32BufferAttribute(normals, 3));
  g.setAttribute("uv", new Float32BufferAttribute(uv, 2));
  g.setIndex(indices);
  const normalCorrections = surfaceNormals(g, false);
  g.computeBoundingBox();
  g.computeBoundingSphere();
  g.userData = { proceduralRock: true, familyId: plan.id, fieldVersion: plan.fieldVersion, resolution, seed: plan.seed, originY: plan.originY, normalCorrections };
  return g;
}
function generateRockGeometry(plan, options = {}) {
  const iterator = rockGeometryStages(plan, options);
  let result;
  do {
    result = iterator.next();
  } while (!result.done);
  return result.value;
}
var cooperativeYield = () => !globalThis.document?.hidden && globalThis.scheduler?.yield ? globalThis.scheduler.yield() : yieldTask();
var ROCK_LODS = Object.freeze({ base: 30, triangles: Object.freeze({ near: 1400, far: 560, distant: 150 }), crease: Object.freeze({ near: 40, far: 46, distant: 56 }), cavityReach: 0.3 });
var ROCK_LOD_INDEX = Object.freeze({ near: 0, far: 1, distant: 2 });
function* rockLodStages(plan, { base = ROCK_LODS.base, triangles = ROCK_LODS.triangles, sharpen = true } = {}) {
  const field = (x, y, z) => rockField(plan, x, y, z), margin = 0.045, min = plan.rawBounds.min.map((v) => v - margin), max = plan.rawBounds.max.map((v) => v + margin), ext = max.map((v, i) => v - min[i]), size = Math.max(...ext), cell = size / base, dims = ext.map((e) => Math.max(2, Math.ceil(e / cell)));
  const started = performance.now(), mesh = yield* meshFieldStages(field, { min, cell, dims });
  if (sharpen) yield* sharpenStages(field, mesh, { cell });
  const meshed = performance.now();
  const lods = yield* decimateStages(mesh, [{ triangles: triangles.near }, { triangles: triangles.far }, { triangles: triangles.distant }]), decimated = performance.now();
  const volume = signedVolume(lods[0].positions, lods[0].indices), grown = [0, restoreVolume(lods[1], volume), restoreVolume(lods[2], volume)];
  const outside = (lod) => {
    let out2 = 0;
    const P = lod.positions, I = lod.indices, W = [[1 / 3, 1 / 3, 1 / 3], [0.5, 0.5, 0], [0, 0.5, 0.5], [0.5, 0, 0.5], [0.7, 0.15, 0.15], [0.15, 0.7, 0.15], [0.15, 0.15, 0.7]];
    for (let i = 0; i < I.length; i += 3) {
      const a = I[i] * 3, b = I[i + 1] * 3, c2 = I[i + 2] * 3;
      for (const w of W) out2 = Math.max(out2, field(P[a] * w[0] + P[b] * w[1] + P[c2] * w[2], P[a + 1] * w[0] + P[b + 1] * w[1] + P[c2 + 1] * w[2], P[a + 2] * w[0] + P[b + 2] * w[1] + P[c2 + 2] * w[2]));
    }
    return out2;
  };
  const farOut = outside(lods[1]), distantOut = outside(lods[2]);
  yield { phase: "lods" };
  const out = {}, names = ["near", "far", "distant"];
  let radius = 0;
  for (let i = 0; i < 3; i++) {
    const name = names[i], split = creaseSplit(lods[i], ROCK_LODS.crease[name] * Math.PI / 180), shade = fieldShading(field, split.positions, split.smooth, { reach: ROCK_LODS.cavityReach }), p = split.positions;
    for (let j = 1; j < p.length; j += 3) p[j] -= plan.originY;
    const g = new BufferGeometry();
    g.name = "procedural-rock:" + plan.id + ":" + name;
    g.setAttribute("position", new BufferAttribute(p, 3));
    g.setAttribute("normal", new BufferAttribute(split.normals, 3));
    g.setAttribute("uv", new BufferAttribute(shade, 2));
    if (name !== "near") g.setAttribute("rockSmoothN", new BufferAttribute(split.smooth, 3));
    g.setIndex(new BufferAttribute(split.indices, 1));
    g.computeBoundingBox();
    g.computeBoundingSphere();
    if (!i) radius = g.boundingSphere.radius;
    g.userData = { proceduralRock: true, familyId: plan.id, fieldVersion: plan.fieldVersion, lod: name, seed: plan.seed, originY: plan.originY, triangles: split.indices.length / 3 };
    out[name] = g;
    yield { phase: "finish", lod: name };
  }
  const inset = clamp3(farOut, 0.01 * radius, 0.035 * radius), distantInset = clamp3(distantOut, 0.015 * radius, 0.06 * radius);
  for (let i = 0; i < 3; i++) {
    const g = out[names[i]], n = g.attributes.position.count, a = new Float32Array(n * 3), own = [0, inset, distantInset][i];
    for (let j = 0; j < n; j++) {
      a[j * 3] = i;
      a[j * 3 + 1] = radius;
      a[j * 3 + 2] = own;
    }
    g.setAttribute("rockLod", new BufferAttribute(a, 3));
  }
  out.stats = { base: mesh.indices.length / 3, near: out.near.userData.triangles, far: out.far.userData.triangles, distant: out.distant.userData.triangles, size, radius, inset, distantInset, farOut, distantOut, grown, meshMs: Math.round(meshed - started), decimateMs: Math.round(decimated - meshed), totalMs: Math.round(performance.now() - started) };
  return out;
}
function generateRockLods(plan, options = {}) {
  const iterator = rockLodStages(plan, options);
  let result;
  do {
    result = iterator.next();
  } while (!result.done);
  return result.value;
}
async function generateRockLodsAsync(plan, { yieldControl = cooperativeYield, signal, onSlice, sliceMs = 8, ...options } = {}) {
  const iterator = rockLodStages(plan, options);
  try {
    while (true) {
      if (signal?.aborted) throw new DOMException("Rock generation aborted", "AbortError");
      const start = performance.now();
      let result;
      do {
        result = iterator.next();
      } while (!result.done && performance.now() - start < sliceMs);
      onSlice?.({ familyId: plan.id, ...result.done ? {} : result.value, done: result.done, milliseconds: performance.now() - start });
      if (result.done) return result.value;
      await yieldControl();
    }
  } finally {
    iterator.return();
  }
}
var rockClimateScratch = {};
var ROCK_FORM = Object.freeze({ lean: 0.72, maxLean: Object.freeze([0.52, 0.8]), wobble: 0.06, stretch: Object.freeze([0.82, 1.22]), height: Object.freeze([0.84, 1.18]) });
var formUp = new V(0, 1, 0);
var formNormal = new V();
var formTilt = new Quaternion();
var formYaw = new Quaternion();
var formAxis = new V();
function chooseRockFamily(terrainFunctions, rock, worldSeed = 728194, { lean = ROCK_FORM.lean } = {}) {
  const bank = rock.hydroGeology;
  if (bank && ["jointed-1", "bedded-2"].includes(bank.familyId) && Number.isFinite(bank.yaw)) {
    const [type2, variant2] = bank.familyId.split("-");
    formYaw.setFromAxisAngle(formUp, bank.yaw);
    return { id: bank.familyId, type: type2, variant: Number(variant2), yaw: bank.yaw, rotationX: 0, lean: 0, grade: 0, scale: [1, 1, 1], quaternion: formYaw.toArray() };
  }
  const f2 = terrainFunctions, x = rock.x, z = rock.z, grade = f2.slope(x, z), channel2 = f2.projectChannel?.(x, z, 14), dry = vegetationClimate(f2, x, z, rock.y, rockClimateScratch).ash;
  const worn = channel2 ? channel2.distance < 14 && rock.y >= channel2.level - 0.3 && rock.y < channel2.level + 3.4 : !f2.projectChannel && Math.abs(x - (22 + Math.sin(z * 0.011) * 24 + Math.sin(z * 0.037) * 7)) < 28 && rock.y < 6;
  const type = worn ? "waterworn" : dry > 0.62 ? "bedded" : grade > 0.48 ? "jointed" : "weathered", variant = hash32(worldSeed + ":" + rock.id + ":shape") % 4, orientation = hash32(worldSeed + ":" + Math.floor(x / 96) + "," + Math.floor(z / 96) + ":joint") / 4294967296 * TAU;
  const h = (key) => hash32(worldSeed + ":" + rock.id + ":" + key) / 4294967296, F = ROCK_FORM;
  const yaw = type === "bedded" ? orientation + (h("yaw") - 0.5) * 0.7 : h("yaw") * TAU;
  const scale = [F.stretch[0] + (F.stretch[1] - F.stretch[0]) * h("sx"), F.height[0] + (F.height[1] - F.height[0]) * h("sy") * (type === "bedded" ? 0.8 : 1), F.stretch[0] + (F.stretch[1] - F.stretch[0]) * h("sz")];
  const e = clamp3((rock.r || 1) * 0.9, 0.5, 3), gx = (f2.height(x + e, z) - f2.height(x - e, z)) / (2 * e), gz = (f2.height(x, z + e) - f2.height(x, z - e)) / (2 * e);
  formNormal.set(-gx, 1, -gz).normalize();
  const fall = Math.hypot(gx, gz), slope2 = Math.acos(clamp3(formNormal.y, -1, 1)), steep = clamp3((fall - 0.6) / 1, 0, 1), angle = Math.min(F.maxLean[0] + (F.maxLean[1] - F.maxLean[0]) * steep, slope2 * lean);
  formYaw.setFromAxisAngle(formUp, yaw);
  formTilt.identity();
  if (slope2 > 1e-4) {
    formAxis.crossVectors(formUp, formNormal).normalize();
    formTilt.setFromAxisAngle(formAxis, angle);
  }
  const wobbleAxis = h("wobble-axis") * TAU;
  formAxis.set(Math.cos(wobbleAxis), 0, Math.sin(wobbleAxis));
  formTilt.multiply(new Quaternion().setFromAxisAngle(formAxis, (h("wobble") - 0.5) * 2 * F.wobble));
  return { id: type + "-" + variant, type, variant, yaw, rotationX: 0, lean: angle, grade: fall, scale, quaternion: formTilt.multiply(formYaw).toArray() };
}
var formPosition = new V();
var formScale = new V();
var formRotation = new Quaternion();
function rockFormMatrix(choice, rock, y, out = new Matrix4()) {
  const s = (rock.r || 1) * 0.92;
  formScale.set(choice.scale[0] * s, choice.scale[1] * s, choice.scale[2] * s);
  formRotation.fromArray(choice.quaternion);
  formPosition.set(rock.x, y, rock.z);
  return out.compose(formPosition, formRotation, formScale);
}
function createProceduralRockMaterial(maps) {
  if (!maps?.cliff || !maps?.cliffN) throw new Error("Procedural rock material requires existing cliff colour and normal photos");
  const material = new MeshStandardMaterial({ map: maps.cliff, aoMap: maps.cliffAO || null, color: 16777215, roughness: 0.94, metalness: 0, envMapIntensity: 0.65 });
  material.name = "Procedural rock | metric triplanar photographed PBR";
  const uniforms = { rockPhotoNormal: { value: maps.cliffN }, rockMossPhoto: { value: maps.grass || maps.cliff }, rockSnowPhoto: { value: maps.snow || maps.cliff }, rockSnowNormal: { value: maps.snowN || maps.cliffN }, rockTextureMeters: { value: 2.2 }, rockPhotoResponse: { value: 1 } };
  Object.defineProperty(material.userData, "rockPhotoResponse", { value: uniforms.rockPhotoResponse, enumerable: false });
  material.userData.setRockPhotoResponse = (value) => {
    if (!Number.isFinite(value) || value < 0 || value > 1) throw RangeError("Rock photo response must be in [0,1]");
    uniforms.rockPhotoResponse.value = value;
    return value;
  };
  material.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, uniforms);
    s.vertexShader = "varying vec3 vRockWorld;varying vec3 vRockNormal;varying float vRockBase;varying vec2 vRockShape;varying vec3 vRockTint;\n" + s.vertexShader;
    s.vertexShader = s.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>
   vRockShape=clamp(uv,0.,1.);vRockTint=vec3(1.);
   #ifdef USE_INSTANCING
    mat3 rockTransform=mat3(modelMatrix*instanceMatrix);vec3 rockScaleSq=vec3(dot(rockTransform[0],rockTransform[0]),dot(rockTransform[1],rockTransform[1]),dot(rockTransform[2],rockTransform[2]));vRockWorld=(modelMatrix*instanceMatrix*vec4(transformed,1.)).xyz;vRockBase=(modelMatrix*instanceMatrix)[3].y;vRockNormal=normalize(rockTransform*(normal/max(rockScaleSq,vec3(.000001))));
    vec2 rockAt=floor((modelMatrix*instanceMatrix)[3].xz*8.)+.5;float rockPick=fract(sin(dot(rockAt,vec2(12.9898,78.233)))*43758.5453),rockAmount=.45+.55*fract(sin(dot(rockAt,vec2(39.346,11.135)))*24634.6345);
    vec3 rockTints[6]=vec3[6](vec3(1.),vec3(1.08,1.01,.91),vec3(.92,.97,1.04),vec3(.84,.84,.86),vec3(1.07,1.06,1.03),vec3(1.05,.94,.87));
    vRockTint=mix(vec3(1.),rockTints[int(min(5.,floor(rockPick*6.)))],rockAmount);
   #else
    mat3 rockTransform=mat3(modelMatrix);vec3 rockScaleSq=vec3(dot(rockTransform[0],rockTransform[0]),dot(rockTransform[1],rockTransform[1]),dot(rockTransform[2],rockTransform[2]));vRockWorld=(modelMatrix*vec4(transformed,1.)).xyz;vRockBase=modelMatrix[3].y;vRockNormal=normalize(rockTransform*(normal/max(rockScaleSq,vec3(.000001))));
   #endif
  `);
    s.fragmentShader = `varying vec3 vRockWorld;varying vec3 vRockNormal;varying float vRockBase;varying vec2 vRockShape;varying vec3 vRockTint;uniform sampler2D rockPhotoNormal;uniform sampler2D rockMossPhoto;uniform sampler2D rockSnowPhoto;uniform sampler2D rockSnowNormal;uniform float rockTextureMeters;uniform float rockPhotoResponse;
   ${MINERAL_SURFACE_GRADIENT_GLSL}
   ${islandBiomeGLSL}
   ${TEMPERATE_MINERAL_GLSL}
   vec4 rockTri(sampler2D photo,vec3 p,vec3 w){return texture2D(photo,p.zy)*w.x+texture2D(photo,p.xz)*w.y+texture2D(photo,p.xy)*w.z;}
   float rockHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
   float rockNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(rockHash(i),rockHash(i+vec2(1.,0.)),f.x),mix(rockHash(i+vec2(0.,1.)),rockHash(i+1.),f.x),f.y);}
  ` + s.fragmentShader;
    s.fragmentShader = s.fragmentShader.replace("#include <map_fragment>", `vec3 rockN=normalize(vRockNormal),rockWeights=pow(abs(rockN),vec3(5.));rockWeights/=max(dot(rockWeights,vec3(1.)),.001);vec3 rockUV=vRockWorld/rockTextureMeters;vec4 rockPhoto=rockTri(map,rockUV,rockWeights);
   IslandClimate rockClimate=islandClimate(vRockWorld);
   // A pooled rock is already a physical mineral object; correct its substrate
   // before moss and snow so their sampled color and coverage remain intact.
   rockPhoto.rgb=temperateMineralColor(rockPhoto.rgb,temperateMineralDomain(vRockWorld,rockClimate));
   // v97: the rock's own tint; darker in its hollows, a little paler on worn edges.
   float rockCavity=vRockShape.x,rockEdge=vRockShape.y;
   rockPhoto.rgb*=vRockTint*(1.-.36*rockCavity)*(1.+.14*rockEdge)*${MATERIAL_ALBEDO.rock.toFixed(4)};
   diffuseColor.rgb*=rockPhoto.rgb;diffuseColor.a=opacity;
   float rockDry=rockClimate.ash,rockSnow=rockClimate.snow*smoothstep(.48,.85,rockN.y),rockWet=1.-smoothstep(1.,5.,vRockWorld.y);vec2 rockSnowUV=vRockWorld.xz/3.15*1.5;
   float rockMoss=(1.-rockDry)*smoothstep(.40,.70,rockNoise(vRockWorld.xz*.71+rockN.xz*2.))*smoothstep(.20,.85,rockN.y)*.48*smoothstep(1.8,4.5,vRockWorld.y);
   // v96 (back in v96.2): a forest's rocks (shade, damp air) wear thick moss:
   // over their tops and down the sides toward the soil, in cushions. (v96's
   // warmer stone between and dark line of soil at the foot stay out.)
   float rockAbove=vRockWorld.y-vRockBase;
   #ifdef LAND_SUN_FIELD
   // The ground's own height from the sun field (the rock's base lies buried).
   if(land_sunFieldReady>.5){vec2 rockField=vRockWorld.xz*land_sunFieldMap.xy+land_sunFieldMap.zw;if(all(greaterThan(rockField,vec2(.002)))&&all(lessThan(rockField,vec2(.998))))rockAbove=vRockWorld.y-textureLod(land_sunField,rockField*land_sunAtlas,0.).g;}
   #endif
   float rockWood=(1.-rockDry)*(1.-rockClimate.snow)*smoothstep(.12,.55,rockClimate.forest+rockClimate.swamp*.6)*smoothstep(.6,2.2,vRockWorld.y);
   float rockCushion=rockNoise(vRockWorld.xz*1.7+rockN.xz*1.3+vRockWorld.y*.9)*.62+rockNoise(vRockWorld.xz*5.3-vRockWorld.y*2.1)*.38;
   float rockMossWood=rockWood*smoothstep(.36,.6,rockCushion*(.7+.55*smoothstep(-.1,.75,rockN.y))+.3*(1.-smoothstep(.15,.9,rockAbove)));
   rockMoss=max(rockMoss,rockMossWood*.92);
   // Moss keeps to hollows and crevices and wears off the edges.
   rockMoss=clamp(rockMoss+rockWood*rockCavity*.5,0.,1.)*(1.-.55*rockEdge);
   vec3 rockMossTint=mix(vec3(.42,.6,.24),vec3(.62,.66,.3),rockNoise(vRockWorld.xz*.37+3.1));
   diffuseColor.rgb=mix(diffuseColor.rgb,texture2D(rockMossPhoto,vRockWorld.xz/1.6+rockN.xz*.3).rgb*rockMossTint*(.75+.5*rockCushion),rockMoss);
   diffuseColor.rgb*=mix(1.,.76,rockWet*.55);diffuseColor.rgb*=mix(vec3(1.),vec3(.5,.56,.42),(1.-smoothstep(.5,1.6,vRockWorld.y))*.85);diffuseColor.rgb=mix(diffuseColor.rgb,texture2D(rockSnowPhoto,rockSnowUV).rgb*vec3(.93,.97,1.)*${MATERIAL_ALBEDO.snow.toFixed(4)},rockSnow*.96);
  `);
    s.fragmentShader = s.fragmentShader.replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor=mix(clamp(rockPhoto.a*.94+rockMoss*.4-rockWet*.11,.58,1.),.94,rockSnow);");
    s.fragmentShader = s.fragmentShader.replace("#include <normal_fragment_maps>", `vec3 rockShadeN=mineralTriNormal(rockPhotoNormal,rockUV,rockN,rockWeights,mix(.62,1.,rockPhotoResponse)),snowPhotoN=texture2D(rockSnowNormal,rockSnowUV).xyz*2.-1.;rockShadeN=normalize(mix(rockShadeN,rockN,rockMoss*.65));normal=normalize(mat3(viewMatrix)*normalize(mix(rockShadeN,normalize(rockN+vec3(snowPhotoN.x,0.,snowPhotoN.y)),rockSnow)));`);
    const aoMarker = "texture2D( aoMap, vAoMapUv ).r";
    if (!ShaderChunk.aomap_fragment.includes(aoMarker)) throw Error("Rock AO shader seam changed");
    const aoChunk = ShaderChunk.aomap_fragment.replace(aoMarker, "mix(1.,rockTri(aoMap,rockUV,rockWeights).r,rockPhotoResponse*(1.-rockSnow)*(1.-rockMoss))*(1.-.55*rockCavity)");
    s.fragmentShader = s.fragmentShader.replace("#include <aomap_fragment>", aoChunk);
  };
  material.customProgramCacheKey = () => "procedural-rock-triplanar-v34-temperate-mineral-experiment|photo-response-v65-r1|sea-wash-v87|forest-moss-v96.2|cavity-tint-v97|albedo-v97.1";
  material.userData.refreshMaps = (next) => {
    if (!next.cliff || !next.cliffN) throw new Error("Rock photo maps missing");
    material.map = next.cliff;
    uniforms.rockPhotoNormal.value = next.cliffN;
    uniforms.rockMossPhoto.value = next.grass || next.cliff;
    uniforms.rockSnowPhoto.value = next.snow || next.cliff;
    uniforms.rockSnowNormal.value = next.snowN || next.cliffN;
  };
  return material;
}
function supportSamples(geometry) {
  const mesh = new Mesh(geometry, new MeshBasicMaterial({ side: DoubleSide }));
  mesh.updateMatrixWorld(true);
  const box = geometry.boundingBox, ray = new Raycaster(), samples = [], down = new V(0, 1, 0), w = box.max.x - box.min.x, d = box.max.z - box.min.z;
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * TAU, x = Math.cos(a) * w * 0.28, z = Math.sin(a) * d * 0.28;
    ray.set(new V(x, box.min.y - 1, z), down);
    const hit = ray.intersectObject(mesh, false)[0];
    if (hit) samples.push(hit.point.clone());
  }
  mesh.material.dispose();
  return samples;
}
function template(geometry, material, plan) {
  const size = geometry.boundingBox.getSize(new V());
  return { parts: [{ geometry, material, leaf: false }], geometry, material, height: size.y, size, bounds: { min: geometry.boundingBox.min.toArray(), max: geometry.boundingBox.max.toArray() }, plan };
}
function footPoints(geometry) {
  const p = geometry.attributes.position, box = geometry.boundingBox, limit = box.min.y + (box.max.y - box.min.y) * 0.33, seen = /* @__PURE__ */ new Set(), out = [];
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    if (y > limit) continue;
    const key = p.getX(i).toFixed(4) + "," + y.toFixed(4) + "," + p.getZ(i).toFixed(4);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p.getX(i), y, p.getZ(i));
  }
  return Float32Array.from(out);
}
var ROCK_FAMILY_IDS = Object.freeze(TYPES.flatMap((type) => [0, 1, 2, 3].map((variant) => type + "-" + variant)));
var LOD_ATTRIBUTES = Object.freeze({ near: ["position", "normal", "uv", "rockLod"], far: ["position", "normal", "uv", "rockLod", "rockSmoothN"], distant: ["position", "normal", "uv", "rockLod", "rockSmoothN"] });
var ROCK_CACHE_PREFIX = PROCEDURAL_ROCK_VERSION + "|" + JSON.stringify(ROCK_LODS) + "|cache-v1|";
function packLods(lods) {
  const out = { stats: lods.stats };
  for (const name of ["near", "far", "distant"]) {
    const g = lods[name];
    out[name] = { attributes: Object.fromEntries(LOD_ATTRIBUTES[name].map((a) => [a, { array: g.attributes[a].array, itemSize: g.attributes[a].itemSize }])), index: g.index.array, userData: { ...g.userData } };
  }
  return out;
}
function unpackLods(data, plan) {
  const out = { stats: data?.stats };
  if (!(data?.stats?.radius > 0)) throw new Error("Cached rock stats missing");
  for (const name of ["near", "far", "distant"]) {
    const d = data[name], g = new BufferGeometry(), n = d?.attributes?.position?.array?.length / 3;
    if (!Number.isInteger(n) || n < 4) throw new Error("Cached rock mesh missing");
    for (const a of LOD_ATTRIBUTES[name]) {
      const v = d.attributes[a];
      if (!(v?.array instanceof Float32Array) || v.array.length !== n * v.itemSize) throw new Error("Cached rock attribute broken");
      g.setAttribute(a, new BufferAttribute(v.array, v.itemSize));
    }
    if (!(d.index instanceof Uint32Array) || d.index.length % 3 || d.index.some((i) => i >= n)) throw new Error("Cached rock index broken");
    g.setIndex(new BufferAttribute(d.index, 1));
    g.name = "procedural-rock:" + plan.id + ":" + name;
    g.computeBoundingBox();
    g.computeBoundingSphere();
    if (d.userData?.familyId !== plan.id || d.userData?.fieldVersion !== plan.fieldVersion) throw new Error("Cached rock of another family");
    g.userData = { ...d.userData };
    out[name] = g;
  }
  return out;
}
function createProceduralRockLibrary({ seed = 728194, maps, lodOptions = {}, cache: cache2 = true } = {}) {
  const material = createProceduralRockMaterial(maps), plans = /* @__PURE__ */ new Map(), families = /* @__PURE__ */ new Map(), pending = /* @__PURE__ */ new Map();
  let disposed = false, cacheHits = 0;
  for (const id of ROCK_FAMILY_IDS) plans.set(id, createRockPlan(id, seed));
  const finish = (id, lods) => {
    const plan = plans.get(id), near = template(lods.near, material, plan), far = template(lods.far, material, plan), distant = template(lods.distant, material, plan), samples = supportSamples(lods.near);
    for (const t of [near, far, distant]) t.ecologySupportSamples = samples;
    const result = { id, type: plan.type, variant: plan.variant, near, far, distant, supportSamples: samples, foot: footPoints(lods.near), radius: lods.stats.radius, inset: lods.stats.inset, stats: lods.stats, plan };
    families.set(id, result);
    return result;
  };
  const getFamilyAsync = (id, { signal, yieldControl, onSlice } = {}) => {
    if (disposed) return Promise.reject(new Error("Procedural rock library disposed"));
    if (families.has(id)) return Promise.resolve(families.get(id));
    if (pending.has(id)) return pending.get(id);
    const plan = plans.get(id);
    if (!plan) return Promise.reject(new Error("Unknown procedural rock family " + id));
    const task = (async () => {
      const cancellation = { get aborted() {
        return disposed || signal?.aborted;
      } };
      let lods = null;
      try {
        lods = await generateRockLodsAsync(plan, { ...lodOptions, signal: cancellation, yieldControl, onSlice });
        if (cancellation.aborted) throw new DOMException("Rock generation aborted", "AbortError");
        return finish(id, lods);
      } catch (error) {
        for (const g of [lods?.near, lods?.far, lods?.distant]) g?.dispose();
        throw error;
      } finally {
        pending.delete(id);
      }
    })();
    pending.set(id, task);
    return task;
  };
  const lodsOf = (f2) => [f2.near, f2.far, f2.distant];
  return {
    seed,
    material,
    ids: ROCK_FAMILY_IDS,
    getPlan(id) {
      const p = plans.get(id);
      if (!p) throw new Error("Unknown procedural rock family " + id);
      return p;
    },
    getFamily(id) {
      if (disposed) throw new Error("Procedural rock library disposed");
      if (families.has(id)) return families.get(id);
      if (pending.has(id)) throw new Error("Rock family generation pending; await getFamilyAsync");
      const plan = plans.get(id);
      if (!plan) throw new Error("Unknown procedural rock family " + id);
      return finish(id, generateRockLods(plan, lodOptions));
    },
    getFamilyAsync,
    // Families this browser kept for this seed and generator come back at once;
    // the rest are made (and the whole set kept for next time).
    async prepare({ onProgress, ...options } = {}) {
      const key = ROCK_CACHE_PREFIX + (seed >>> 0), kept = cache2 && !Object.keys(lodOptions).length ? await readRockFamilies(key) : null;
      let count = 0, made = 0;
      for (const id of plans.keys()) {
        if (!families.has(id) && !pending.has(id) && kept?.[id]) {
          try {
            finish(id, unpackLods(kept[id], plans.get(id)));
            cacheHits++;
          } catch {
          }
        }
        if (!families.has(id)) {
          await getFamilyAsync(id, options);
          made++;
        }
        onProgress?.({ done: ++count, total: plans.size, id });
      }
      if (made && cache2 && !Object.keys(lodOptions).length && !disposed) {
        const all = {};
        for (const [id, f2] of families) all[id] = packLods({ near: f2.near.geometry, far: f2.far.geometry, distant: f2.distant.geometry, stats: f2.stats });
        writeRockFamilies(key, all, ROCK_CACHE_PREFIX);
      }
    },
    refreshMaps(next) {
      material.userData.refreshMaps(next);
    },
    statistics() {
      let triangles = 0, bytes = 0;
      const lodTriangles = { near: 0, far: 0, distant: 0 };
      for (const f2 of families.values()) for (const [name, t] of Object.entries({ near: f2.near, far: f2.far, distant: f2.distant })) {
        const n = t.geometry.index.count / 3;
        triangles += n;
        lodTriangles[name] += n;
        bytes += t.geometry.index.array.byteLength;
        for (const a of Object.values(t.geometry.attributes)) bytes += a.array.byteLength;
      }
      const count = Math.max(1, families.size);
      return { generatedFamilies: families.size, cachedFamilies: cacheHits, pendingFamilies: pending.size, maxFamilies: 16, maxPools: 48, geometryBytes: bytes, triangles, meanTriangles: { near: Math.round(lodTriangles.near / count), far: Math.round(lodTriangles.far / count), distant: Math.round(lodTriangles.distant / count) }, materialCount: 1, newTextureCount: 0 };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const f2 of families.values()) for (const t of lodsOf(f2)) t.geometry.dispose();
      families.clear();
      material.dispose();
    }
  };
}

// procedural-rock-obstacles.js
var cross2 = (a, b, c2) => (b.x - a.x) * (c2.z - a.z) - (b.z - a.z) * (c2.x - a.x);
function hull(points) {
  points.sort((a, b) => a.x - b.x || a.z - b.z);
  const unique = points.filter((p, i) => !i || p.x !== points[i - 1].x || p.z !== points[i - 1].z), lower = [], upper = [];
  for (const p of unique) {
    while (lower.length > 1 && cross2(lower.at(-2), lower.at(-1), p) <= 1e-10) lower.pop();
    lower.push(p);
  }
  for (let i = unique.length - 1; i >= 0; i--) {
    const p = unique[i];
    while (upper.length > 1 && cross2(upper.at(-2), upper.at(-1), p) <= 1e-10) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}
function createRockEnvelopeSampler({ terrainFunctions, seed = 728194, planFor } = {}) {
  const plans = /* @__PURE__ */ new Map(), cache2 = /* @__PURE__ */ new Map(), object = new Object3D(), v = new Vector3();
  let hits = 0, misses = 0;
  const plan = (id) => {
    if (planFor) return planFor(id);
    if (!plans.has(id)) plans.set(id, createRockPlan(id, seed));
    return plans.get(id);
  };
  function sample(rock) {
    let result = cache2.get(rock.id);
    if (result) {
      hits++;
      return result;
    }
    misses++;
    const choice = chooseRockFamily(terrainFunctions, rock, seed), p = plan(choice.id);
    rockFormMatrix(choice, rock, 0, object.matrix);
    const points = hull(p.envelopeVertices.map((a) => {
      v.fromArray(a).applyMatrix4(object.matrix);
      return { x: v.x, z: v.z };
    })), rx = Math.max(...points.map((p2) => Math.abs(p2.x - rock.x))), rz = Math.max(...points.map((p2) => Math.abs(p2.z - rock.z)));
    for (const p2 of points) Object.freeze(p2);
    result = Object.freeze({ id: rock.id, x: rock.x, z: rock.z, rx, rz, cs: 1, sn: 0, polygon: Object.freeze(points), familyId: choice.id });
    if (cache2.size >= 8192) cache2.delete(cache2.keys().next().value);
    cache2.set(rock.id, result);
    return result;
  }
  return { sample, clear() {
    cache2.clear();
    plans.clear();
  }, stats() {
    return { records: cache2.size, capacity: 8192, plans: plans.size, hits, misses };
  } };
}
function rockEnvelopeContains(envelope, x, z, margin = 0) {
  if (Math.abs(x - envelope.x) > envelope.rx + margin || Math.abs(z - envelope.z) > envelope.rz + margin) return false;
  const p = { x, z }, points = envelope.polygon;
  let inside2 = true, best = Infinity;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    if (cross2(a, b, p) < -1e-9) inside2 = false;
    if (margin > 0) {
      const dx = b.x - a.x, dz = b.z - a.z, t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1)));
      best = Math.min(best, (x - a.x - dx * t) ** 2 + (z - a.z - dz * t) ** 2);
    }
  }
  return inside2 || best <= margin * margin;
}

// rock-slots.js
var ROCK_SLOTS = Object.freeze({ ordinary: 19, bank: 80, total: 99 });
var ROCK_SIZES = Object.freeze({ ordinary: Object.freeze([0.32, 3.37, 1.75]), bank: Object.freeze([0.5, 2.4, 1.5]) });
function rockSlotRadius(slot, u) {
  const [lo, hi, power] = slot < ROCK_SLOTS.ordinary ? ROCK_SIZES.ordinary : ROCK_SIZES.bank;
  return lo + (hi - lo) * Math.pow(u, power);
}
var chunkRng = (terrainFunctions, cx, cz) => (i, n) => terrainFunctions.hash(cx * 229 + cz * 733 + i * 13, n);

// tree-placement.js
var TREE_PLACEMENT_VERSION = "canonical-tree-placement-v99.3-rocks";
var TREE_PLACEMENT_SLOTS = 66;
var scratch = {};
var coastScratch2 = {};
var smooth3 = (a, b, v) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
var COAST_BEACH = Object.freeze({ band: Object.freeze([36, 80]), above: Object.freeze([1.3, 2.1]), bare: 0.85 });
function coastBareOf(c2, above) {
  const kinds = (c2.rock + c2.pebble) * (1 - smooth3(3.5, 6, above)) + c2.mud + 0.8 * smooth3(0.06, 0.45, c2.dune);
  const B = COAST_BEACH, beach = Number.isFinite(c2.shore) ? (1 - smooth3(B.band[0], B.band[1], c2.shore)) * (1 - smooth3(B.above[0], B.above[1], above)) * (1 - Math.min(1, c2.rock + c2.pebble + c2.mud + c2.dune)) : 0;
  return Math.min(1, kinds + B.bare * beach);
}
function coastBare(f2, x, z, y) {
  if (!f2.coastAt) return 0;
  return coastBareOf(f2.coastAt(x, z, coastScratch2), (y ?? f2.height(x, z)) - (f2.seaLevel ?? 0.62));
}
var MARSH_TREE_EDGE = 6;
function inMarshBasin(world, x, z) {
  const d = world.worldModel?.sampler?.marshDistance?.(x, z);
  return d !== void 0 && d > MARSH_TREE_EDGE;
}
var MARSH_DEAD_EDGE = Object.freeze({ from: -30, to: MARSH_TREE_EDGE, share: 0.78 });
function marshTreeThinned(world, x, z) {
  const d = world.worldModel?.sampler?.marshDistance?.(x, z);
  if (d === void 0 || d <= MARSH_DEAD_EDGE.from) return false;
  const t = Math.min(1, (d - MARSH_DEAD_EDGE.from) / (MARSH_DEAD_EDGE.to - MARSH_DEAD_EDGE.from)), k = t * t * (3 - 2 * t);
  return world.terrainFunctions.hash(Math.floor(x * 4.31 + 7919), Math.floor(z * 3.77 - 4421)) < k * MARSH_DEAD_EDGE.share;
}
var TREE_ROCK = Object.freeze({ scale: 1.35, trunk: 0.35, step: 0.05 });
var rockSlotCache = /* @__PURE__ */ new Map();
function chunkRockSlots(hash4, cx, cz) {
  const key = cx + "," + cz;
  let list = rockSlotCache.get(key);
  if (list && list.hash === hash4) return list;
  list = new Float64Array(ROCK_SLOTS.ordinary * 3);
  list.hash = hash4;
  for (let i = 0; i < ROCK_SLOTS.ordinary; i++) {
    const seed = cx * 229 + cz * 733 + i * 13;
    list[i * 3] = cx * 64 + hash4(seed, 9) * 64;
    list[i * 3 + 1] = cz * 64 + hash4(seed, 10) * 64;
    list[i * 3 + 2] = rockSlotRadius(i, hash4(seed, 11));
  }
  if (rockSlotCache.size > 4096) rockSlotCache.clear();
  rockSlotCache.set(key, list);
  return list;
}
function rockAt(hash4, x, z) {
  const reach = TREE_ROCK.scale * 3.4 + TREE_ROCK.trunk;
  let best = null, depth = 0;
  for (let gz = Math.floor((z - reach) / 64); gz <= Math.floor((z + reach) / 64); gz++) for (let gx = Math.floor((x - reach) / 64); gx <= Math.floor((x + reach) / 64); gx++) {
    const list = chunkRockSlots(hash4, gx, gz);
    for (let i = 0; i < list.length; i += 3) {
      const dx = x - list[i], dz = z - list[i + 1], r = list[i + 2] * TREE_ROCK.scale + TREE_ROCK.trunk, d = Math.sqrt(dx * dx + dz * dz);
      if (d < r && r - d > depth) {
        depth = r - d;
        best = { x: list[i], z: list[i + 1], r, d, dx, dz };
      }
    }
  }
  return best;
}
function treeSpotOffRocks(hash4, x, z, cx, cz) {
  const rock = rockAt(hash4, x, z);
  if (!rock) return { x, z, moved: false };
  const len = rock.d || 1, ux = rock.d ? rock.dx / len : Math.cos(hash4(Math.floor(x * 7), 41) * Math.PI * 2), uz = rock.d ? rock.dz / len : Math.sin(hash4(Math.floor(x * 7), 41) * Math.PI * 2);
  const nx = rock.x + ux * (rock.r + TREE_ROCK.step), nz = rock.z + uz * (rock.r + TREE_ROCK.step);
  if (Math.floor(nx / 64) !== cx || Math.floor(nz / 64) !== cz || rockAt(hash4, nx, nz)) return null;
  return { x: nx, z: nz, moved: true };
}
function treePlacementCandidate(world, cx, cz, i, climateScratch2 = scratch) {
  const f2 = world.terrainFunctions, rng2 = (n) => f2.hash(cx * 229 + cz * 733 + i * 13, n);
  const spot = treeSpotOffRocks(f2.hash, cx * 64 + rng2(1) * 64, cz * 64 + rng2(2) * 64, cx, cz);
  if (!spot) return null;
  const x = spot.x, z = spot.z, y = f2.height(x, z);
  const treeClimate2 = f2.climate(x, z, y, climateScratch2), treeDensity = treeClimate2.treeDensity;
  if (rng2(99) > treeDensity) return null;
  if (y < 1.5 || world.hydrology.waterAt(x, z, y) || inMarshBasin(world, x, z) || marshTreeThinned(world, x, z) || f2.slope(x, z) > 0.9 || coastBare(f2, x, z, y) > 0.45 || world.landmarks.some((l) => Math.hypot(x - l.x, z - l.z) < l.clear)) return null;
  const id = cx + "," + cz + ":tree:" + i;
  if (world.removed.has(id)) return null;
  return treeRecord(x, y, z, id, rng2, treeClimate2);
}
var TREE_CHARACTER = Object.freeze({ old: 0.045, oldFrom: 18, oldWidth: Object.freeze([1.5, 1.8]), oldHeight: 1.12, leaning: 0.07, lean: 0.9 });
function treeCharacter(rng2, h, width) {
  const C = TREE_CHARACTER, old = h > C.oldFrom && rng2(31) < C.old;
  const lean = rng2(32) < C.leaning ? (rng2(33) - 0.5) * C.lean : (rng2(6) - 0.5) * 0.1;
  return { h: old ? h * C.oldHeight : h, width: old ? width * (C.oldWidth[0] + rng2(34) * (C.oldWidth[1] - C.oldWidth[0])) : width, lean, old };
}
function treeRecord(x, y, z, id, rng2, treeClimate2) {
  const character = treeCharacter(rng2, (rng2(7) < 0.22 ? 4 + rng2(3) * 7 : 13 + rng2(3) * 15) * (1 - treeClimate2.swamp * 0.22), 0.75 + rng2(5) * 0.65);
  return { x, y, z, h: character.h, id, r: rng2(4), width: character.width, lean: character.lean };
}
var authorities = /* @__PURE__ */ new WeakMap();
var dependencies = (world) => [
  world.worldPlanner,
  world.fixedReservations,
  world.worldgenTreeBodyFootprint,
  world.worldgenTreeFullFootprint,
  world.hydrologyGeology,
  world.proceduralRockEnvelope,
  world.generatedContent,
  world.proceduralTrees,
  world.terrainFunctions,
  world.proceduralTreeSeed,
  world.landmarks,
  world.landmarks?.length,
  world.fixedReservations?.length,
  world.terrainFunctions?.height,
  world.terrainFunctions?.hash,
  world.terrainFunctions?.climate,
  world.terrainFunctions?.slope
];
function activateFinalTreePlacement(world) {
  const waitingFor = [];
  for (const [name, value] of Object.entries({
    "generatedContent.planner": world.generatedContent?.planner === world.worldPlanner,
    "worldPlanner.queryChunk": world.worldPlanner?.queryChunk,
    fixedReservations: Array.isArray(world.fixedReservations),
    worldgenTreeBodyFootprint: world.worldgenTreeBodyFootprint,
    worldgenTreeFullFootprint: world.worldgenTreeFullFootprint,
    "hydrologyGeology.queryBounds": world.hydrologyGeology?.queryBounds,
    proceduralRockEnvelope: world.proceduralRockEnvelope,
    "proceduralTrees.family": world.proceduralTrees?.family,
    "terrainFunctions.climate": world.terrainFunctions?.climate,
    seed: Number.isInteger(world.proceduralTreeSeed)
  })) if (!value) waitingFor.push(name);
  if (waitingFor.length) throw new Error("Final tree placement is not ready: " + waitingFor.join(", "));
  const token = Object.freeze({ version: TREE_PLACEMENT_VERSION, seed: world.proceduralTreeSeed });
  authorities.set(world, { token, dependencies: dependencies(world) });
  return token;
}
function finalTreePlacementStatus(world) {
  const authority = authorities.get(world);
  if (!authority) return { ready: false, reason: "final-activation-not-complete" };
  const current = dependencies(world);
  if (authority.dependencies.some((value, i) => value !== current[i]))
    return { ready: false, reason: "authoritative-dependency-changed" };
  return { ready: true, token: authority.token };
}
function revokeFinalTreePlacement(world) {
  authorities.delete(world);
}

// ground-habitat.js
var clamp4 = (v) => Math.max(0, Math.min(1, v));
var smooth4 = (a, b, v) => {
  const t = clamp4((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
var mix3 = (a, b, t) => a + (b - a) * t;
var NODE_STEP = 4;
var MAX_NODES = 32768;
var NODE_WIDTH = 8;
var caches = /* @__PURE__ */ new WeakMap();
var nodeClimate = {};
var nodeCoast = {};
function cacheFor(functions) {
  let cache2 = caches.get(functions);
  if (!cache2) {
    cache2 = { nodes: /* @__PURE__ */ new Map(), hits: 0, misses: 0 };
    caches.set(functions, cache2);
  }
  return cache2;
}
function node(functions, cache2, ix, iz) {
  const key = (ix + 32768) * 65536 + (iz + 32768), old = cache2.nodes.get(key);
  if (old) {
    cache2.hits++;
    return old;
  }
  cache2.misses++;
  const x = ix * NODE_STEP, z = iz * NODE_STEP, { height: height2, noise: noise4 } = functions, h = height2(x, z);
  const west = height2(x - 6, z), east = height2(x + 6, z), north = height2(x, z - 6), south = height2(x, z + 6);
  const grade = Math.hypot((east - west) / 12, (south - north) / 12), ny = 1 / Math.sqrt(1 + grade * grade);
  const concavity = (west + east + north + south) * 0.25 - h;
  const shelter = clamp4(0.47 + 0.35 * Math.tanh(concavity / 1.25) - 0.15 * smooth4(0.28, 1.05, grade));
  const exposure = clamp4(0.78 - shelter + 0.22 * smooth4(0.35, 1.2, grade));
  const wx = x + (noise4(x * 0.031 + 21, z * 0.031 - 9) - 0.5) * 9, wz = z + (noise4(x * 0.031 - 13, z * 0.031 + 6) - 0.5) * 9;
  const shape = noise4(wx * 0.084 + 37, wz * 0.084 - 18) * 0.58 + noise4(wx * 0.036 - 7, wz * 0.036 + 28) * 0.3 + noise4(wx * 0.18 + 6, wz * 0.18 - 19) * 0.12;
  const climate3 = vegetationClimate(functions, x, z, h, nodeClimate), dry = climate3.ash, shore = functions.nearWater?.(x, z, 6);
  const environment = functions.environmentAt?.(x, z), water = environment && functions.waterAt?.(x, z, h);
  const shorelineWet = shore ? (1 - smooth4(0.05, 2.2, h - shore.level)) * (1 - smooth4(0, 6, shore.distance)) : 0;
  const wet = environment ? water ? 1 : shorelineWet : Math.max(1 - smooth4(0.7, 2.8, h), shore && shore.kind !== "river" ? shorelineWet : 0);
  const snow = climate3.snow * smooth4(0.48, 0.85, ny);
  const field = shape + (shelter - 0.45) * 0.27 - exposure * 0.035 + (environment?.riparian ? 0.04 : 0);
  const sward = smooth4(0.12, 0.62, climate3.meadow) * (1 - dry);
  const coast = functions.coastAt?.(x, z, nodeCoast), bare = coast ? coastBareOf(coast, h - (functions.seaLevel ?? 0.62)) : 0;
  const cover = mix3(smooth4(0.31 + dry * 0.13, 0.65 + dry * 0.105, field), smooth4(0.04, 0.3, field), sward) * (1 - wet) * (1 - snow) * (1 - climate3.swamp * 0.3) * (1 - bare);
  const result = [cover, shelter, exposure, wet, snow, dry, climate3.meadow, climate3.swamp];
  if (cache2.nodes.size >= MAX_NODES) cache2.nodes.delete(cache2.nodes.keys().next().value);
  cache2.nodes.set(key, result);
  return result;
}
function coarse(functions, x, z, out) {
  const cache2 = cacheFor(functions), gx = x / NODE_STEP, gz = z / NODE_STEP, ix = Math.floor(gx), iz = Math.floor(gz), tx = gx - ix, tz = gz - iz;
  const a = node(functions, cache2, ix, iz), b = node(functions, cache2, ix + 1, iz), c2 = node(functions, cache2, ix, iz + 1), d = node(functions, cache2, ix + 1, iz + 1);
  for (let i = 0; i < NODE_WIDTH; i++) out[i] = mix3(mix3(a[i], b[i], tx), mix3(c2[i], d[i], tx), tz);
  return out;
}
var work = new Float64Array(NODE_WIDTH);
function sampleHabitatTexel(functions, ix, iz) {
  const x = ix + 0.5, z = iz + 0.5;
  coarse(functions, x, z, work);
  return Math.round(clamp4(work[0]) * 255);
}
function fillHabitatBytes(functions, originX, originZ, width, height2, target, stride = width, offset = 0) {
  if (width <= 0 || height2 <= 0) return;
  const cache2 = cacheFor(functions), endX = originX + width, endZ = originZ + height2;
  for (let nz = Math.floor(originZ / NODE_STEP); nz <= Math.floor((endZ - 1) / NODE_STEP); nz++) for (let nx = Math.floor(originX / NODE_STEP); nx <= Math.floor((endX - 1) / NODE_STEP); nx++) {
    const a = node(functions, cache2, nx, nz)[0], b = node(functions, cache2, nx + 1, nz)[0], c2 = node(functions, cache2, nx, nz + 1)[0], d = node(functions, cache2, nx + 1, nz + 1)[0];
    const startX = Math.max(originX, nx * NODE_STEP), lastX = Math.min(endX, (nx + 1) * NODE_STEP), startZ = Math.max(originZ, nz * NODE_STEP), lastZ = Math.min(endZ, (nz + 1) * NODE_STEP);
    for (let z = startZ; z < lastZ; z++) for (let x = startX; x < lastX; x++) {
      const tx = (x + 0.5) / NODE_STEP - nx, tz = (z + 0.5) / NODE_STEP - nz, cover = mix3(mix3(a, b, tx), mix3(c2, d, tx), tz);
      target[offset + (z - originZ) * stride + x - originX] = Math.round(clamp4(cover) * 255);
    }
  }
}
function sampleHabitat(functions, x, z, out = {}) {
  const gx = x - 0.5, gz = z - 0.5, ix = Math.floor(gx), iz = Math.floor(gz), tx = gx - ix, tz = gz - iz;
  const cover = mix3(mix3(sampleHabitatTexel(functions, ix, iz), sampleHabitatTexel(functions, ix + 1, iz), tx), mix3(sampleHabitatTexel(functions, ix, iz + 1), sampleHabitatTexel(functions, ix + 1, iz + 1), tx), tz) / 255;
  coarse(functions, x, z, work);
  out.cover = cover;
  out.core = smooth4(0.55, 0.83, cover);
  out.edge = 4 * cover * (1 - cover);
  out.shelter = work[1];
  out.exposure = work[2];
  out.dry = work[5];
  out.route = 0;
  out.wet = work[3];
  out.snow = work[4];
  out.meadow = work[6];
  out.swamp = work[7];
  return out;
}
function createHabitatSampler(functions, minX, minZ, maxX, maxZ) {
  const texX = Math.floor(minX - 0.5), texZ = Math.floor(minZ - 0.5), texW = Math.floor(maxX - 0.5) - texX + 2, texH = Math.floor(maxZ - 0.5) - texZ + 2;
  const bytes = new Uint8Array(texW * texH);
  fillHabitatBytes(functions, texX, texZ, texW, texH, bytes);
  const nodeX = Math.floor(minX / NODE_STEP), nodeZ = Math.floor(minZ / NODE_STEP), nodeW = Math.floor(maxX / NODE_STEP) - nodeX + 2, nodeH = Math.floor(maxZ / NODE_STEP) - nodeZ + 2;
  const values = new Float64Array(nodeW * nodeH * NODE_WIDTH), cache2 = cacheFor(functions);
  for (let z = 0; z < nodeH; z++) for (let x = 0; x < nodeW; x++) values.set(node(functions, cache2, nodeX + x, nodeZ + z), (z * nodeW + x) * NODE_WIDTH);
  const properties = new Float64Array(NODE_WIDTH);
  return { bytes, byteOrigin: [texX, texZ], byteSize: [texW, texH], sample(x, z, out = {}) {
    if (x < minX || x > maxX || z < minZ || z > maxZ) return sampleHabitat(functions, x, z, out);
    const gx = x - 0.5, gz = z - 0.5, ix = Math.floor(gx), iz = Math.floor(gz), tx = gx - ix, tz = gz - iz, at = (iz - texZ) * texW + ix - texX;
    const cover = mix3(mix3(bytes[at], bytes[at + 1], tx), mix3(bytes[at + texW], bytes[at + texW + 1], tx), tz) / 255;
    const nx = x / NODE_STEP, nz = z / NODE_STEP, ni = Math.floor(nx), nj = Math.floor(nz), u = nx - ni, v = nz - nj, a = ((nj - nodeZ) * nodeW + ni - nodeX) * NODE_WIDTH, b = a + NODE_WIDTH, c2 = a + nodeW * NODE_WIDTH, d = c2 + NODE_WIDTH;
    for (let i = 1; i < NODE_WIDTH; i++) properties[i] = mix3(mix3(values[a + i], values[b + i], u), mix3(values[c2 + i], values[d + i], u), v);
    out.cover = cover;
    out.core = smooth4(0.55, 0.83, cover);
    out.edge = 4 * cover * (1 - cover);
    out.shelter = properties[1];
    out.exposure = properties[2];
    out.dry = properties[5];
    out.route = 0;
    out.wet = properties[3];
    out.snow = properties[4];
    out.meadow = properties[6];
    out.swamp = properties[7];
    return out;
  } };
}
function releaseHabitatCache(functions) {
  caches.delete(functions);
}

// shrub-profiles.js
function buildShrubVariants(sourceGeometry) {
  const pos = sourceGeometry.getAttribute("position");
  const normal = sourceGeometry.getAttribute("normal");
  const uv = sourceGeometry.getAttribute("uv");
  const index2 = sourceGeometry.getIndex();
  if (!pos || !normal || !uv || !index2 || pos.count !== 1677 || index2.count !== 6828) {
    throw new Error("Shrub profiles require the audited 1,677-vertex / 2,276-triangle shrub.glb.");
  }
  const point2 = (i) => new Vector3().fromBufferAttribute(pos, i);
  const parents = Array.from({ length: pos.count }, (_, i) => i);
  const find = (i) => {
    while (parents[i] !== i) {
      parents[i] = parents[parents[i]];
      i = parents[i];
    }
    return i;
  };
  const join = (a, b) => {
    parents[find(a)] = find(b);
  };
  for (let i = 0; i < index2.count; i += 3) {
    join(index2.getX(i), index2.getX(i + 1));
    join(index2.getX(i + 1), index2.getX(i + 2));
  }
  const groups = /* @__PURE__ */ new Map();
  for (let i = 0; i < pos.count; i++) {
    const key = find(i);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(i);
  }
  const components = [...groups.values()].sort((a, b) => a[0] - b[0]).map((vertices, id) => ({ id, vertices, triangles: [] }));
  const componentOf = new Uint16Array(pos.count);
  for (const c2 of components) for (const i of c2.vertices) componentOf[i] = c2.id;
  for (let i = 0; i < index2.count; i += 3) components[componentOf[index2.getX(i)]].triangles.push(i / 3);
  if (components.length !== 41 || components[0].vertices.length !== 65 || components[1].vertices.length !== 75) {
    throw new Error("Shrub topology changed; rerun its connected-component audit.");
  }
  const stems = components.filter((c2) => c2.vertices.every((i) => uv.getY(i) > 0.93)).map((c2) => {
    const sorted = [...c2.vertices].sort((a, b) => uv.getX(a) - uv.getX(b));
    const rings = [];
    for (const i of sorted) {
      const u = uv.getX(i), last = rings[rings.length - 1];
      if (!last || u - last.lastU > 1e-3) rings.push({ lastU: u, vertices: [i] });
      else {
        last.lastU = u;
        last.vertices.push(i);
      }
    }
    for (const r of rings) {
      const unique = new Map(r.vertices.map((i) => {
        const p = point2(i);
        return [p.toArray().join(","), p];
      }));
      r.center = [...unique.values()].reduce((p, q) => p.add(q), new Vector3()).multiplyScalar(1 / unique.size);
    }
    rings.sort((a, b) => a.center.y - b.center.y);
    return { ...c2, rings, root: rings[0].center, height: rings[rings.length - 1].center.y - rings[0].center.y };
  });
  if (stems.length !== 2 || stems[0].height < 0.34 || stems[1].height > 0.21) throw new Error("Shrub stem layout changed.");
  for (const c2 of components) {
    const stem = stems.find((s) => s.id === c2.id);
    if (stem) {
      c2.stem = stem;
      c2.isStem = true;
      continue;
    }
    let best = null;
    for (const s of stems) for (let j = 0; j < s.rings.length - 1; j++) {
      const a = s.rings[j].center, b = s.rings[j + 1].center, ab = b.clone().sub(a), lengthSq = ab.lengthSq();
      if (lengthSq < 1e-12) continue;
      for (const i of c2.vertices) {
        const p = point2(i), t = MathUtils.clamp(p.clone().sub(a).dot(ab) / lengthSq, 0, 1);
        const center = a.clone().addScaledVector(ab, t), gap = p.distanceToSquared(center);
        if (!best || gap < best.gap) best = { stem: s, gap, anchor: p, anchorIndex: i, tangent: ab.clone().normalize(), center };
      }
    }
    Object.assign(c2, best);
    if (Math.sqrt(c2.gap) > 2e-3) throw new Error("A shrub leaf no longer meets the audited stem.");
  }
  const omitMature = /* @__PURE__ */ new Set([3, 5, 7, 9, 11, 13, 18, 20, 25, 28, 30, 35, 38]);
  const keepSenescent = /* @__PURE__ */ new Set([0, 1, 4, 6, 10, 14, 16, 17, 19, 24, 27, 32, 33, 34, 37]);
  const profiles = {
    juvenile: {
      keep: (c2) => c2.stem.id === 1,
      // Entire naturally short branch: compressed internodes, full younger leaves.
      branch: [{}, { height: 0.74, width: 0.9, yaw: -0.08, bendX: 7e-3, bendZ: -3e-3 }],
      leafScale: 0.85,
      droop: -0.035
    },
    mature: {
      keep: (c2) => !omitMature.has(c2.id),
      branch: [
        { height: 0.96, width: 1, yaw: 0.06, bendX: -0.019, bendZ: 0.011 },
        { height: 1, width: 1, yaw: -0.08, bendX: -6e-3, bendZ: 4e-3 }
      ],
      leafScale: 1,
      droop: 0.015
    },
    senescent: {
      keep: (c2) => keepSenescent.has(c2.id),
      // Both intact stems, asymmetric crown, whole-leaf shedding and tip droop.
      branch: [
        { height: 0.86, width: 1, yaw: -0.15, bendX: 0.027, bendZ: 0.019 },
        { height: 0.9, width: 1, yaw: 0.22, bendX: -0.02, bendZ: -0.011 }
      ],
      leafScale: 0.92,
      droop: 0.23
    }
  };
  const up = new Vector3(0, 1, 0);
  const audit = { source: { vertices: pos.count, triangles: index2.count / 3, components: components.length }, variants: {} };
  const result = {};
  for (const [name, profile] of Object.entries(profiles)) {
    const selected = components.filter(profile.keep);
    const vertexMap = /* @__PURE__ */ new Map(), sourceVertices = [], sourceTriangles = [];
    for (const c2 of selected) for (const i of c2.vertices) {
      vertexMap.set(i, sourceVertices.length);
      sourceVertices.push(i);
    }
    for (const c2 of selected) sourceTriangles.push(...c2.triangles);
    const geometry = new BufferGeometry();
    for (const [attrName, attr] of Object.entries(sourceGeometry.attributes)) {
      if (attr.isInterleavedBufferAttribute) throw new Error("Deinterleave shrub attributes before building profiles.");
      const array = new attr.array.constructor(sourceVertices.length * attr.itemSize);
      for (let j = 0; j < sourceVertices.length; j++) for (let k = 0; k < attr.itemSize; k++) array[j * attr.itemSize + k] = attr.array[sourceVertices[j] * attr.itemSize + k];
      geometry.setAttribute(attrName, new BufferAttribute(array, attr.itemSize, attr.normalized));
    }
    const indices = [];
    for (const t of sourceTriangles) for (let k = 0; k < 3; k++) indices.push(vertexMap.get(index2.getX(t * 3 + k)));
    geometry.setIndex(indices);
    const outPosition = geometry.getAttribute("position"), outNormal = geometry.getAttribute("normal");
    let maximumAttachmentGap = 0;
    for (const c2 of selected) {
      const s = c2.stem, spec = profile.branch[s.id], qYaw = new Quaternion().setFromAxisAngle(up, spec.yaw);
      const mapPoint = (p) => {
        const q = p.clone().sub(s.root), t = MathUtils.clamp(q.y / s.height, 0, 1);
        q.set(q.x * spec.width + spec.bendX * t * t, q.y * spec.height, q.z * spec.width + spec.bendZ * t * t);
        return q.applyQuaternion(qYaw).add(s.root);
      };
      let rotation, mappedAnchor;
      if (!c2.isStem) {
        const before = c2.tangent.clone().applyQuaternion(qYaw);
        const after = mapPoint(c2.center.clone().addScaledVector(c2.tangent, 1e-4)).sub(mapPoint(c2.center)).normalize();
        rotation = new Quaternion().setFromUnitVectors(before, after).multiply(qYaw);
        mappedAnchor = mapPoint(c2.anchor);
        const far = c2.vertices.reduce((best, i) => point2(i).distanceToSquared(c2.anchor) > point2(best).distanceToSquared(c2.anchor) ? i : best, c2.vertices[0]);
        const radial = point2(far).sub(c2.anchor).applyQuaternion(rotation);
        radial.y = 0;
        if (radial.lengthSq() > 1e-9) {
          const axis = up.clone().cross(radial).normalize(), amount = profile.droop * (0.8 + 0.4 * (c2.id * 7 % 11 / 10));
          rotation.premultiply(new Quaternion().setFromAxisAngle(axis, amount));
        }
        maximumAttachmentGap = Math.max(maximumAttachmentGap, mappedAnchor.distanceTo(mapPoint(c2.center)));
      }
      for (const i of c2.vertices) {
        const p = point2(i), n = new Vector3().fromBufferAttribute(normal, i);
        let pOut;
        if (c2.isStem) {
          pOut = mapPoint(p);
          const t = MathUtils.clamp((p.y - s.root.y) / s.height, 0, 1);
          const kx = 2 * spec.bendX * t / s.height, kz = 2 * spec.bendZ * t / s.height;
          n.set(n.x / spec.width, (n.y - kx * n.x / spec.width - kz * n.z / spec.width) / spec.height, n.z / spec.width).applyQuaternion(qYaw).normalize();
        } else {
          pOut = p.sub(c2.anchor).multiplyScalar(profile.leafScale).applyQuaternion(rotation).add(mappedAnchor);
          n.applyQuaternion(rotation).normalize();
        }
        const target = vertexMap.get(i);
        outPosition.setXYZ(target, pOut.x, pOut.y, pOut.z);
        outNormal.setXYZ(target, n.x, n.y, n.z);
      }
    }
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    geometry.name = `shrub-${name}`;
    geometry.userData.shrubProfile = name;
    geometry.userData.sourceVertices = sourceVertices;
    geometry.userData.sourceTriangles = sourceTriangles;
    geometry.userData.sourceStemPivots = stems.filter((s) => selected.some((c2) => c2.id === s.id)).map((s) => s.root.toArray());
    const record = {
      vertices: outPosition.count,
      triangles: geometry.index.count / 3,
      components: selected.length,
      leaves: selected.filter((c2) => !c2.isStem).length,
      sourceComponentIds: selected.map((c2) => c2.id),
      boundsMin: geometry.boundingBox.min.toArray(),
      boundsMax: geometry.boundingBox.max.toArray(),
      dimensions: geometry.boundingBox.getSize(new Vector3()).toArray(),
      sourceStemPivots: geometry.userData.sourceStemPivots,
      maximumAttachmentGap,
      triangleFraction: geometry.index.count / index2.count
    };
    audit.variants[name] = record;
    result[name] = geometry;
  }
  result.audit = audit;
  return result;
}

// wetland-plant-context.js
var ORDINARY = Object.freeze({ marsh: false, featureId: null, swampRegionId: null, maxDepth: 0.08 });
var LEGACY_MARSH = Object.freeze({ marsh: true, featureId: null, swampRegionId: null, maxDepth: 0.3 });
function wetlandPlantContext(hydrology2, terrainFunctions, x, z, shore) {
  if (!shore?.featureId) return ORDINARY;
  if (shore.kind === "marsh") return LEGACY_MARSH;
  if (hydrology2?.generationMode !== "water-first" || shore.kind !== "pond" && shore.kind !== "lake") return ORDINARY;
  const coverage = hydrology2.geometry?.plan?.swampCoverage;
  if (!Array.isArray(coverage) || !coverage.some((c2) => c2.bodyId === shore.featureId) || typeof terrainFunctions?.environmentAt !== "function") return ORDINARY;
  const environment = terrainFunctions.environmentAt(x, z);
  if (environment?.wetland !== true || typeof environment.swampRegionId !== "string" || !coverage.some((c2) => c2.bodyId === shore.featureId && c2.wetlandId === environment.swampRegionId)) return ORDINARY;
  return Object.freeze({ marsh: true, featureId: shore.featureId, swampRegionId: environment.swampRegionId, maxDepth: 0.3 });
}

// meadow-layering.js
var MEADOW_BANK_LIMITS = Object.freeze({ cellSize: 4, density: 1.6, maxFraction: 0.24, maxCount: 1024 });
var clamp5 = (x) => Math.max(0, Math.min(1, x));
function bankMeadowBudget(count, step, budget) {
  const L = MEADOW_BANK_LIMITS;
  return Math.min(count, L.maxCount, Math.floor(budget * L.maxFraction), Math.round(count * step * step * L.density));
}
function meadowColony(functions, x, z) {
  return functions.noise(x * 0.16 + 219, z * 0.16 - 71) * 0.7 + functions.noise(x * 0.061 - 91, z * 0.061 + 183) * 0.3;
}
function* stratifyBankMeadowSteps(functions, candidates) {
  const cells = /* @__PURE__ */ new Map(), L = MEADOW_BANK_LIMITS;
  let work2 = 0;
  for (const p of candidates) {
    if (work2++ && work2 % 128 === 0) yield "meadow:layering";
    const ix = Math.floor(p.x / L.cellSize), iz = Math.floor(p.z / L.cellSize), key = ix + "," + iz;
    let cell = cells.get(key);
    if (!cell) {
      const colony = meadowColony(functions, (ix + 0.5) * L.cellSize, (iz + 0.5) * L.cellSize);
      cell = { points: [], weight: 0.18 + 1.82 * colony * colony };
      cells.set(key, cell);
    }
    p.localRank = -Math.log(Math.max(1e-6, functions.hash(p.gx + 1379, p.gz - 2191))) / (0.45 + 0.55 * p.cover);
    cell.points.push(p);
  }
  for (const cell of cells.values()) {
    yield "meadow:layering";
    cell.points.sort((a, b) => a.localRank - b.localRank || a.gz - b.gz || a.gx - b.gx);
    for (let i = 0; i < cell.points.length; i++) {
      if (i && i % 128 === 0) yield "meadow:layering";
      cell.points[i].rank = (i + 0.5) / (cell.points.length * cell.weight);
    }
  }
  return { cells: cells.size, candidateArea: candidates.length };
}
function matureMeadowForm(functions, p, j) {
  if (p.dry > 0.35 || p.meadow > 0.65 || p.cover < 0.1) return null;
  const colony = meadowColony(functions, p.x, p.z), threshold = p.bank ? 0.31 : p.swamp > 0.18 ? 0.43 : 0.47;
  if (colony < threshold || functions.hash(p.gx - 1781, p.gz + 1223) > 0.55) return null;
  const vigor = clamp5((colony - threshold) / (0.8 - threshold));
  return { profile: 3, width: 0.85 + 0.28 * j, vertical: 1.28 + 0.6 * vigor + 0.24 * j, phase: 0.5 + 0.499 * functions.hash(p.gx + 901, p.gz - 301) };
}
function matureMeadowSeat(height2, x, z, radius) {
  if (!Number.isFinite(radius) || radius > 2) return null;
  const y = height2(x, z), dx = (height2(x + 0.6, z) - height2(x - 0.6, z)) / 1.2, dz = (height2(x, z + 0.6) - height2(x, z - 0.6)) / 1.2;
  if (Math.hypot(dx, dz) > 0.42) return null;
  const step = 4 / 3, x0 = Math.floor((x - radius) / step), x1 = Math.ceil((x + radius) / step), z0 = Math.floor((z - radius) / step), z1 = Math.ceil((z + radius) / step);
  if ((x1 - x0 + 1) * (z1 - z0 + 1) > 36) return null;
  let min = 0, max = 0;
  for (let iz = z0; iz <= z1; iz++) for (let ix = x0; ix <= x1; ix++) {
    const px = ix * step, pz = iz * step, e = height2(px, pz) - y - dx * (px - x) - dz * (pz - z);
    if (!Number.isFinite(e) || Math.abs(e) > 0.045) return null;
    min = Math.min(min, e);
    max = Math.max(max, e);
  }
  return { y, dx, dz, sink: 4e-3 - min, error: max - min };
}

// habitat-vegetation.js
var smooth5 = MathUtils.smoothstep;
var clamp6 = MathUtils.clamp;
var TAU2 = Math.PI * 2;
var dummy = new Object3D();
var metaColor = new Color();
var matureUp = new Vector3(0, 1, 0);
var matureNormal = new Vector3();
var matureAlign = new Quaternion();
var tempHabitat = {};
var shoreContexts = /* @__PURE__ */ new WeakMap();
function drain(steps) {
  let step;
  do {
    step = steps.next();
  } while (!step.done);
  return step.value;
}
function* copyInstancesSteps(source, width, c2) {
  c2.reservePreparationBytes?.(source.byteLength);
  const copy = new source.constructor(source.length);
  for (let at = 0; at < source.length; at += 128 * width) {
    if (at) yield "habitat:copy";
    copy.set(source.subarray(at, at + 128 * width), at);
  }
  return copy;
}
function shorelineReservations(context) {
  let value = shoreContexts.get(context);
  if (!value) {
    value = { layers: { groundcover: context.layers.groundcover.filter((r) => !r.hydrology) } };
    shoreContexts.set(context, value);
  }
  return value;
}
function obstacles(world, c2) {
  return drain(obstaclesSteps(world, c2));
}
function* prepareHabitatObstaclesSteps(world, c2) {
  return yield* obstaclesSteps(world, c2);
}
function* obstaclesSteps(world, c2) {
  if (c2.habitatObstacles) return c2.habitatObstacles;
  const { height: height2, hash: hash4, slope: slope2 } = world.terrainFunctions, list = [], margin = 7;
  let work2 = 0;
  for (let cz = c2.cz - 1; cz <= c2.cz + 1; cz++) for (let cx = c2.cx - 1; cx <= c2.cx + 1; cx++) {
    const baseReservations = reservationContext(world, { cx, cz }), contentReservations = world.hydrologyGeology?.context(baseReservations, cx, cz) || baseReservations, rng2 = (i, n) => hash4(cx * 229 + cz * 733 + i * 13, n);
    let rockIndex = 0;
    for (let i = 0; i < 99; i++) {
      if (work2 && (work2 & 127) === 0) yield "habitat:obstacles";
      work2++;
      const x = cx * 64 + rng2(i, 9) * 64, z = cz * 64 + rng2(i, 10) * 64, y = height2(x, z);
      const rockWater = world.hydrology?.waterAt(x, z, y);
      if (!ordinaryRockWaterAllowed(rockWater, i) || !ordinaryRockCoastAllowed(world, x, z)) continue;
      if (i >= 19) {
        const f2 = world.terrainFunctions;
        if (typeof f2.riverBankRockAllowed === "function") {
          if (!f2.riverBankRockAllowed(x, z, y)) continue;
        } else if (typeof f2.projectChannel === "function") {
          const channel2 = f2.projectChannel(x, z, 30);
          if (!channel2 || !Number.isFinite(channel2.level) || !(y >= channel2.level - 0.3 && y <= channel2.level + 5.4 && slope2(x, z) >= 0.28) || f2.waterAt?.(x, z, y)) continue;
        } else continue;
      }
      if (Math.hypot(x + 4, z - 20) < 15 || world.landmarks.some((l) => Math.hypot(x - l.x, z - l.z) < l.clear * 0.6)) continue;
      const id = cx + "," + cz + ":rock:" + i;
      if (world.removed?.has(id)) continue;
      const r = i < 19 ? 0.45 + rng2(i, 11) * 2.9 : 0.6 + rng2(i, 11) * 1.8, legacySlot = rockWater?.kind === "ocean" ? 99 + i : rockIndex++, asset = world.nature[["rock-1", "rock-3", "rock-4"][legacySlot % 3]];
      const record = { x, y, z, r, id, ...i < 19 && rockWater ? { underwaterResource: true } : {} };
      if (!rockPlacementAllowed(world, contentReservations, record, legacySlot, cx, cz)) continue;
      if (x < c2.cx * 64 - margin || x > (c2.cx + 1) * 64 + margin || z < c2.cz * 64 - margin || z > (c2.cz + 1) * 64 + margin) continue;
      const generated = world.proceduralRockEnvelope?.(record);
      if (generated) {
        list.push(generated);
        continue;
      }
      const angle = rng2(i, 13) * TAU2;
      list.push({ x, z, rx: asset.size.x * r * 0.92 * 0.4 + 0.08, rz: asset.size.z * r * 0.92 * 0.4 + 0.08, cs: Math.cos(angle), sn: Math.sin(angle), id });
    }
    if (coastalBouldersPossible(world, cx, cz)) for (let j = 0; j < COAST_BOULDERS.count; j++) {
      const record = coastalBoulderCandidate(world, cx, cz, j, rng2, height2);
      if (!record || world.removed?.has(record.id) || !rockPlacementAllowed(world, contentReservations, record, COAST_BOULDERS.first + j, cx, cz)) continue;
      if (record.x < c2.cx * 64 - margin || record.x > (c2.cx + 1) * 64 + margin || record.z < c2.cz * 64 - margin || record.z > (c2.cz + 1) * 64 + margin) continue;
      const generated = world.proceduralRockEnvelope?.(record);
      if (generated) list.push(generated);
    }
  }
  work2 = 0;
  for (const r of world.hydrologyGeology?.queryBounds({ minX: c2.cx * 64 - margin, maxX: (c2.cx + 1) * 64 + margin, minZ: c2.cz * 64 - margin, maxZ: (c2.cz + 1) * 64 + margin }) || []) {
    if (work2 && (work2 & 127) === 0) yield "habitat:geology";
    work2++;
    if (!world.removed?.has(r.id)) list.push(r.hydroGeology.footprint);
  }
  work2 = 0;
  const cells = new Array(256), minX = c2.cx * 16, minZ = c2.cz * 16;
  for (const o of list) {
    const ex = Math.abs(o.rx * o.cs) + Math.abs(o.rz * o.sn) + 0.5, ez = Math.abs(o.rx * o.sn) + Math.abs(o.rz * o.cs) + 0.5;
    for (let z = Math.max(minZ, Math.floor((o.z - ez) / 4)); z <= Math.min(minZ + 15, Math.floor((o.z + ez) / 4)); z++) for (let x = Math.max(minX, Math.floor((o.x - ex) / 4)); x <= Math.min(minX + 15, Math.floor((o.x + ex) / 4)); x++) {
      if (work2 && (work2 & 127) === 0) yield "habitat:cells";
      work2++;
      const key = (z - minZ) * 16 + x - minX;
      (cells[key] ??= []).push(o);
    }
  }
  list.cells = cells;
  c2.habitatObstacles = list;
  return list;
}
function plantPositionAllowed(world, c2, x, z, margin = 0, shoreline = false, dryBankGrass = false) {
  const context = c2.plannedReservations || reservationContext(world, c2);
  if (!reservationAllows(shoreline ? shorelineReservations(context) : context, "groundcover", x, z, margin) && !(dryBankGrass && !shoreline && dryRiverBankGrassProof(world, context, x, z, margin))) return false;
  const surface = world.hydrology?.surfaceAt(x, z), water = surface ? world.hydrology.waterAt(x, z) : null;
  if (water && (!shoreline || water.depth > wetlandPlantContext(world.hydrology, world.terrainFunctions, x, z, water).maxDepth)) return false;
  for (const l of world.landmarks) {
    if (!l.clear) continue;
    const r = l.clear * (l.type === "boss" ? 0.34 : 0.4) + margin, dx = x - l.x, dz = z - l.z;
    if (Math.abs(dx) < r && Math.abs(dz) < r && Math.hypot(dx, dz) < r) return false;
  }
  const all = obstacles(world, c2), ix = Math.floor(x / 4) - c2.cx * 16, iz = Math.floor(z / 4) - c2.cz * 16, near = margin <= 0.35 && ix >= 0 && ix < 16 && iz >= 0 && iz < 16 ? all.cells[iz * 16 + ix] || [] : all;
  for (const o of near) {
    if (o.polygon) {
      if (rockEnvelopeContains(o, x, z, margin)) return false;
      continue;
    }
    const dx = x - o.x, dz = z - o.z;
    if (Math.abs(dx) > o.rx + o.rz + margin || Math.abs(dz) > o.rx + o.rz + margin) continue;
    const a = (dx * o.cs - dz * o.sn) / (o.rx + margin), b = (dx * o.sn + dz * o.cs) / (o.rz + margin);
    if (a * a + b * b < 1) return false;
  }
  return true;
}
function habitatAt(world, x, z, out = {}) {
  return sampleHabitat(world.terrainFunctions, x, z, out);
}
function meadowShader(material) {
  if (material.userData.habitatMeadow) return;
  material.userData.habitatMeadow = true;
  material.onBeforeCompile = (s) => {
    s.uniforms.uTime = { value: 0 };
    s.uniforms.meadowWind = meadowUniforms.meadowWind;
    s.uniforms.meadowTime = meadowUniforms.meadowTime;
    s.vertexShader = islandBiomeGLSL + "uniform vec4 meadowWind;uniform float meadowTime;\n" + MEADOW_GUST_GLSL + "\nuniform float uTime;varying float grassVariant;varying float grassSnow;\n" + s.vertexShader;
    s.vertexShader = s.vertexShader.replace("#include <color_vertex>", `#if defined(USE_COLOR_ALPHA)
   vColor=vec4(1.);
   #elif defined(USE_COLOR) || defined(USE_INSTANCING_COLOR)
   vColor=vec3(1.);
   #endif
   #ifdef USE_COLOR
   vColor*=color;
   #endif`);
    s.vertexShader = s.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>
   grassVariant=floor(instanceColor.r+.5);grassSnow=islandSnow(instanceMatrix[3].xyz);
   float young=1.-instanceColor.g;
   // The meadow's wind and gusts (meadow-field.js meadowSway), v88.
   mat4 cardToWorld=modelMatrix*instanceMatrix;vec2 cardSway=meadowSway(cardToWorld[3].xz,instanceColor.b*6.283185,1.8,meadowWind,meadowTime)*(.07*position.y*position.y);
   transformed+=inverse(mat3(cardToWorld))*vec3(cardSway.x,0.,cardSway.y);
   transformed.z+=sin(instanceColor.b*9.7)*young*.08*position.y;`);
    s.fragmentShader = "varying float grassVariant;varying float grassSnow;\n" + s.fragmentShader;
    s.fragmentShader = s.fragmentShader.replace("#include <map_fragment>", "vec2 atlasUv=vMapUv+vec2(mod(grassVariant,2.),floor(grassVariant/2.))*.5;vec4 sampledDiffuseColor=texture2D(map,atlasUv);diffuseColor*=sampledDiffuseColor;diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(1.15,.83,.55),grassSnow);");
    s.fragmentShader = s.fragmentShader.replace("#include <normal_fragment_begin>", "#include <normal_fragment_begin>\nnormal*=faceDirection;");
    s.fragmentShader = s.fragmentShader.replace("#include <lights_fragment_end>", "#include <lights_fragment_end>\nreflectedLight.indirectDiffuse+=diffuseColor.rgb*.19;");
    material.userData.shader = s;
  };
  material.customProgramCacheKey = () => "habitat-meadow-island-v88-wind";
  material.needsUpdate = true;
}
function chooseAtlas(h, meadow, r) {
  if (h.dry > 0.55) return h.core > 0.18 && h.shelter > 0.4 && r > 0.84 ? 3 : 1;
  if (h.core < 0.2) return r < 0.88 ? 2 : 3;
  if (meadow > 0.45) return h.shelter > 0.56 ? r < 0.7 ? 3 : r < 0.9 ? 2 : 0 : r < 0.4 ? 0 : r < 0.72 ? 3 : 2;
  return h.shelter > 0.48 ? r < 0.72 ? 3 : 2 : r < 0.88 ? 2 : 3;
}
function* selectBudgetSteps(candidates, budget, side, c2) {
  const count = Math.min(budget, candidates.length);
  if (!count) return [];
  const compare = (a, b) => a.rank - b.rank || a.gz - b.gz || a.gx - b.gx;
  let work2 = 0;
  if (count < candidates.length) {
    let left = 0, right = candidates.length - 1, target = count - 1;
    while (left < right) {
      const pivot = candidates[left + right >> 1];
      let i = left, j = right;
      while (i <= j) {
        while (compare(candidates[i], pivot) < 0) {
          i++;
          if ((++work2 & 127) === 0) yield "habitat:sort";
        }
        while (compare(candidates[j], pivot) > 0) {
          j--;
          if ((++work2 & 127) === 0) yield "habitat:sort";
        }
        if (i <= j) {
          const t = candidates[i];
          candidates[i] = candidates[j];
          candidates[j] = t;
          i++;
          j--;
        }
        if ((++work2 & 127) === 0) yield "habitat:sort";
      }
      if (target <= j) right = j;
      else if (target >= i) left = i;
      else break;
    }
  }
  const ordered = new Array(side * side);
  for (let i = 0; i < count; i++) {
    if (i && (i & 127) === 0) yield "habitat:order";
    const p = candidates[i];
    ordered[(p.gz - c2.cz * side) * side + p.gx - c2.cx * side] = p;
  }
  const selected = [];
  for (let i = 0; i < ordered.length; i++) {
    if (i && (i & 127) === 0) yield "habitat:select";
    if (ordered[i]) selected.push(ordered[i]);
  }
  return selected;
}
function* partitionSmallestSteps(list, lo, hi, target, compare) {
  let work2 = 0, left = lo, right = hi;
  while (left < right) {
    const pivot = list[left + right >> 1];
    let i = left, j = right;
    while (i <= j) {
      while (compare(list[i], pivot) < 0) {
        i++;
        if ((++work2 & 127) === 0) yield "habitat:sort";
      }
      while (compare(list[j], pivot) > 0) {
        j--;
        if ((++work2 & 127) === 0) yield "habitat:sort";
      }
      if (i <= j) {
        const t = list[i];
        list[i] = list[j];
        list[j] = t;
        i++;
        j--;
      }
      if ((++work2 & 127) === 0) yield "habitat:sort";
    }
    if (target <= j) right = j;
    else if (target >= i) left = i;
    else break;
  }
}
function* selectAdmittedSteps(candidates, budget, side, c2, admit) {
  const compare = (a, b) => a.rank - b.rank || a.gz - b.gz || a.gx - b.gx, chosen = [];
  let start = 0, work2 = 0;
  while (chosen.length < budget && start < candidates.length) {
    const need = budget - chosen.length, k = Math.min(candidates.length - start, Math.max(128, Math.ceil(need * 1.25)));
    if (start + k < candidates.length) yield* partitionSmallestSteps(candidates, start, candidates.length - 1, start + k - 1, compare);
    const batch = candidates.slice(start, start + k).sort(compare);
    for (let i = 0; i < batch.length && chosen.length < budget; i++) {
      if ((++work2 & 127) === 0) yield "habitat:admit";
      if (admit(batch[i])) chosen.push(batch[i]);
    }
    start += k;
  }
  const ordered = new Array(side * side);
  for (let i = 0; i < chosen.length; i++) {
    if (i && (i & 127) === 0) yield "habitat:order";
    const p = chosen[i];
    ordered[(p.gz - c2.cz * side) * side + p.gx - c2.cx * side] = p;
  }
  const selected = [];
  for (let i = 0; i < ordered.length; i++) {
    if (i && (i & 127) === 0) yield "habitat:select";
    if (ordered[i]) selected.push(ordered[i]);
  }
  return selected;
}
function riverBankPossible(world, c2) {
  const h = world.hydrology, L = DRY_BANK_PLANT_LIMITS;
  if (h?.generationMode !== "water-first" || !h.surfaceAt || !h.nearWater) return false;
  const query = h.geometry?.queryRiverSegments;
  if (typeof query !== "function") return true;
  const pad = L.shoreRange + L.radius + 1;
  return query({ minX: c2.cx * 64 - pad, maxX: (c2.cx + 1) * 64 + pad, minZ: c2.cz * 64 - pad, maxZ: (c2.cz + 1) * 64 + pad }).length > 0;
}
function* plantTerrainSteps(world, c2) {
  const STEP = 4 / 3, canonical = world.terrainFunctions.height, minX = c2.cx * 48 - 2, minZ = c2.cz * 48 - 2, side = 53;
  c2.reservePreparationBytes?.(side * side * 8);
  const values = new Float64Array(side * side);
  for (let z = 0; z < side; z++) for (let x = 0; x < side; x++) {
    const i = z * side + x;
    if (i && (i & 127) === 0) yield "habitat:terrain";
    values[i] = canonical((minX + x) * STEP, (minZ + z) * STEP);
  }
  const height2 = (x, z) => {
    const gx = x / STEP, gz = z / STEP, ix = Math.floor(gx), iz = Math.floor(gz), u = gx - ix, v = gz - iz, lx = ix - minX, lz = iz - minZ;
    if (lx < 0 || lz < 0 || lx >= side - 1 || lz >= side - 1) return canonical(x, z);
    const at = lz * side + lx, a = values[at], b = values[at + 1], c3 = values[at + side], d = values[at + side + 1];
    return u + v <= 1 ? a + (b - a) * u + (c3 - a) * v : d + (c3 - d) * (1 - u) + (b - d) * (1 - v);
  };
  return { height: height2, slope: (x, z) => Math.hypot(height2(x + 0.6, z) - height2(x - 0.6, z), height2(x, z + 0.6) - height2(x, z - 0.6)) / 1.2 };
}
function habitatMeadowPlanned(world, c2) {
  return habitatAt(world, c2.cx * 64 + 32, c2.cz * 64 + 32, tempHabitat).snow <= 0.6;
}
function* rebuildHabitatMeadowSteps(world, c2, mesh) {
  const original = mesh.userData.natureCount ?? mesh.count, local = () => planHabitatMeadowSteps(world, c2, original);
  const plan = world.chunkPlanner && c2.chunkPlan ? yield* world.chunkPlanner.take(c2, (r) => r.meadow?.count === original ? r.meadow.plan : void 0, local, { cancelIfLocal: true }) : yield* local();
  if (!plan) return false;
  return yield* installHabitatMeadowSteps(world, c2, mesh, plan);
}
function* planHabitatMeadowSteps(world, c2, original) {
  const { hash: hash4 } = world.terrainFunctions, { height: height2, slope: slope2 } = yield* plantTerrainSteps(world, c2);
  const mx = c2.cx * 64 + 32, mz = c2.cz * 64 + 32, climate3 = habitatAt(world, mx, mz, {}), meadow = climate3.meadow;
  if (climate3.snow > 0.6) return false;
  const quality = world.quality === "low" ? 0.28 : world.quality === "balanced" ? 0.55 : 1;
  const budget = Math.min(original, Math.round(original * (meadow > 0.8 ? 1 : climate3.dry > 0.45 ? 0.66 : 0.73)));
  const side = Math.ceil(Math.sqrt(26e3 * quality * (climate3.dry > 0.45 ? 1 : 2))), step = 64 / side;
  c2.reservePreparationBytes?.(side * side * 192 + 65536);
  const candidates = [], bankCandidates = [], sampler = createHabitatSampler(world.terrainFunctions, c2.cx * 64, c2.cz * 64, (c2.cx + 1) * 64, (c2.cz + 1) * 64);
  yield* obstaclesSteps(world, c2);
  const lazy = !riverBankPossible(world, c2);
  for (let iz = 0; iz < side; iz++) for (let ix = 0; ix < side; ix++) {
    const completed = iz * side + ix;
    if (completed && (completed & 127) === 0) yield "habitat:meadow-candidates";
    const gx = c2.cx * side + ix, gz = c2.cz * side + iz, x = (c2.cx * side + ix + 0.12 + hash4(gx + 181, gz - 337) * 0.76) * step, z = (c2.cz * side + iz + 0.12 + hash4(gx - 511, gz + 97) * 0.76) * step;
    const h = sampler.sample(x, z, tempHabitat);
    if (h.cover < 0.035 || h.snow > 0.65 || height2(x, z) < 0.8 || slope2(x, z) > 0.95) continue;
    const weight = Math.pow(h.cover, 2.3 + h.dry * 4) * (0.35 + 0.65 * h.shelter);
    if (weight < 1e-4) continue;
    const ordinary = lazy || plantPositionAllowed(world, c2, x, z, 0.04);
    if (!ordinary && !plantPositionAllowed(world, c2, x, z, 0.04, false, true)) continue;
    const rank2 = -Math.log(Math.max(1e-6, hash4(gx + 811, gz - 571))) / weight;
    (ordinary ? candidates : bankCandidates).push({ x, z, rank: rank2, cover: h.cover, core: h.core, shelter: h.shelter, dry: h.dry, edge: h.edge, meadow: h.meadow, swamp: h.swamp, bank: !ordinary, gx, gz });
  }
  c2.reservePreparationBytes?.(side * side * 16);
  const bankBudget = bankMeadowBudget(bankCandidates.length, step, budget), bankStrata = yield* stratifyBankMeadowSteps(world.terrainFunctions, bankCandidates);
  const selected = lazy ? yield* selectAdmittedSteps(candidates, budget - bankBudget, side, c2, (p) => plantPositionAllowed(world, c2, p.x, p.z, 0.04)) : yield* selectBudgetSteps(candidates, budget - bankBudget, side, c2);
  const primaryCount = selected.length, pendingBank = yield* selectBudgetSteps(bankCandidates, bankBudget, side, c2);
  selected.push(...pendingBank);
  const seatedBankIds = [];
  c2.reservePreparationBytes?.(selected.length * 19 * 4);
  const matrix2 = new Float32Array(selected.length * 16), colors = new Float32Array(selected.length * 3), variants = [0, 0, 0, 0], stats = { source: original, budget, count: selected.length, variants, meanCover: 0, coreCount: 0, edgeCount: 0, openCount: 0, bankBudget, bankCandidateArea: bankCandidates.length * step * step, bankStrata: bankStrata.cells, mature: 0, matureRejected: 0 };
  for (let i = 0; i < selected.length; i++) {
    if (i && (i & 127) === 0) yield "habitat:meadow-instances";
    const p = selected[i], r = hash4(p.gx + 74, p.gz - 16), j = hash4(p.gx + 42, p.gz + 19), age = clamp6(0.2 + 0.65 * p.core + 0.15 * j, 0, 1);
    let variant = chooseAtlas(p, p.meadow, r), phase = hash4(p.gx + 37, p.gz - 74);
    const low = variant === 1 || variant === 2, width = low ? 0.64 + 0.58 * j : 0.48 + 0.37 * j, vertical = variant === 0 ? 0.83 + 0.64 * j : variant === 1 ? 0.62 + 0.64 * j : variant === 2 ? 0.74 + 0.72 * j : 0.8 + 0.57 * j;
    const taper = 0.64 + 0.36 * smooth5(p.cover, 0.12, 0.63), spread = low ? 1.08 + 0.3 * p.edge : 1;
    const woodland = 1 - smooth5(p.meadow, 0.28, 0.62), stature = variant === 1 ? 1 : 1 - woodland * (variant === 2 ? 0.06 + 0.09 * (1 - p.core) : variant === 3 ? 0.02 + 0.07 * (1 - p.core) : 0.05 + 0.13 * (1 - p.core));
    const yaw = hash4(p.gx + 16, p.gz + 99) * TAU2;
    dummy.position.set(p.x, height2(p.x, p.z) - 2e-3, p.z);
    dummy.rotation.set(0, yaw, 0);
    dummy.scale.set(width * spread, vertical * taper * stature, width * (0.8 + 0.2 * hash4(p.gx - 56, p.gz + 44)) * spread);
    const form = matureMeadowForm(world.terrainFunctions, p, j);
    if (form) {
      const dx = (height2(p.x + 0.6, p.z) - height2(p.x - 0.6, p.z)) / 1.2, dz = (height2(p.x, p.z + 0.6) - height2(p.x, p.z - 0.6)) / 1.2;
      const radius = 0.77 * form.width + form.vertical * Math.hypot(dx, dz) + 0.035, seat = matureMeadowSeat(height2, p.x, p.z, radius);
      if (seat && plantPositionAllowed(world, c2, p.x, p.z, radius, false, p.bank)) {
        variant = form.profile;
        phase = form.phase;
        dummy.position.y = seat.y - seat.sink;
        dummy.scale.set(form.width, form.vertical, form.width * 0.92);
        matureNormal.set(-seat.dx, 1, -seat.dz).normalize();
        matureAlign.setFromUnitVectors(matureUp, matureNormal);
        dummy.quaternion.premultiply(matureAlign);
        stats.mature++;
        if (p.bank) seatedBankIds.push(i);
      } else stats.matureRejected++;
    }
    dummy.updateMatrix();
    matrix2.set(dummy.matrix.elements, i * 16);
    metaColor.setRGB(variant, age, phase);
    colors.set([variant, age, phase], i * 3);
    variants[variant]++;
    stats.meanCover += p.cover;
    stats.coreCount += p.core > 0.25;
    stats.edgeCount += p.core <= 0.25 && p.cover > 0.15;
    stats.openCount += p.cover <= 0.15;
  }
  stats.meanCover /= Math.max(1, selected.length);
  return { count: selected.length, matrix: matrix2, colors, seatedBankIds: Uint32Array.from(seatedBankIds), stats, primaryCount, budget, bankBudget };
}
function* installHabitatMeadowSteps(world, c2, mesh, plan) {
  const { matrix: matrix2, colors, stats } = plan;
  mesh.userData.riverBankPrimaryCount = plan.primaryCount;
  mesh.userData.riverBankFinalBudget = plan.budget;
  mesh.userData.riverBankAdmissionLimit = plan.bankBudget;
  mesh.userData.meadowLayered = true;
  const uploadMatrix = yield* copyInstancesSteps(matrix2, 16, c2), uploadColors = yield* copyInstancesSteps(colors, 3, c2);
  mesh.instanceMatrix = new InstancedBufferAttribute(uploadMatrix, 16);
  mesh.instanceColor = new InstancedBufferAttribute(uploadColors, 3);
  mesh.userData.riverBankSeatedIds = plan.seatedBankIds;
  mesh.count = plan.count;
  mesh.userData.natureCount = mesh.count;
  mesh.userData.originalMatrices = matrix2;
  mesh.userData.originalColors = colors;
  mesh.userData.habitatMeadow = true;
  mesh.userData.ecology = true;
  mesh.userData.habitatStats = stats;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  meadowShader(mesh.material);
  mesh.computeBoundingSphere();
  c2.ecologyCounts ??= {};
  c2.ecologyCounts.habitatMeadow = stats;
  return true;
}
function* replaceHabitatShrubsSteps(world, c2) {
  const source = world.nature?.shrub?.parts[0]?.geometry;
  if (!source) return;
  if (!world.habitatShrubProfiles || world.habitatShrubSource !== source) {
    const profiles2 = buildShrubVariants(source);
    for (const name of ["juvenile", "mature", "senescent"]) {
      const g = profiles2[name], roots = g.userData.sourceStemPivots, rx = roots.reduce((n, p) => n + p[0], 0) / roots.length, rz = roots.reduce((n, p) => n + p[2], 0) / roots.length;
      g.translate(-rx, 0, -rz);
      g.userData.sourceStemPivots = roots.map((p) => [p[0] - rx, p[1], p[2] - rz]);
      g.computeBoundingBox();
      g.computeBoundingSphere();
    }
    world.habitatShrubSource = source;
    world.habitatShrubProfiles = profiles2;
  }
  const { hash: hash4, height: height2 } = world.terrainFunctions, profiles = world.habitatShrubProfiles;
  for (const old of [...c2.group.children]) {
    if (old.userData.natureType !== "shrub" || old.userData.habitatProfile) continue;
    c2.reservePreparationBytes?.(old.userData.natureCount * 16);
    const src = old.userData.originalMatrices, colors = old.userData.originalColors, entries = old.userData.entries, groups = [[], [], []], names = ["juvenile", "mature", "senescent"];
    for (let i = 0; i < old.userData.natureCount; i++) {
      if (i && (i & 127) === 0) yield "habitat:shrub-candidates";
      const x = src[i * 16 + 12], z = src[i * 16 + 14], h = habitatAt(world, x, z, tempHabitat), r = hash4(x + 342, z - 637);
      const age = h.dry > 0.45 ? 2 : h.core < 0.42 || r < 0.32 ? 0 : r > 0.9 ? 2 : 1;
      groups[age].push(i);
    }
    for (let age = 0; age < 3; age++) {
      const list = groups[age];
      if (!list.length) continue;
      c2.reservePreparationBytes?.(list.length * 192);
      const geometry = profiles[names[age]], mesh = new InstancedMesh(geometry, old.material, list.length), matrices = new Float32Array(list.length * 16), nextColors = colors ? new Float32Array(list.length * 3) : null, lodIndices = new Uint32Array(list.length), nextEntries = [];
      if (c2.preparing) (c2.preparationOwnedMeshes ??= /* @__PURE__ */ new Set()).add(mesh);
      const rootY = geometry.userData.sourceStemPivots.reduce((n, p) => n + p[1], 0) / geometry.userData.sourceStemPivots.length;
      for (let j = 0; j < list.length; j++) {
        if (j && (j & 127) === 0) yield "habitat:shrub-instances";
        const i = list[j];
        const m = src.slice(i * 16, i * 16 + 16), x = m[12], z = m[14], sy = Math.hypot(m[4], m[5], m[6]);
        m[13] = height2(x, z) - rootY * sy - 2e-3;
        matrices.set(m, j * 16);
        dummy.matrix.fromArray(m);
        mesh.setMatrixAt(j, dummy.matrix);
        if (colors) {
          nextColors.set(colors.subarray(i * 3, i * 3 + 3), j * 3);
          metaColor.fromArray(colors, i * 3);
          mesh.setColorAt(j, metaColor);
        }
        lodIndices[j] = old.userData.courtLodIndices?.[i] ?? i;
        if (entries) {
          const entry = entries[i];
          entry.ref.mesh = mesh;
          entry.ref.index = j;
          nextEntries.push(entry);
        }
      }
      mesh.name = "habitat-shrub-" + names[age];
      mesh.castShadow = old.castShadow;
      mesh.receiveShadow = old.receiveShadow;
      mesh.userData = { natureType: "shrub", natureCount: list.length, originalMatrices: matrices, originalColors: nextColors, courtLodIndices: lodIndices, habitatProfile: names[age], ecology: true };
      if (entries) mesh.userData.entries = nextEntries;
      mesh.computeBoundingSphere();
      c2.group.add(mesh);
    }
    c2.preparationOwnedMeshes?.delete(old);
    c2.group.remove(old);
    old.dispose();
    c2.ecologyCounts ??= {};
    c2.ecologyCounts.shrubProfiles = groups.map((a) => a.length);
  }
}

// meadow-count.js
var climateScratch = {};
function landmarksNear(world, x0, z0, k) {
  return world.landmarks.filter((l) => {
    const r = l.clear * k;
    if (!(r > 0)) return false;
    const dx = Math.max(x0 - l.x, 0, l.x - (x0 + 64)), dz = Math.max(z0 - l.z, 0, l.z - (z0 + 64));
    return Math.hypot(dx, dz) < r + 1e-6;
  });
}
function meadowDensity(quality) {
  return quality === "low" ? 0.28 : quality === "balanced" ? 0.55 : 1;
}
function meadowCountMax(functions, c2, quality) {
  const cap = vegetationChunkCover(functions, c2.cx, c2.cz);
  return { cap, max: Math.floor(26e3 * cap * meadowDensity(quality)) };
}
function* meadowCountSteps(world, c2, max, cap) {
  const { height: height2, noise: noise4, slope: slope2, hash: hash4 } = world.terrainFunctions, rng2 = (i, n) => hash4(c2.cx * 229 + c2.cz * 733 + i * 13, n), near28 = landmarksNear(world, c2.cx * 64, c2.cz * 64, 0.28);
  let count = 0;
  for (let i = 0; i < max; i++) {
    if (i && i % 128 === 0) yield "nature:meadow-count";
    const x = c2.cx * 64 + rng2(i, 330) * 64, z = c2.cz * 64 + rng2(i, 331) * 64, patch = noise4(x * 0.14 + 4, z * 0.14);
    if (patch < 0.34 || near28.some((l) => Math.hypot(x - l.x, z - l.z) < l.clear * 0.28)) continue;
    const y = height2(x, z);
    if (y < 0.8) continue;
    const local = vegetationClimate(world.terrainFunctions, x, z, y, climateScratch);
    if (rng2(i, 335) > vegetationCover(local) / cap || patch < 0.34 + local.dry * 0.22 || slope2(x, z) > 0.95) continue;
    if (world.hydrology?.waterAt(x, z, y)) continue;
    count++;
  }
  return count;
}

// plant-plans.js
var TAU3 = Math.PI * 2;
var smooth6 = MathUtils.smoothstep;
var clamp7 = MathUtils.clamp;
var grassClimateScratch = {};
var fernClimateScratch = {};
var climate = (world, x, z, y) => vegetationClimate(world.terrainFunctions, x, z, y, grassClimateScratch);
var localClimate = (world, x, z, y) => vegetationClimate(world.terrainFunctions, x, z, y, fernClimateScratch);
function outsideRoute(world, x, z, margin = 0) {
  return !world.landmarks.some((l) => l.clear && Math.hypot(x - l.x, z - l.z) < l.clear * (l.type === "boss" ? 0.34 : 0.4) + margin);
}
function rngFor(world, c2) {
  return (i, s) => world.terrainFunctions.hash(c2.cx * 229 + c2.cz * 733 + i * 13, s);
}
function* grassPlacementsSteps(world, c2, density) {
  const { height: height2, noise: noise4, hash: hash4, slope: slope2 } = world.terrainFunctions, x0 = c2.cx * 64, z0 = c2.cz * 64, rng2 = (i, n) => hash4(c2.cx * 229 + c2.cz * 733 + i * 13, n);
  const grass = [], tall = [], cap = vegetationChunkCover(world.terrainFunctions, c2.cx, c2.cz), max = 4400 * cap, near38 = landmarksNear(world, x0, z0, 0.38);
  for (let i = 0; i < max * density; i++) {
    if (i && i % 32 === 0) yield "nature:grass-candidates";
    let x = x0 + rng2(i, 201) * 64, z = z0 + rng2(i, 202) * 64, y = height2(x, z), local = climate(world, x, z, y);
    if (local.winter > 0.75 || slope2(x, z) > 0.9 || rng2(i, 207) > vegetationCover(local) / cap || y < 0.8 || world.hydrology?.waterAt(x, z, y) || near38.some((l) => Math.hypot(x - l.x, z - l.z) < l.clear * 0.38)) continue;
    const patch = noise4(x * 0.13 + 2, z * 0.13), scale = 1.2 + rng2(i, 205) * 1.3;
    if (patch < 0.37) continue;
    const p = { x, y: y - 0.025, z, scale: scale * (1 + local.meadow * 0.35), rot: rng2(i, 206) * Math.PI * 2, color: local.dry > 0.5 ? 13022867 : 16777215 };
    (i % 4 === 0 ? grass : tall).push(p);
  }
  return { grass: grass.filter((p, i) => i % 5 === 0), tall: tall.filter((p, i) => i % 5 === 0) };
}
function fernCandidates(world, c2) {
  const b = world.terrainFunctions.biome(c2.cx * 64 + 32, c2.cz * 64 + 32);
  return b.id === 0 ? 1300 : b.id === 4 ? 650 : b.id === 1 ? 110 : 0;
}
function* fernPlacementsSteps(world, c2) {
  const { height: height2, noise: noise4, slope: slope2, biome: biome2 } = world.terrainFunctions, rng2 = rngFor(world, c2), b = biome2(c2.cx * 64 + 32, c2.cz * 64 + 32), placements = [[], [], []];
  const candidates = fernCandidates(world, c2);
  c2.reservePreparationBytes?.(candidates * 144);
  yield* prepareHabitatObstaclesSteps(world, c2);
  for (let i = 0; i < candidates; i++) {
    if (i && i % 64 === 0) yield "ecology:fern-candidates";
    const x = c2.cx * 64 + rng2(i, 65) * 64, z = c2.cz * 64 + rng2(i, 66) * 64, y = height2(x, z), h = habitatAt(world, x, z), field = h.cover, local = localClimate(world, x, z, y), dry = local.ash, winter = local.snow;
    const arena = world.landmarks.some((l) => l.type === "boss" && Math.hypot(x - l.x, z - l.z) < l.clear * 0.67);
    const seedling = arena && rng2(i, 765) < 0.075;
    if (y < 1.2 || world.hydrology?.waterAt(x, z, y) || slope2(x, z) > 0.85 || winter > 0.65 || dry > 0.78 || !outsideRoute(world, x, z, 0.32) && !seedling) continue;
    let rootPocket = 0;
    for (const tree of c2.trees) {
      const radius = clamp7(tree.h * 0.12, 1.4, 3.2) + 1;
      rootPocket = Math.max(rootPocket, 1 - smooth6(Math.hypot(x - tree.x, z - tree.z), 0.6, radius));
    }
    const core = Math.max(h.core, rootPocket * 0.9);
    if (!plantPositionAllowed(world, c2, x, z, 0.1)) continue;
    if (rng2(i, 761) > 0.14 + 0.72 * Math.max(field, rootPocket * 0.8)) continue;
    const ageChoice = rng2(i, 762), age = seedling || core < 0.18 ? 0 : ageChoice < 0.16 ? 0 : ageChoice < 0.76 + 0.14 * h.shelter ? 1 : 2;
    const size = seedling ? 0.34 + rng2(i, 763) * 0.2 : age === 0 ? 0.52 + rng2(i, 763) * 0.48 : age === 1 ? 0.78 + rng2(i, 763) * 0.78 + 0.48 * core : 0.75 + rng2(i, 763) * 0.67;
    placements[age].push({ x, y: y - 0.018, z, size, ratio: 0.72 + rng2(i, 764) * 0.35, rot: rng2(i, 68) * TAU3, lean: (rng2(i, 69) - 0.5) * 0.12, color: age === 2 ? 15063991 : age === 0 ? 15594715 : 16777205 });
  }
  if (candidates > 200) for (let i = 0; i < c2.rocks.length; i++) {
    if (i && i % 16 === 0) yield "ecology:rock-ferns";
    const rock = c2.rocks[i];
    if (!(rock.r > 0.55)) continue;
    const n = 2 + Math.floor(Math.min(3.35, rock.r) * 2.2);
    for (let k = 0; k < n; k++) {
      const j = i * 31 + k, a = rng2(j, 780) * TAU3, d = rock.r * (0.9 + rng2(j, 781) * 0.45) + 0.25, x = rock.x + Math.cos(a) * d, z = rock.z + Math.sin(a) * d, y = height2(x, z);
      const local = localClimate(world, x, z, y);
      if (local.ash > 0.6 || local.snow > 0.5 || y < 1.2 || world.hydrology?.waterAt(x, z, y) || slope2(x, z) > 0.85) continue;
      if (rng2(j, 782) > 0.82 * (1 - local.ash) || !plantPositionAllowed(world, c2, x, z, 0.08)) continue;
      placements[1].push({ x, y: y - 0.018, z, size: 0.62 + rng2(j, 783) * 0.62, ratio: 0.72 + rng2(j, 784) * 0.3, rot: rng2(j, 785) * TAU3, lean: (rng2(j, 786) - 0.5) * 0.18, color: 16777205 });
    }
  }
  if (candidates > 200) {
    for (let i = 0; i < c2.trees.length; i++) {
      if (i && i % 32 === 0) yield "ecology:trunk-ferns";
      const tree = c2.trees[i];
      if (world.removed?.has(tree.id) || !(tree.h > 7) || rng2(i, 800) > 0.5) continue;
      const trunk = 0.022 * tree.h * (tree.width ?? 1), n = 1 + Math.floor(rng2(i, 801) * 2.6);
      for (let k = 0; k < n; k++) {
        const j = i * 7 + k, a = rng2(j, 802) * TAU3, d = trunk + 0.3 + rng2(j, 803) * 0.55, x = tree.x + Math.cos(a) * d, z = tree.z + Math.sin(a) * d, y = height2(x, z);
        const local = localClimate(world, x, z, y);
        if (local.ash > 0.5 || local.snow > 0.45 || y < 1.2 || world.hydrology?.waterAt(x, z, y) || slope2(x, z) > 0.85 || !plantPositionAllowed(world, c2, x, z, 0.06)) continue;
        placements[rng2(j, 804) < 0.35 ? 0 : 1].push({ x, y: y - 0.018, z, size: 0.6 + rng2(j, 805) * 0.5, ratio: 0.8 + rng2(j, 806) * 0.3, rot: Math.atan2(Math.sin(a), Math.cos(a)) + (rng2(j, 807) - 0.5) * 1.2, lean: (rng2(j, 808) - 0.5) * 0.2, color: 16514542 });
      }
    }
    const stands = Math.round(candidates / 220);
    for (let s = 0; s < stands; s++) {
      if (s && s % 8 === 0) yield "ecology:tall-ferns";
      const sx = c2.cx * 64 + rng2(s, 790) * 64, sz = c2.cz * 64 + rng2(s, 791) * 64, sy = height2(sx, sz), local = localClimate(world, sx, sz, sy);
      if (sy < 1.2 || local.ash > 0.35 || local.snow > 0.3 || (local.treeDensity ?? 0) < 0.42 && local.swamp < 0.4) continue;
      const n = 3 + Math.floor(rng2(s, 792) * 6);
      for (let k = 0; k < n; k++) {
        const j = s * 17 + k, a = rng2(j, 793) * TAU3, d = Math.sqrt(rng2(j, 794)) * 2.8, x = sx + Math.cos(a) * d, z = sz + Math.sin(a) * d, y = height2(x, z);
        if (y < 1.2 || world.hydrology?.waterAt(x, z, y) || slope2(x, z) > 0.7 || !plantPositionAllowed(world, c2, x, z, 0.12)) continue;
        let trunk = false;
        for (const tree of c2.trees) if (Math.hypot(x - tree.x, z - tree.z) < 0.45 + tree.h * 0.024) {
          trunk = true;
          break;
        }
        if (trunk) continue;
        placements[1].push({ x, y: y - 0.02, z, size: 1.85 + rng2(j, 795) * 0.75, ratio: 1.05 + rng2(j, 796) * 0.3, rot: rng2(j, 797) * TAU3, lean: (rng2(j, 798) - 0.5) * 0.1, color: 15923938 });
      }
    }
  }
  return placements;
}

// river-bank-ecology.js
var RIVER_MARGIN_LIMITS = Object.freeze({ grid: 4, candidates: 64, rootRadius: 0.22, maxSupportError: 0.055, maxGrade: 0.42, minWaterClearance: 0.28 });
var RIVER_REED_LIMITS = Object.freeze({ colonies: 24, stems: [6, 10], spread: 1.25, rise: [-0.22, 0.42], maxDepth: 0.22, maxGrade: 0.38, height: [1.15, 1.7] });
var smooth7 = (a, b, v) => {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
function planRiverMarginPlants({ hydrology: hydrology2, terrainFunctions: f2, chunk, allowed = () => true, seed = hydrology2?.seed ?? 728194 }) {
  if (hydrology2?.generationMode !== "water-first") return [];
  const x0 = chunk.cx * 64, z0 = chunk.cz * 64, features = hydrology2.queryBounds({ minX: x0 - 22, maxX: x0 + 86, minZ: z0 - 22, maxZ: z0 + 86 });
  if (!features.some((feature) => feature.kind === "stream")) return [];
  const hash4 = (id, slot) => stableHash(seed, "river-margin-v59", id, slot), candidates = [], reedSites = [];
  for (let gz = chunk.cz * 16; gz < (chunk.cz + 1) * 16; gz++) for (let gx = chunk.cx * 16; gx < (chunk.cx + 1) * 16; gx++) {
    const id = gx + "," + gz, x = (gx + 0.15 + hash4(id, "x") * 0.7) * 4, z = (gz + 0.15 + hash4(id, "z") * 0.7) * 4;
    const shore = hydrology2.nearWater(x, z, 20);
    if (shore?.kind !== "stream") continue;
    const y = f2.height(x, z), cover = riverBankVegetationAt(seed, x, y, z, shore, hydrology2);
    const rise = y - shore.level;
    if (rise > RIVER_REED_LIMITS.rise[0] && rise < RIVER_REED_LIMITS.rise[1] + 0.2 && shore.distance < 2.6 && hash4(Math.floor(gx / 3) + "," + Math.floor(gz / 3), "reed-colony") < 0.6 && hash4(id, "reed") < 0.6 * (1 - smooth7(0.5, 0.78, riverBankDepositAt(hydrology2, x, z, seed)))) reedSites.push({ id, x, z, featureId: shore.featureId, rank: hash4(id, "reed-rank") });
    if (cover < 0.16 || hash4(id, "colony") > cover * 0.85 || hydrology2.waterAt(x, z, y)) continue;
    const climate3 = f2.climate?.(x, z, y);
    if (climate3 && (climate3.ash > 0.45 || climate3.snow > 0.2)) continue;
    for (let i = 0; i < 3; i++) candidates.push({
      id: "river-margin:" + id + ":" + i,
      featureId: shore.featureId,
      kind: "reed",
      riverMargin: true,
      marsh: false,
      winter: false,
      x: x + (hash4(id + "/" + i, "dx") - 0.5) * 1.4,
      z: z + (hash4(id + "/" + i, "dz") - 0.5) * 1.4,
      scale: 0.7 + hash4(id + "/" + i, "spread") * 0.35,
      scaleY: 0.2 + hash4(id + "/" + i, "height") * 0.24,
      yaw: hash4(id + "/" + i, "yaw") * Math.PI * 2,
      rank: hash4(id, "priority") + i * 1e-6
    });
  }
  candidates.sort((a, b) => a.rank - b.rank || a.id.localeCompare(b.id));
  const records = [], r = RIVER_MARGIN_LIMITS.rootRadius;
  reedSites.sort((a, b) => a.rank - b.rank || a.id.localeCompare(b.id));
  for (const site of reedSites.slice(0, RIVER_REED_LIMITS.colonies)) {
    const [low, high] = RIVER_REED_LIMITS.stems, count = low + Math.floor(hash4(site.id, "reed-count") * (high - low + 1));
    for (let i = 0; i < count; i++) {
      const key = site.id + "/" + i, a = hash4(key, "reed-angle") * Math.PI * 2, d = Math.sqrt(hash4(key, "reed-offset")) * RIVER_REED_LIMITS.spread, px = site.x + Math.cos(a) * d, pz = site.z + Math.sin(a) * d;
      const py = f2.height(px, pz), s = hydrology2.nearWater(px, pz, 8);
      if (s?.featureId !== site.featureId || !Number.isFinite(s.level)) continue;
      const rise = py - s.level, water = hydrology2.waterAt(px, pz, py);
      if (rise < RIVER_REED_LIMITS.rise[0] || rise > RIVER_REED_LIMITS.rise[1] || water && water.depth > RIVER_REED_LIMITS.maxDepth) continue;
      const gx = (f2.height(px + 0.2, pz) - f2.height(px - 0.2, pz)) / 0.4, gz = (f2.height(px, pz + 0.2) - f2.height(px, pz - 0.2)) / 0.4;
      if (Math.hypot(gx, gz) > RIVER_REED_LIMITS.maxGrade || !allowed(px, pz, 0.12)) continue;
      const climate3 = f2.climate?.(px, pz, py);
      if (climate3 && (climate3.ash > 0.45 || climate3.snow > 0.2)) continue;
      const [h0, h1] = RIVER_REED_LIMITS.height;
      records.push(Object.freeze({
        id: "river-reed:" + key,
        featureId: site.featureId,
        kind: "reed",
        riverMargin: true,
        tall: true,
        marsh: false,
        winter: false,
        x: px,
        y: py - 0.04,
        z: pz,
        scale: 0.85 + hash4(key, "reed-width") * 0.3,
        scaleY: h0 + hash4(key, "reed-height") * (h1 - h0),
        yaw: hash4(key, "reed-yaw") * Math.PI * 2,
        rank: site.rank - 1 + i * 1e-6,
        ground: py,
        rootClearance: rise
      }));
    }
  }
  for (const c2 of candidates.slice(0, RIVER_MARGIN_LIMITS.candidates)) {
    const y = f2.height(c2.x, c2.z), shore = hydrology2.nearWater(c2.x, c2.z, 22);
    if (shore?.kind !== "stream" || shore.featureId !== c2.featureId || riverBankVegetationAt(seed, c2.x, y, c2.z, shore, hydrology2) < 0.13 || hydrology2.waterAt(c2.x, c2.z, y) || !allowed(c2.x, c2.z, 0.35)) continue;
    let good = true;
    const heights = [];
    for (const [dx, dz] of [[r, 0], [-r, 0], [0, r], [0, -r]]) {
      const x = c2.x + dx, z = c2.z + dz, h = f2.height(x, z), s = hydrology2.nearWater(x, z, 22);
      heights.push(h);
      if (s?.featureId !== c2.featureId || h - s.level < RIVER_MARGIN_LIMITS.minWaterClearance || hydrology2.waterAt(x, z, h) || !allowed(x, z, 0.12)) {
        good = false;
        break;
      }
    }
    if (!good) continue;
    const gx = (heights[0] - heights[1]) / (2 * r), gz = (heights[2] - heights[3]) / (2 * r);
    if (Math.hypot(gx, gz) > RIVER_MARGIN_LIMITS.maxGrade || Math.max(Math.abs((heights[0] + heights[1]) * 0.5 - y), Math.abs((heights[2] + heights[3]) * 0.5 - y)) > RIVER_MARGIN_LIMITS.maxSupportError) continue;
    const error = Math.max(Math.abs((heights[0] + heights[1]) * 0.5 - y), Math.abs((heights[2] + heights[3]) * 0.5 - y)), inv = 1 / Math.hypot(gx, 1, gz);
    records.push(Object.freeze({ ...c2, y: y - 0.025 - error, ground: y, rootClearance: y - shore.level, bankNormal: Object.freeze({ x: -gx * inv, y: inv, z: -gz * inv }) }));
  }
  return records;
}

// marsh-riparian-model.js
var MARSH_PATCH_LIMITS = Object.freeze({ triangles: 254, radius: 0.78, rootRadius: 0.34, maxSlope: 0.58, maxSupportError: 0.045 });
var MARSH_ROOTS = Object.freeze([[-0.16, -0.08], [0.12, 0.04], [0.21, -0.15], [-0.11, 0.17], [-0.29, 0.11], [0.06, -0.27]].map(Object.freeze));
var TAU4 = Math.PI * 2;
var linear = (v) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
var color = (hex) => [(hex >> 16 & 255) / 255, (hex >> 8 & 255) / 255, (hex & 255) / 255].map(linear);
var green = color(12701330);
var young = color(13161627);
var straw = color(12889475);
var culm = color(12240265);
var head = color(9010019);
function buildMarshRiparianModel() {
  const positions = [], normals = [], colors = [], roots = [], parts = [];
  function triangle2(a, b, c2, rgb, root) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c2[0] - a[0], vy = c2[1] - a[1], vz = c2[2] - a[2], nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, length = Math.hypot(nx, ny, nz);
    if (length < 1e-10) throw new RangeError("Degenerate marsh blade");
    for (const p of [a, b, c2]) {
      positions.push(...p);
      normals.push(nx / length, ny / length, nz / length);
      colors.push(...rgb);
      roots.push(root[0], root[1]);
    }
  }
  function ribbon(root, angle, length, rise, width, droop, segments, rgb, role, supportRoot = root) {
    const start = positions.length / 9, cs = Math.cos(angle), sn = Math.sin(angle);
    const at = (j, side) => {
      const t = j / segments, reach = length * (0.35 * t + 0.65 * t * t), w = width * (0.25 + 0.85 * Math.sin(Math.PI * t)) * (1 - 0.98 * t), fold = side * 0.18 * width * Math.sin(Math.PI * t);
      return [root[0] + cs * reach - sn * side * w, root[2] + rise * (t - droop * t * t) + fold, root[1] + sn * reach + cs * side * w];
    };
    for (let j = 0; j < segments; j++) {
      const a = at(j, -1), b = at(j, 1), c2 = at(j + 1, -1), d = at(j + 1, 1);
      triangle2(a, c2, b, rgb, supportRoot);
      triangle2(b, c2, d, rgb, supportRoot);
    }
    parts.push({ role, root: [root[0], root[1]], triangles: positions.length / 9 - start });
  }
  const colonies = MARSH_ROOTS;
  for (let c2 = 0; c2 < colonies.length; c2++) for (let leaf = 0; leaf < 4; leaf++) {
    const root = [...colonies[c2], 8e-3], angle = c2 * 2.399 + leaf * 0.63 + (leaf % 2 ? Math.PI : 0), length = 0.22 + 0.055 * ((c2 + leaf * 2) % 4), rise = 0.32 + 0.065 * ((c2 * 3 + leaf) % 5), droop = 0.4 + 0.11 * (leaf % 3);
    ribbon(root, angle, length, rise, 0.014 + 4e-3 * (leaf % 3), droop, 3, leaf === 3 ? young : green, "sedge");
  }
  for (let i = 0; i < 4; i++) ribbon([colonies[i + 1][0], colonies[i + 1][1], 0.012], i * 2.21 + 0.6, 0.31 + i * 0.037, 0.043, 0.01 + i * 1e-3, 0.88, 4, straw, "litter");
  for (let n = 0; n < 3; n++) {
    const root = colonies[n], h = [0.82, 1.22, 0.97][n], lean = 0.08 + n * 0.017, a = 0.6 + n * 2.27, cs = Math.cos(a), sn = Math.sin(a), base = positions.length / 9;
    const at = (s, k, extra = 0, radius = 9e-3) => {
      const t2 = s / 3, q = k * TAU4 / 3, r = radius * (1 - 0.65 * t2);
      return [root[0] + cs * lean * t2 * t2 + Math.cos(q) * r, h * t2 + extra, root[1] + sn * lean * t2 * t2 + Math.sin(q) * r];
    };
    for (let s = 0; s < 3; s++) for (let k = 0; k < 3; k++) {
      const aa = at(s, k), b = at(s, k + 1), c2 = at(s + 1, k), d = at(s + 1, k + 1);
      triangle2(aa, c2, b, culm, root);
      triangle2(b, c2, d, culm, root);
    }
    parts.push({ role: "culm", root: [...root], triangles: positions.length / 9 - base });
    const t = 0.4 + n * 0.1;
    ribbon([root[0] + cs * lean * t * t, root[1] + sn * lean * t * t, h * t], a + 1.7, 0.28 + n * 0.023, 0.14, 0.019, 0.82, 2, green, "flag", root);
    if (n !== 0) {
      const start = positions.length / 9, tip = [root[0] + cs * lean, root[1] + sn * lean];
      for (let k = 0; k < 3; k++) {
        const p = (y, j, r) => [tip[0] + Math.cos(j * TAU4 / 3) * r, h + y, tip[1] + Math.sin(j * TAU4 / 3) * r];
        triangle2(p(-0.095, k, 0.017), p(0.035, k, 0.01), p(-0.095, k + 1, 0.017), head, root);
        triangle2(p(-0.095, k + 1, 0.017), p(0.035, k, 0.01), p(0.035, k + 1, 0.01), head, root);
      }
      parts.push({ role: "seedhead", root: [...root], triangles: positions.length / 9 - start });
    }
  }
  if (positions.length / 9 !== MARSH_PATCH_LIMITS.triangles) throw new RangeError("Marsh triangle budget");
  return { positions: new Float32Array(positions), normals: new Float32Array(normals), colors: new Float32Array(colors), roots: new Float32Array(roots), parts };
}

// riparian-plan.js
var RIPARIAN_LIMITS = Object.freeze({ chunkReeds: 112, chunkStones: 12, reeds: 640, stones: 1024, draws: 2, range: 118, lowRange: 76, scanSeconds: 0.5 });
function planRiparian({ hydrology: hydrology2, terrainFunctions: f2, chunk, allowed = () => true, seed = 728194 }) {
  const x0 = chunk.cx * 64, z0 = chunk.cz * 64, bounds2 = { minX: x0 - 3, minZ: z0 - 3, maxX: x0 + 67, maxZ: z0 + 67 };
  const features = hydrology2?.queryBounds(bounds2) || [];
  if (!features.length) return [];
  const marshChunk = features.some((f3) => f3.kind === "wetland");
  const swampCoverage = hydrology2?.generationMode === "water-first" ? hydrology2.geometry?.plan?.swampCoverage : null;
  const mappedChunk = Array.isArray(swampCoverage) && features.some((f3) => swampCoverage.some((c2) => c2.bodyId === f3.id));
  const records = [], hash4 = (id, slot) => stableHash(seed, "riparian-v1", id, slot), heights = /* @__PURE__ */ new Map();
  const height2 = (x, z) => {
    const key = x + "," + z;
    if (!heights.has(key)) heights.set(key, f2.height(x, z));
    return heights.get(key);
  };
  for (let gz = chunk.cz * 32; gz < (chunk.cz + 1) * 32; gz++) for (let gx = chunk.cx * 32; gx < (chunk.cx + 1) * 32; gx++) {
    const id = gx + "," + gz, x = (gx + 0.2 + hash4(id, "x") * 0.6) * 2, z = (gz + 0.2 + hash4(id, "z") * 0.6) * 2;
    const colony = hash4(id, "colony");
    if (colony > (marshChunk || mappedChunk ? 0.44 : 0.22)) continue;
    const near = hydrology2.nearWater(x, z, 2.6);
    if (!near || near.kind === "river" || near.kind === "stream" || near.kind === "ocean" || !near.featureId) continue;
    const context = wetlandPlantContext(hydrology2, f2, x, z, near), marsh = context.marsh, maxReedDepth = context.maxDepth;
    if (colony > (marshChunk || context.swampRegionId !== null ? 0.44 : 0.22)) continue;
    const y = height2(x, z);
    if (y - near.level < -maxReedDepth || y - near.level > 1.05 || f2.slope(x, z) > 0.65) continue;
    const biome2 = f2.biome(x, z), winter = (typeof biome2 === "number" ? biome2 : biome2.id) === 2;
    if (winter && hash4(id, "winter") > 0.43) continue;
    const kind = hash4(id, "kind") < (marsh ? 0.94 : 0.74) ? "reed" : "stone", count = kind === "reed" ? marsh ? 4 : 3 : 2;
    for (let i = 0; i < count; i++) {
      const slot = id + "/" + i, a = hash4(slot, "angle") * Math.PI * 2, d = hash4(slot, "offset") * 0.78, px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
      const bank = hydrology2.nearWater(px, pz, 2.6);
      if (!bank || bank.featureId !== near.featureId) continue;
      if (context.swampRegionId !== null) {
        const shifted = wetlandPlantContext(hydrology2, f2, px, pz, bank);
        if (!shifted.marsh || shifted.swampRegionId !== context.swampRegionId) continue;
      }
      const py = height2(px, pz), relative = py - bank.level, water = hydrology2.waterAt(px, pz, py);
      if (relative < -(kind === "reed" ? maxReedDepth : 0.08) || relative > (kind === "reed" ? 0.86 : 1.15) || water && water.depth > (kind === "reed" ? maxReedDepth : 0.08) || f2.slope(px, pz) > (kind === "reed" ? 0.58 : 0.82)) continue;
      const size = kind === "reed" ? marsh ? 0.9 + hash4(slot, "scale") * 0.58 : 0.66 + hash4(slot, "scale") * 0.48 : 0.1 + hash4(slot, "scale") * 0.23;
      const yaw = hash4(slot, "yaw") * Math.PI * 2;
      if (!allowed(px, pz, kind === "reed" ? 0.14 : size * 0.85)) continue;
      const record = { id: "riparian:" + slot, featureId: near.featureId, kind, x: px, y: py - (kind === "reed" ? 0.025 : size * 0.18), z: pz, scale: size, yaw, winter, marsh, ...context.swampRegionId ? { swampRegionId: context.swampRegionId } : {}, rank: marsh && kind === "reed" ? hash4(id, "priority") + i * 1e-6 : hash4(slot, "priority") };
      records.push(Object.freeze(record));
    }
  }
  records.push(...planRiverMarginPlants({ hydrology: hydrology2, terrainFunctions: f2, chunk, allowed, seed }));
  function support(record) {
    const { x: px, z: pz, scale: size, yaw } = record, py = record.y + 0.025;
    if (!allowed(px, pz, MARSH_PATCH_LIMITS.radius * size)) return null;
    const r = MARSH_PATCH_LIMITS.rootRadius * size, dx = (height2(px + r, pz) - height2(px - r, pz)) / (2 * r), dz = (height2(px, pz + r) - height2(px, pz - r)) / (2 * r);
    if (Math.hypot(dx, dz) > MARSH_PATCH_LIMITS.maxSlope) return null;
    for (const [rx, rz] of MARSH_ROOTS) {
      const ox = (rx * Math.cos(yaw) + rz * Math.sin(yaw)) * size, oz = (-rx * Math.sin(yaw) + rz * Math.cos(yaw)) * size, h = height2(px + ox, pz + oz), s = hydrology2.nearWater(px + ox, pz + oz, 2.6), w = hydrology2.waterAt(px + ox, pz + oz, h);
      if (Math.abs(h - py - dx * ox - dz * oz) > MARSH_PATCH_LIMITS.maxSupportError || !s || s.featureId !== record.featureId || h - s.level < -0.3 || h - s.level > 0.86 || w && w.depth > 0.3) return null;
      if (record.swampRegionId != null) {
        const context = wetlandPlantContext(hydrology2, f2, px + ox, pz + oz, s);
        if (!context.marsh || context.swampRegionId !== record.swampRegionId || w && w.featureId !== record.featureId) return null;
      }
    }
    const bankPlane = Object.freeze({ x: dx * Math.cos(yaw) - dz * Math.sin(yaw), z: dx * Math.sin(yaw) + dz * Math.cos(yaw) });
    return Object.freeze({ ...record, bankPlane });
  }
  const selected = [];
  for (const kind of ["reed", "stone"]) {
    const list = records.filter((r) => r.kind === kind).sort((a, b) => a.rank - b.rank || a.id.localeCompare(b.id)), cap = kind === "reed" ? RIPARIAN_LIMITS.chunkReeds : RIPARIAN_LIMITS.chunkStones;
    let count = 0, probes = 0;
    for (const record of list) {
      if (count === cap) break;
      let result = record;
      if (kind === "reed" && record.marsh) {
        if (probes++ >= RIPARIAN_LIMITS.chunkReeds * 3) continue;
        result = support(record);
      }
      if (result) {
        selected.push(result);
        count++;
      }
    }
  }
  return Object.freeze(selected.sort((a, b) => a.id.localeCompare(b.id)));
}
function selectRiparian(chunks, activeFeatures, position, quality = "high") {
  const full = ["high", "ultra"].includes(quality), range = full ? RIPARIAN_LIMITS.range : RIPARIAN_LIMITS.lowRange, candidates = [];
  for (const entry of chunks.values()) for (const r of entry.records) {
    if (r.kind === "gravel") continue;
    if (!activeFeatures?.has(r.featureId)) continue;
    const d = (r.x - position.x) ** 2 + (r.z - position.z) ** 2;
    if (d >= range * range || r.kind === "stone" && d > (r.riverCobble && full ? 64 * 64 : 48 * 48)) continue;
    if (!full && r.rank > 0.6) continue;
    candidates.push({ record: r, distanceSquared: d });
  }
  candidates.sort((a, b) => a.distanceSquared - b.distanceSquared || a.record.id.localeCompare(b.record.id));
  const reeds = [], stones = [];
  for (const p of candidates) {
    const list = p.record.kind === "reed" ? reeds : stones, cap = p.record.kind === "reed" ? full ? RIPARIAN_LIMITS.reeds : RIPARIAN_LIMITS.reeds / 2 : full ? RIPARIAN_LIMITS.stones : quality === "low" ? 256 : 512;
    if (list.length < cap) list.push(p.record);
  }
  return { reeds, stones };
}

// river-cobbles.js
var RIVER_COBBLE_LIMITS = Object.freeze({ chunk: 320, candidates: 640, clusterMax: 28, bankWidth: 5.2, maxDepth: 0.14, maxCrown: 0.3, range: 64, visible: 1024 });
var TAU5 = Math.PI * 2;
var EMPTY2 = Object.freeze([]);
function planRiverCobbles({ hydrology: hydrology2, terrainFunctions: f2, chunk, allowed = () => true, seed = hydrology2?.seed ?? 728194 }) {
  if (hydrology2?.generationMode !== "water-first") return EMPTY2;
  const x0 = chunk.cx * 64, z0 = chunk.cz * 64, area = { minX: x0 - 8, minZ: z0 - 8, maxX: x0 + 72, maxZ: z0 + 72 };
  const features = hydrology2.queryBounds(area).filter((feature) => feature.generationMode === "water-first" && feature.streams?.length).sort((a, b) => a.id.localeCompare(b.id));
  if (!features.length) return EMPTY2;
  const hash4 = (id, slot) => stableHash(seed, "river-cobbles-v2", id, slot), candidates = [], L = RIVER_COBBLE_LIMITS;
  for (const feature of features) for (const stream of feature.streams) {
    const points = stream.points;
    for (let row2 = 2; row2 < points.length - 2; row2++) {
      const p = points[row2], halfWidth = p.halfWidth ?? p.width * 0.5, level = p.level ?? p.y;
      if (![p.x, p.z, p.fx, p.fz, halfWidth, level].every(Number.isFinite)) continue;
      for (const side of [-1, 1]) {
        const id = stream.id + ":" + row2 + ":" + side, normalX = -p.fz * side, normalZ = p.fx * side;
        const bankX = p.x + normalX * halfWidth, bankZ = p.z + normalZ * halfWidth;
        if (bankX < area.minX || bankX > area.maxX || bankZ < area.minZ || bankZ > area.maxZ) continue;
        const deposit = riverBankDepositAt(hydrology2, bankX + normalX * 1.8, bankZ + normalZ * 1.8, seed);
        if (deposit < 0.33) continue;
        const knot = Math.floor(row2 / 6), t = row2 / 6 - knot, u = t * t * (3 - 2 * t);
        const bar = hash4(stream.id + ":" + knot + ":" + side, "bar") * (1 - u) + hash4(stream.id + ":" + (knot + 1) + ":" + side, "bar") * u;
        const chance = Math.max(0, Math.min(1, (bar - 0.2) / 0.34)) * Math.min(1, (deposit - 0.3) * 2.6);
        if (hash4(id, "clump") >= chance) continue;
        const coarse2 = hash4(id, "coarse"), count = 3 + Math.floor(Math.pow(hash4(id, "count"), 1.4) * (L.clusterMax - 3) * Math.min(1, 0.4 + deposit * 0.8));
        const centerAlong = (hash4(id, "along") - 0.5) * 2.4, centerAcross = -0.2 + Math.pow(hash4(id, "across"), 1.5) * (0.9 + deposit * 3.4);
        const spread = 0.2 + hash4(id, "spread") * 0.75, stretch = 1.15 + hash4(id, "stretch") * 1.3, flowYaw = Math.atan2(-p.fz, p.fx);
        for (let slot = 0; slot < count; slot++) {
          const key = id + ":" + slot, radial = Math.sqrt(-2 * Math.log(1 - hash4(key, "r") * 0.999)), angle = hash4(key, "a") * TAU5;
          const along = centerAlong + radial * Math.cos(angle) * spread * stretch, offset = Math.max(-0.3, Math.min(L.bankWidth, centerAcross + radial * Math.sin(angle) * spread));
          const x = bankX + p.fx * along + normalX * offset, z = bankZ + p.fz * along + normalZ * offset;
          if (Math.floor(x / 64) !== chunk.cx || Math.floor(z / 64) !== chunk.cz) continue;
          if (riverBankDepositAt(hydrology2, x, z, seed) < 0.3) continue;
          const scale = Math.min(0.5, 0.08 / Math.pow(1 - hash4(key, "size") * 0.985, 1 / 1.9) * (0.65 + coarse2 * 0.9));
          const scaleY = Math.min(0.19, scale * (0.34 + hash4(key, "flat") * 0.38)), scaleZ = scale * (0.56 + hash4(key, "elongation") * 0.42);
          const pick = hash4(key, "yaw"), yaw = pick < 0.78 ? flowYaw + (pick < 0.42 ? 0 : Math.PI / 2) + (hash4(key, "yawJitter") - 0.5) * 0.9 : hash4(key, "yawFree") * TAU5;
          candidates.push({
            id: "river-cobble:" + key,
            featureId: feature.id,
            kind: "stone",
            riverCobble: true,
            x,
            z,
            scale,
            scaleY,
            scaleZ,
            yaw,
            bury: 0.12 + hash4(key, "bury") * 0.48,
            lean: hash4(key, "lean") * 0.36,
            flowX: p.fx,
            flowZ: p.fz,
            rank: hash4(key, "rank"),
            tint: 0.76 + hash4(key, "color") * 0.32,
            winter: false,
            marsh: false
          });
        }
      }
    }
  }
  candidates.sort((a, b) => a.rank - b.rank || a.id.localeCompare(b.id));
  const records = [];
  for (let i = 0; i < Math.min(candidates.length, L.candidates) && records.length < L.chunk; i++) {
    const r = candidates[i], y = f2.height(r.x, r.z), shore = hydrology2.nearWater(r.x, r.z, 6);
    if (!shore || shore.featureId !== r.featureId || shore.kind !== "stream" || shore.distance > L.bankWidth + 0.5) continue;
    const water = hydrology2.waterAt(r.x, r.z, y);
    if (water && (water.featureId !== r.featureId || water.depth > L.maxDepth) || y < shore.level - L.maxDepth || y > shore.level + 2) continue;
    if (!allowed(r.x, r.z, r.scale)) continue;
    const radius = r.scale, heights = [f2.height(r.x + radius, r.z), f2.height(r.x - radius, r.z), f2.height(r.x, r.z + radius), f2.height(r.x, r.z - radius)];
    const gx = (heights[0] - heights[1]) / (2 * radius), gz = (heights[2] - heights[3]) / (2 * radius), grade = Math.hypot(gx, gz);
    if (grade > 0.65) continue;
    let error = Math.max(Math.abs(heights[0] - y - gx * radius), Math.abs(heights[1] - y + gx * radius), Math.abs(heights[2] - y - gz * radius), Math.abs(heights[3] - y + gz * radius));
    for (const [dx, dz] of [[0.707, 0.707], [0.707, -0.707], [-0.707, 0.707], [-0.707, -0.707]]) error = Math.max(error, Math.abs(f2.height(r.x + dx * radius, r.z + dz * radius) - y - gx * dx * radius - gz * dz * radius));
    if (error > 0.055) continue;
    const inv = 1 / Math.hypot(gx, 1, gz), rise = r.scaleY / inv, crown = rise * (1.5 - r.bury) - error;
    if (crown < 0.02 || crown > L.maxCrown) continue;
    const bankNormal2 = Object.freeze({ x: -gx * inv, y: inv, z: -gz * inv });
    let ox = bankNormal2.x - r.flowX * r.lean, oy = bankNormal2.y, oz = bankNormal2.z - r.flowZ * r.lean;
    const ol = Math.hypot(ox, oy, oz);
    records.push(Object.freeze({
      ...r,
      y: y + rise * (0.5 - r.bury) - error,
      ground: y,
      wet: !!water,
      crown,
      bankDistance: shore.distance,
      bankNormal: bankNormal2,
      orient: Object.freeze({ x: ox / ol, y: oy / ol, z: oz / ol }),
      cobbleFootprint: Object.freeze({ x: r.scale, z: r.scaleZ }),
      cobbleProfile: r.scale > 0.26 ? "large" : r.scale > 0.12 ? "medium" : "small"
    }));
  }
  return Object.freeze(records.sort((a, b) => a.id.localeCompare(b.id)));
}
function createRiverCobbleGeometry(THREE) {
  const g = new THREE.SphereGeometry(1, 14, 8), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), wear = 1 + 0.065 * Math.sin(x * 2.8 + z * 1.9) * Math.sin(y * 2.1 + 0.6) + 0.025 * x * z;
    p.setXYZ(i, x * wear, y * (0.97 + 0.03 * Math.cos(x * 2.1 - z * 1.6)), z * wear);
  }
  let radius = 0, ymax = 0;
  for (let i = 0; i < p.count; i++) {
    radius = Math.max(radius, Math.hypot(p.getX(i), p.getZ(i)));
    ymax = Math.max(ymax, Math.abs(p.getY(i)));
  }
  for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) / radius, p.getY(i) / ymax, p.getZ(i) / radius);
  g.computeVertexNormals();
  const groups = /* @__PURE__ */ new Map(), normal = g.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    const key = [p.getX(i), p.getY(i), p.getZ(i)].map((n) => Math.round(n * 1e6)).join(","), group = groups.get(key) || [];
    group.push(i);
    groups.set(key, group);
  }
  for (const group of groups.values()) if (group.length > 1) {
    let x = 0, y = 0, z = 0;
    for (const i of group) {
      x += normal.getX(i);
      y += normal.getY(i);
      z += normal.getZ(i);
    }
    const length = Math.hypot(x, y, z) || 1;
    for (const i of group) normal.setXYZ(i, x / length, y / length, z / length);
  }
  g.computeBoundingBox();
  g.computeBoundingSphere();
  g.name = "river-rounded-cobble";
  return g;
}

// river-gravel.js
var GRAVEL_LIMITS = Object.freeze({ visible: 3500, balanced: 1400, low: 600, range: 32, balancedRange: 30, lowRange: 24, coreRange: 24, chunk: 3072, coreChunk: 2304, candidates: 3072, patchCell: 4, spacing: 0.22, maxDepth: 0.065, maxCrown: 0.12, triangles: 64 });
var EMPTY3 = Object.freeze([]);
var TAU6 = Math.PI * 2;
var SQRT3 = Math.sqrt(3);
var clamp8 = (n) => Math.max(0, Math.min(1, n));
var ease = (n) => {
  const t = clamp8(n);
  return t * t * (3 - 2 * t);
};
function* planRiverGravelSteps({ hydrology: hydrology2, terrainFunctions: f2, chunk, allowed = () => true, seed = hydrology2?.seed ?? 728194 }, cobbles = EMPTY3) {
  if (hydrology2?.generationMode !== "water-first" || !cobbles.length) return EMPTY3;
  const hash4 = (id, slot) => stableHash(seed, "river-gravel-v1", id, slot), patches = /* @__PURE__ */ new Map(), largeCells = /* @__PURE__ */ new Map();
  const height2 = (x, z) => f2.height(x, z);
  for (const rock of cobbles) {
    if (!rock.riverCobble || !rock.bankNormal) continue;
    const bx = Math.floor(rock.x / 2), bz = Math.floor(rock.z / 2), largeKey = bx + "," + bz, list = largeCells.get(largeKey) || [];
    list.push(rock);
    largeCells.set(largeKey, list);
    const px = Math.floor(rock.x / GRAVEL_LIMITS.patchCell), pz = Math.floor(rock.z / GRAVEL_LIMITS.patchCell), key = rock.featureId + ":" + px + "," + pz;
    const rank2 = hash4(key, rock.id), previous = patches.get(key);
    if (!previous || rank2 < previous.anchorRank || rank2 === previous.anchorRank && rock.id < previous.rock.id) patches.set(key, { id: key, rock, anchorRank: rank2, rank: hash4(key, "priority") });
  }
  const coreCandidates = [], extensionCandidates = [];
  for (const patch of [...patches.values()].sort((a, b) => a.rank - b.rank || a.id.localeCompare(b.id))) {
    if (hash4(patch.id, "quiet") < 0.09) continue;
    yield "gravel:patch";
    const anchor = patch.rock, channel2 = hydrology2.projectChannel?.(anchor.x, anchor.z, 12);
    if (!channel2 || channel2.featureId !== anchor.featureId) continue;
    const fx = channel2.flow.x, fz = channel2.flow.z, length = Math.hypot(fx, fz);
    if (length < 1e-3) continue;
    const tx = fx / length, tz = fz / length, nx = -tz, nz = tx;
    const lengthHash = hash4(patch.id, "length"), widthHash = hash4(patch.id, "width"), coreAlong = 1.18 + lengthHash * 0.52, coreAcross = 0.65 + widthHash * 0.33;
    const along = 1.7 + lengthHash * 0.8, across = 0.94 + widthHash * 0.44;
    const centerX = anchor.x + tx * (hash4(patch.id, "center") - 0.5) * 0.35, centerZ = anchor.z + tz * (hash4(patch.id, "center") - 0.5) * 0.35;
    const phase1 = hash4(patch.id, "outline1") * TAU6, phase2 = hash4(patch.id, "outline2") * TAU6, grain = 0.6 + hash4(patch.id, "grain") * 0.8;
    const rows = Math.ceil(across / (GRAVEL_LIMITS.spacing * SQRT3 * 0.5)), cols = Math.ceil(along / GRAVEL_LIMITS.spacing), coreRows = Math.ceil(coreAcross / (GRAVEL_LIMITS.spacing * SQRT3 * 0.5)), coreCols = Math.ceil(coreAlong / GRAVEL_LIMITS.spacing);
    for (let iz = -rows; iz <= rows; iz++) for (let ix = -cols; ix <= cols; ix++) {
      const id = patch.id + ":" + ix + "," + iz, u = (ix + (iz & 1) * 0.5) * GRAVEL_LIMITS.spacing + (hash4(id, "jx") - 0.5) * GRAVEL_LIMITS.spacing * 0.9, v = iz * GRAVEL_LIMITS.spacing * SQRT3 * 0.5 + (hash4(id, "jz") - 0.5) * GRAVEL_LIMITS.spacing * 0.8;
      const theta = Math.atan2(v / across, u / along), outline = 1 + 0.17 * Math.sin(3 * theta + phase1) + 0.09 * Math.sin(5 * theta + phase2);
      const edge2 = hash4(id, "edge"), radius = Math.hypot(u / along, v / across) / outline;
      if (radius > 1.08 || edge2 > 1 - ease((radius - 0.8) / 0.28)) continue;
      const cu = u / grain, cv = v / grain, ci = Math.floor(cu), cj = Math.floor(cv), fu = ease(cu - ci), fv = ease(cv - cj), cell = (a, b) => hash4(patch.id + ":" + (ci + a) + "," + (cj + b), "density");
      const density = 0.45 + 0.6 * ((cell(0, 0) * (1 - fu) + cell(1, 0) * fu) * (1 - fv) + (cell(0, 1) * (1 - fu) + cell(1, 1) * fu) * fv);
      if (hash4(id, "thin") > density) continue;
      const coreRadius = Math.hypot(u / coreAlong, v / coreAcross), core = Math.abs(ix) <= coreCols && Math.abs(iz) <= coreRows && coreRadius <= 1.08 && edge2 <= 1 - ease((coreRadius - 0.8) / 0.28);
      const x = centerX + tx * u + nx * v, z = centerZ + tz * u + nz * v, size = hash4(id, "size"), scale = hash4(id, "large") < 0.06 ? 0.13 + 0.06 * size : 0.03 + 0.11 * Math.pow(size, 1.6), scaleY = Math.min(0.085, scale * (0.45 + hash4(id, "height") * 0.3)), scaleZ = scale * (0.6 + hash4(id, "shape") * 0.4);
      let blocked = false;
      for (let bz = Math.floor((z - 0.65) / 2); bz <= Math.floor((z + 0.65) / 2) && !blocked; bz++) for (let bx = Math.floor((x - 0.65) / 2); bx <= Math.floor((x + 0.65) / 2) && !blocked; bx++) for (const rock of largeCells.get(bx + "," + bz) || EMPTY3) {
        const dx = x - rock.x, dz = z - rock.z, cs = Math.cos(rock.yaw), sn = Math.sin(rock.yaw), rx = (dx * cs - dz * sn) / ((rock.cobbleFootprint?.x ?? rock.scale) + scale * 0.55), rz = (dx * sn + dz * cs) / ((rock.cobbleFootprint?.z ?? rock.scaleZ) + scale * 0.55);
        if (rx * rx + rz * rz < 1) {
          blocked = true;
          break;
        }
      }
      if (blocked) continue;
      (core ? coreCandidates : extensionCandidates).push({
        id: "river-gravel:" + id,
        featureId: anchor.featureId,
        kind: "gravel",
        riverGravel: true,
        patchId: patch.id,
        ownerChunk: chunk.cx + "," + chunk.cz,
        x,
        z,
        scale,
        scaleY,
        scaleZ,
        yaw: hash4(id, "yaw") * TAU6,
        rank: patch.rank + hash4(id, "priority") * 1e-4,
        fadeRank: hash4(id, "fade"),
        tint: 0.73 + hash4(id, "color") * 0.46
      });
    }
  }
  const order = (a, b) => a.rank - b.rank || a.id.localeCompare(b.id);
  coreCandidates.sort(order);
  extensionCandidates.sort(order);
  const result = [], acceptedPatches = /* @__PURE__ */ new Set();
  let probes = 0;
  function admit(r) {
    probes++;
    const y = height2(r.x, r.z), near = hydrology2.nearWater(r.x, r.z, 7.5);
    if (!near || near.kind !== "stream" || near.featureId !== r.featureId || y < near.level - GRAVEL_LIMITS.maxDepth || y > near.level + 2.3) return false;
    const wet = hydrology2.waterAt(r.x, r.z, y);
    if (wet && (wet.featureId !== r.featureId || wet.depth > GRAVEL_LIMITS.maxDepth)) return false;
    if (!allowed(r.x, r.z, r.scale)) return false;
    const h0 = height2(r.x + r.scale, r.z), h1 = height2(r.x - r.scale, r.z), h2 = height2(r.x, r.z + r.scale), h3 = height2(r.x, r.z - r.scale), gx = (h0 - h1) / (2 * r.scale), gz = (h2 - h3) / (2 * r.scale), grade = Math.hypot(gx, gz);
    if (grade > 0.75) return false;
    const error = Math.max(Math.abs((h0 + h1) * 0.5 - y), Math.abs((h2 + h3) * 0.5 - y));
    if (error > 0.022) return false;
    const ny = 1 / Math.hypot(gx, 1, gz), rise = r.scaleY / ny, crown = 1.26 * rise - error;
    if (crown < 0.028 || crown > GRAVEL_LIMITS.maxCrown) return false;
    result.push(Object.freeze({ ...r, y: y + 0.26 * rise - error, ground: y, wet: !!wet, crown, bankNormal: Object.freeze({ x: -gx * ny, y: ny, z: -gz * ny }) }));
    return true;
  }
  for (const r of coreCandidates) {
    if (probes >= GRAVEL_LIMITS.candidates || result.length >= GRAVEL_LIMITS.coreChunk) break;
    if (admit(r)) acceptedPatches.add(r.patchId);
    if ((probes & 255) === 255) yield "gravel:admit";
  }
  if (probes < GRAVEL_LIMITS.candidates && result.length < GRAVEL_LIMITS.chunk) {
    const byPatch = /* @__PURE__ */ new Map();
    for (const r of extensionCandidates) {
      if (!acceptedPatches.has(r.patchId)) continue;
      const group = byPatch.get(r.patchId) || [];
      group.push(r);
      byPatch.set(r.patchId, group);
    }
    const groups = [...byPatch.entries()].sort((a, b) => hash4(a[0], "priority") - hash4(b[0], "priority") || a[0].localeCompare(b[0])).map((entry) => entry[1]);
    let round = 0, work2 = true;
    while (work2 && probes < GRAVEL_LIMITS.candidates && result.length < GRAVEL_LIMITS.chunk) {
      work2 = false;
      for (const group of groups) {
        if (round >= group.length) continue;
        work2 = true;
        if (probes >= GRAVEL_LIMITS.candidates || result.length >= GRAVEL_LIMITS.chunk) break;
        admit(group[round]);
      }
      round++;
      yield "gravel:extend";
    }
  }
  return Object.freeze(result.sort((a, b) => a.id.localeCompare(b.id)));
}
function selectRiverGravel(chunks, activeFeatures, position, quality = "high") {
  const full = quality === "high" || quality === "ultra", low = quality === "low", range = full ? GRAVEL_LIMITS.range : low ? GRAVEL_LIMITS.lowRange : GRAVEL_LIMITS.balancedRange, cap = full ? GRAVEL_LIMITS.visible : low ? GRAVEL_LIMITS.low : GRAVEL_LIMITS.balanced, core = range * 0.75, candidates = [];
  for (const entry of chunks.values()) for (const r of entry.records) {
    if (!r.riverGravel || !activeFeatures?.has(r.featureId)) continue;
    const d2 = (r.x - position.x) ** 2 + (r.z - position.z) ** 2;
    if (d2 >= range * range) continue;
    const d = Math.sqrt(d2), density = d <= core ? 1 : 1 - ease((d - core) / (range - core));
    if (r.fadeRank >= density) continue;
    candidates.push({ record: r, d2 });
  }
  candidates.sort((a, b) => a.d2 - b.d2 || a.record.id.localeCompare(b.record.id));
  return candidates.slice(0, cap).map((p) => p.record);
}
function createRiverGravelGeometry(THREE) {
  const geometry = new THREE.SphereGeometry(1, 8, 5), position = geometry.attributes.position;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i), y = position.getY(i), z = position.getZ(i), wear = 1 + 0.045 * Math.sin(x * 3.1 - z * 2.3) * Math.cos(y * 2);
    position.setXYZ(i, x * wear, y, z * wear);
  }
  let radius = 0;
  for (let i = 0; i < position.count; i++) radius = Math.max(radius, Math.hypot(position.getX(i), position.getZ(i)));
  for (let i = 0; i < position.count; i++) position.setXYZ(i, position.getX(i) / radius, position.getY(i), position.getZ(i) / radius);
  geometry.computeVertexNormals();
  const normal = geometry.attributes.normal, groups = /* @__PURE__ */ new Map();
  for (let i = 0; i < position.count; i++) {
    const key = [position.getX(i), position.getY(i), position.getZ(i)].map((n) => Math.round(n * 1e6)).join(","), group = groups.get(key) || [];
    group.push(i);
    groups.set(key, group);
  }
  for (const group of groups.values()) if (group.length > 1) {
    let x = 0, y = 0, z = 0;
    for (const i of group) {
      x += normal.getX(i);
      y += normal.getY(i);
      z += normal.getZ(i);
    }
    const length = Math.hypot(x, y, z) || 1;
    for (const i of group) normal.setXYZ(i, x / length, y / length, z / length);
  }
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.name = "river-small-rounded-gravel";
  return geometry;
}

// riparian-base.js
function riparianOptions(world, c2) {
  const allowed = (x, z, r) => plantPositionAllowed(world, c2, x, z, r, true);
  return { hydrology: world.hydrology, terrainFunctions: world.terrainFunctions, chunk: c2, allowed, seed: world.hydrology.seed ?? 728194 };
}
function* planRiparianBaseSteps(world, c2, options = riparianOptions(world, c2)) {
  const cobbles = planRiverCobbles(options);
  yield "riparian:cobbles";
  const records = [...planRiparian(options), ...cobbles];
  yield "riparian:plants";
  records.push(...yield* planRiverGravelSteps(options, cobbles));
  return records;
}
function frozenMarks(value, out = []) {
  if (value && typeof value === "object") {
    out.push(Object.isFrozen(value) ? 1 : 0);
    for (const key of Object.keys(value)) frozenMarks(value[key], out);
  }
  return out;
}
function refreeze(value, marks, at = { i: 0 }) {
  if (value && typeof value === "object") {
    const frozen = marks[at.i++];
    for (const key of Object.keys(value)) refreeze(value[key], marks, at);
    if (frozen) Object.freeze(value);
  }
  return value;
}

// far-coast.js
var FAR_COAST = Object.freeze({ revision: "far-coast-v2", step: 0.35, near: 40, full: 110 });
var farCoastUniforms = { farCoast: { value: new Vector4(0, FAR_COAST.step, FAR_COAST.near, FAR_COAST.full) } };
function setFarCoastSeaLevel(level) {
  if (Number.isFinite(level)) farCoastUniforms.farCoast.value.x = level;
}
function farCoastStep(height2, sea, wet = 0) {
  const d = height2 - sea, a = Math.abs(d);
  if (!(a < 3)) return height2;
  const fade = a <= 1 ? 1 : 1 - (a - 1) * (a - 1) * (3 - (a - 1)) / 4;
  return height2 + FAR_COAST.step * fade * Math.tanh(d / 0.12) * (d > 0 ? 1 - Math.min(1, Math.max(0, wet)) : 1);
}
var VERTEX = `
 #ifndef FAR_COAST_BAKED
 {
  // far-coast.js
  vec3 farCoastP=(modelMatrix*vec4(transformed,1.)).xyz;
  float farCoastD=farCoastP.y-farCoast.x;
  float farCoastW=smoothstep(farCoast.z,farCoast.w,distance(farCoastP.xz,cameraPosition.xz))*(1.-smoothstep(1.,3.,abs(farCoastD)));
  // River mouths keep their water: ground by rivers and lakes is not raised.
  if(farCoastW>0.)transformed.y+=farCoast.y*farCoastW*tanh(farCoastD/.12)*(farCoastD>0.?1.-clamp(hydroWetness,0.,1.):1.);
 }
 #endif
`;
var FAR_COAST_BACKDROP = Object.freeze({ extra: 0.65, from: 1100, full: 1600 });
var BACKDROP_VERTEX = `
 {
  // far-coast.js (backdrop)
  vec3 farCoastP=(modelMatrix*vec4(transformed,1.)).xyz;
  float farCoastD=farCoastP.y-farCoast.x;
  float farCoastW=smoothstep(${FAR_COAST_BACKDROP.from.toFixed(1)},${FAR_COAST_BACKDROP.full.toFixed(1)},distance(farCoastP.xz,cameraPosition.xz))*(1.-smoothstep(1.,3.,abs(farCoastD)));
  if(farCoastW>0.)transformed.y+=${FAR_COAST_BACKDROP.extra.toFixed(3)}*farCoastW*tanh(farCoastD/.12);
 }
`;
function patchFarCoastBackdrop(shader) {
  const seam = "#include <begin_vertex>\n";
  if (!shader.vertexShader.includes(seam)) throw new Error("Far coast vertex seam missing");
  if (!shader.vertexShader.includes("uniform vec4 farCoast;")) shader.vertexShader = "uniform vec4 farCoast;\n" + shader.vertexShader;
  shader.vertexShader = shader.vertexShader.replace(seam, seam + BACKDROP_VERTEX);
  shader.uniforms.farCoast = farCoastUniforms.farCoast;
  return shader;
}
function markFarCoastBaked(shader) {
  shader.vertexShader = "#define FAR_COAST_BAKED\n" + shader.vertexShader;
  return shader;
}
function patchFarCoast(shader) {
  const seam = "#include <begin_vertex>\n";
  if (!shader.vertexShader.includes(seam)) throw new Error("Far coast vertex seam missing");
  shader.vertexShader = "uniform vec4 farCoast;\n" + shader.vertexShader.replace(seam, seam + VERTEX);
  shader.uniforms.farCoast = farCoastUniforms.farCoast;
  return shader;
}

// seeded-bridge-intents.js
var BRIDGE_INTENT_LIMITS = Object.freeze({ perRiver: 10, total: 30 });
var overlap = (a, b) => a.minX <= b.maxX && a.maxX >= b.minX && a.minZ <= b.maxZ && a.maxZ >= b.minZ;
function rank(seed, id, index2, salt) {
  let h = (2166136261 ^ seed ^ Math.imul(index2 + 1, 2654435761) ^ salt) >>> 0;
  for (const c2 of id) h = Math.imul(h ^ c2.charCodeAt(0), 16777619);
  h = Math.imul(h ^ h >>> 16, 2146121005);
  return ((h ^ h >>> 15) >>> 0) / 4294967296;
}
function createSeededBridgeIntents({ plan, geometry, seed = plan?.seed } = {}) {
  if (!Number.isSafeInteger(seed) || !Array.isArray(plan?.rivers) || !Array.isArray(geometry?.segments)) throw TypeError("Seeded water plan and compiled river geometry required");
  if (!plan.generated && plan.rivers.length > 3) throw RangeError("Bridge intentions support at most three planned rivers");
  const budget = /* @__PURE__ */ new Map();
  if (plan.generated) {
    const ranked = plan.rivers.filter((r) => (r.maxWidth ?? 0) >= 3 && (r.length ?? 0) >= 250).map((r) => ({ r, score: r.length * Math.sqrt(r.maxWidth) })).sort((a, b) => b.score - a.score || a.r.id.localeCompare(b.r.id));
    let left = BRIDGE_INTENT_LIMITS.total;
    for (const { r } of ranked) {
      if (left <= 0) break;
      const n = Math.max(1, Math.min(BRIDGE_INTENT_LIMITS.perRiver, Math.round(r.length / 420), left));
      budget.set(r.id, n);
      left -= n;
    }
  }
  const intents = [];
  for (const river of plan.rivers) {
    const perRiver = plan.generated ? budget.get(river.id) || 0 : BRIDGE_INTENT_LIMITS.perRiver;
    if (!perRiver) continue;
    const segments = geometry.segments.filter((s) => s.riverId === river.id && !s.stream.oceanConnected && s.length2 > 1e-8);
    const lengths = segments.map((s) => Math.sqrt(s.length2)), total = lengths.reduce((n, l) => n + l, 0);
    if (total < 100) continue;
    for (let i = 0; i < perRiver; i++) {
      const station3 = total * (i + 0.25 + 0.5 * rank(seed, river.id, i, 4153)) / perRiver;
      let at = 0, j = 0;
      while (j < segments.length - 1 && at + lengths[j] < station3) at += lengths[j++];
      const s = segments[j], t = Math.max(0, Math.min(1, (station3 - at) / lengths[j])), x = s.a.x + s.dx * t, z = s.a.z + s.dz * t, level = s.a.level + (s.b.level - s.a.level) * t, width = 2 * (s.a.halfWidth + (s.b.halfWidth - s.a.halfWidth) * t);
      if (![x, z, level, width].every(Number.isFinite) || level < 2 || width < 3 || width > 60) continue;
      const intent = Object.freeze({ id: river.id + ":bridge-intent:" + i, featureId: s.featureId, riverId: river.id, x, z, level, width, flow: Object.freeze({ x: s.dx / lengths[j], z: s.dz / lengths[j] }), roadLength: 14 + 10 * rank(seed, river.id, i, 30753), station: station3, bounds: Object.freeze({ minX: x, maxX: x, minZ: z, maxZ: z }) });
      intents.push(intent);
    }
  }
  if (intents.length > BRIDGE_INTENT_LIMITS.total) throw RangeError("Bridge intention budget exceeded");
  intents.sort((a, b) => a.id.localeCompare(b.id));
  Object.freeze(intents);
  return Object.freeze({ intents, query(bounds2) {
    if (!bounds2 || ![bounds2.minX, bounds2.maxX, bounds2.minZ, bounds2.maxZ].every(Number.isFinite) || bounds2.minX > bounds2.maxX || bounds2.minZ > bounds2.maxZ) throw TypeError("Finite bridge intention bounds required");
    return intents.filter((i) => overlap(i.bounds, bounds2));
  }, stats: Object.freeze({ version: "seeded-river-bridge-intents-v1", seed, intents: intents.length, maximum: BRIDGE_INTENT_LIMITS.total }) });
}
async function prewarmSeededBridges(planner, source, { isCancelled = () => false, yieldControl = yieldTask, onProgress = () => {
} } = {}) {
  if (typeof planner?.get !== "function" || !source?.stats || !Array.isArray(source.intents)) throw TypeError("Final planner and seeded intention source required");
  const regions = [...new Set(source.intents.map((i) => Math.floor(i.x / 256) + "," + Math.floor(i.z / 256)))].sort();
  if (isCancelled()) throw new DOMException("Bridge preparation cancelled", "AbortError");
  onProgress({ phase: "river-bridges", completedUnits: 0, totalUnits: regions.length, accepted: 0 });
  let accepted = 0;
  for (let i = 0; i < regions.length; i++) {
    if (isCancelled()) throw new DOMException("Bridge preparation cancelled", "AbortError");
    if (planner.get("worldgen-v1:" + source.stats.seed + ":crossing:" + regions[i])) accepted++;
    onProgress({ phase: "river-bridges", completedUnits: i + 1, totalUnits: regions.length, accepted });
    await yieldControl();
  }
  return Object.freeze({ regions: regions.length, accepted });
}

// water-first-headwaters.js
var WATER_FIRST_HEADWATERS = Object.freeze({ version: "source-pool-fall-v1", count: 3, run: 6, poolLength: 30, poolDepth: 2.2, terrainFade: 24, bankRise: 0.45 });
function bounds(points, pad = 0) {
  const b = { minX: Infinity, minZ: Infinity, maxX: -Infinity, maxZ: -Infinity };
  for (const p of points) {
    b.minX = Math.min(b.minX, p.x - pad);
    b.maxX = Math.max(b.maxX, p.x + pad);
    b.minZ = Math.min(b.minZ, p.z - pad);
    b.maxZ = Math.max(b.maxZ, p.z + pad);
  }
  return b;
}
function headwaterReservations(assembly) {
  const { id, pool, fall } = assembly, points = [{ x: fall.lip.x, z: fall.lip.z }, { x: fall.base.x, z: fall.base.z }];
  const layers = ["trees", "rocks", "decor", "groundcover", "occupied"];
  return [
    { id: id + ":spring-protect", ownerId: assembly.reachId, hydrology: true, sourceProtection: true, shape: "polygon", points: pool.polygon, bounds: pool.bounds, layers },
    { id: id + ":fall-protect", ownerId: assembly.reachId, hydrology: true, sourceProtection: true, shape: "polyline", points, width: fall.width + 6, bounds: bounds(points, fall.width * 0.5 + 3), layers }
  ];
}

// water-first-runtime.js
var WATER_FIRST_QUERY_LIMITS = Object.freeze({ features: 160, segments: 32768, ponds: 64, ringVertices: 512, indexEntries: 524288, queryCells: 4096 });
var finite = Number.isFinite;
var EMPTY4 = Object.freeze([]);
var EPS = 0.025;
var clamp9 = (t) => Math.max(0, Math.min(1, t));
var mix4 = (a, b, t) => a + (b - a) * t;
var inside = (b, x, z, pad = 0) => x >= b.minX - pad && x <= b.maxX + pad && z >= b.minZ - pad && z <= b.maxZ + pad;
var overlap2 = (a, b) => a.minX <= b.maxX && a.maxX >= b.minX && a.minZ <= b.maxZ && a.maxZ >= b.minZ;
var blank = () => ({ minX: Infinity, minZ: Infinity, maxX: -Infinity, maxZ: -Infinity });
function grow(b, x, z, pad = 0) {
  b.minX = Math.min(b.minX, x - pad);
  b.maxX = Math.max(b.maxX, x + pad);
  b.minZ = Math.min(b.minZ, z - pad);
  b.maxZ = Math.max(b.maxZ, z + pad);
  return b;
}
function checkedXZ(x, z) {
  if (!finite(x) || !finite(z)) throw TypeError("Finite water-first coordinates required");
}
function checkedBounds(b) {
  if (!b || ![b.minX, b.minZ, b.maxX, b.maxZ].every(finite) || b.minX > b.maxX || b.minZ > b.maxZ) throw TypeError("Finite ordered water-first bounds required");
  return b;
}
function freeze(v) {
  if (!v || typeof v !== "object" || Object.isFrozen(v)) return v;
  for (const value of Object.values(v)) freeze(value);
  return Object.freeze(v);
}
function index(records, boundsOf2, size) {
  const buckets = /* @__PURE__ */ new Map();
  let entries = 0;
  for (let i = 0; i < records.length; i++) {
    const b = checkedBounds(boundsOf2(records[i]));
    const x0 = Math.floor(b.minX / size), x1 = Math.floor(b.maxX / size), z0 = Math.floor(b.minZ / size), z1 = Math.floor(b.maxZ / size);
    if (![x0, x1, z0, z1].every(Number.isSafeInteger) || (x1 - x0 + 1) * (z1 - z0 + 1) > WATER_FIRST_QUERY_LIMITS.indexEntries - entries) throw RangeError("Water-first spatial index budget exceeded");
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      const key = x + "," + z;
      let list = buckets.get(key);
      if (!list) buckets.set(key, list = []);
      list.push(records[i]);
      entries++;
    }
  }
  for (const list of buckets.values()) Object.freeze(list);
  return {
    at: (x, z) => buckets.get(Math.floor(x / size) + "," + Math.floor(z / size)) || EMPTY4,
    query(b) {
      checkedBounds(b);
      const x0 = Math.floor(b.minX / size), x1 = Math.floor(b.maxX / size), z0 = Math.floor(b.minZ / size), z1 = Math.floor(b.maxZ / size);
      if (![x0, x1, z0, z1].every(Number.isSafeInteger) || (x1 - x0 + 1) * (z1 - z0 + 1) > WATER_FIRST_QUERY_LIMITS.queryCells) throw RangeError("Water-first query window budget exceeded");
      const seen = /* @__PURE__ */ new Set(), result = [];
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) for (const record of buckets.get(x + "," + z) || EMPTY4) if (!seen.has(record) && overlap2(boundsOf2(record), b)) {
        seen.add(record);
        result.push(record);
      }
      return result;
    },
    entries,
    cells: buckets.size
  };
}
function distanceSegment(x, z, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z, den = dx * dx + dz * dz, t = den ? clamp9(((x - a.x) * dx + (z - a.z) * dz) / den) : 0;
  return Math.hypot(x - a.x - dx * t, z - a.z - dz * t);
}
function ringDistance(ring, x, z) {
  let wet = false, distance = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[j], b = ring[i];
    distance = Math.min(distance, distanceSegment(x, z, a, b));
    if (a.z > z !== b.z > z && x < (b.x - a.x) * (z - a.z) / (b.z - a.z) + a.x) wet = !wet;
  }
  return distance === 0 ? 0 : wet ? distance : -distance;
}
var POND_CELL = 2;
var POND_REACH = POND_CELL * 0.7072;
var pondCells = /* @__PURE__ */ new WeakMap();
function pondGrid(pond) {
  let g = pondCells.get(pond);
  if (g === void 0) {
    const b = pond.bounds, nx = Math.max(1, Math.ceil((b.maxX - b.minX) / POND_CELL)), nz = Math.max(1, Math.ceil((b.maxZ - b.minZ) / POND_CELL));
    g = nx * nz > 1 << 22 ? null : { nx, nz, state: new Int8Array(nx * nz), near: /* @__PURE__ */ new Map(), pieces: null };
    pondCells.set(pond, g);
  }
  return g;
}
function pondQuick(pond, x, z) {
  const g = pondGrid(pond);
  if (!g) return NaN;
  const b = pond.bounds, ix = Math.min(g.nx - 1, Math.floor((x - b.minX) / POND_CELL)), iz = Math.min(g.nz - 1, Math.floor((z - b.minZ) / POND_CELL));
  if (!(ix >= 0 && iz >= 0)) return NaN;
  const k = iz * g.nx + ix;
  let state = g.state[k];
  if (state === 0) {
    const cx = b.minX + (ix + 0.5) * POND_CELL, cz = b.minZ + (iz + 0.5) * POND_CELL, d = ringDistance(pond.polygon, cx, cz);
    state = 2;
    if (d < -POND_REACH) state = 1;
    else if (d > POND_REACH && (pond.holes || EMPTY4).every((hole) => ringDistance(hole, cx, cz) < -POND_REACH)) {
      const pieces = g.pieces || (g.pieces = [pond.polygon, ...pond.holes || EMPTY4].flatMap((ring) => ring.map((a, i) => [ring[(i + ring.length - 1) % ring.length], a])));
      const far = new Float64Array(pieces.length);
      let nearest = Infinity;
      for (let i = 0; i < pieces.length; i++) {
        far[i] = distanceSegment(cx, cz, pieces[i][0], pieces[i][1]);
        if (far[i] < nearest) nearest = far[i];
      }
      const near = [];
      for (let i = 0; i < pieces.length; i++) if (far[i] <= nearest + 2 * POND_REACH) near.push(pieces[i]);
      g.near.set(k, near);
      state = 3;
    }
    g.state[k] = state;
  }
  if (state === 1) return -1;
  if (state !== 3) return NaN;
  let edge2 = Infinity;
  for (const [a, c2] of g.near.get(k)) edge2 = Math.min(edge2, distanceSegment(x, z, a, c2));
  return edge2;
}
function sampleWaterFirstPond(pond, x, z, out = {}) {
  checkedXZ(x, z);
  let edge2 = ringDistance(pond.polygon, x, z);
  if (edge2 >= 0) for (const hole of pond.holes || EMPTY4) {
    const d = ringDistance(hole, x, z);
    if (d >= 0) {
      edge2 = -d;
      break;
    }
    edge2 = Math.min(edge2, -d);
  }
  out.id = pond.id;
  out.featureId = pond.featureId;
  out.kind = pond.kind;
  out.inside = edge2 >= 0;
  out.edgeDistance = edge2;
  out.signedDistanceToShore = edge2;
  out.level = pond.level;
  out.depth = pond.depth;
  out.shoreFade = pond.shoreFade;
  out.center = pond.center;
  return out;
}
function sampleWaterFirstRiverSegment(segment, x, z, out = {}) {
  const { a, b, dx, dz, length2 } = segment, t = clamp9(((x - a.x) * dx + (z - a.z) * dz) / length2), px = mix4(a.x, b.x, t), pz = mix4(a.z, b.z, t);
  out.id = segment.id;
  out.featureId = segment.featureId;
  out.reachId = segment.reachId;
  out.riverId = segment.riverId;
  out.t = t;
  out.x = px;
  out.z = pz;
  out.distance = Math.hypot(x - px, z - pz);
  out.level = mix4(a.level, b.level, t);
  out.halfWidth = mix4(a.halfWidth, b.halfWidth, t);
  out.depth = mix4(a.depth, b.depth, t);
  out.bankWidth = mix4(a.bankWidth, b.bankWidth, t);
  out.valleyWidth = mix4(a.valleyWidth, b.valleyWidth, t);
  out.minLevel = Math.min(a.level, b.level);
  out.maxLevel = Math.max(a.level, b.level);
  return out;
}
function triangle(a, b, c2) {
  const den = (b.z - c2.z) * (a.x - c2.x) + (c2.x - b.x) * (a.z - c2.z);
  if (!finite(den) || Math.abs(den) < 1e-14) return null;
  return { a, b, c: c2, den, bounds: grow(grow(grow(blank(), a.x, a.z), b.x, b.z), c2.x, c2.z) };
}
function hitTriangle(t, x, z, out) {
  if (!inside(t.bounds, x, z)) return false;
  const { a, b, c: c2, den } = t, u = ((b.z - c2.z) * (x - c2.x) + (c2.x - b.x) * (z - c2.z)) / den, v = ((c2.z - a.z) * (x - c2.x) + (a.x - c2.x) * (z - c2.z)) / den, w = 1 - u - v;
  if (u < 0 || v < 0 || w < 0) return false;
  out.level = u * a.level + v * b.level + w * c2.level;
  out.lateral = u * a.lateral + v * b.lateral + w * c2.lateral;
  out.depth = u * a.depth + v * b.depth + w * c2.depth;
  out.halfWidth = u * a.halfWidth + v * b.halfWidth + w * c2.halfWidth;
  out.fx = u * a.fx + v * b.fx + w * c2.fx;
  out.fz = u * a.fz + v * b.fz + w * c2.fz;
  return true;
}
function station(p) {
  if (!p || !["x", "z", "level", "halfWidth", "depth", "bankWidth", "valleyWidth", "fx", "fz"].every((k) => finite(p[k])) || p.halfWidth <= 0 || p.depth <= 0 || p.bankWidth < 0 || p.valleyWidth < 0 || Math.abs(Math.hypot(p.fx, p.fz) - 1) > 1e-6) throw TypeError("Complete public-curve station required");
  return p;
}
function row(p) {
  const result = [];
  for (let k = 0; k <= 8; k++) {
    const lateral = k / 4 - 1, off = (k / 8 - 0.5) * (p.halfWidth * 2);
    result.push({ x: p.x - p.fz * off, z: p.z + p.fx * off, level: p.level, lateral, halfWidth: p.halfWidth, depth: p.depth, fx: p.fx, fz: p.fz });
  }
  return result;
}
function normalizedPond(p) {
  if (!p || typeof p.id !== "string" || !finite(p.level) || !finite(p.depth) || p.depth <= 0 || !finite(p.center?.x) || !finite(p.center?.z) || !finite(p.shoreFade) || p.shoreFade < 0) throw TypeError("Complete planned pond/lake required");
  const rings = [p.polygon, ...p.holes || EMPTY4];
  if (rings.length > 17) throw RangeError("Pond hole budget exceeded");
  for (const ring of rings) if (!Array.isArray(ring) || ring.length < 3 || ring.length > WATER_FIRST_QUERY_LIMITS.ringVertices || ring.some((v) => !finite(v?.x) || !finite(v?.z))) throw TypeError("Bounded finite pond ring required");
  const b = blank();
  for (const v of p.polygon) grow(b, v.x, v.z);
  return { ...p, featureId: p.id, kind: p.kind === "lake" ? "lake" : p.kind === "marsh" ? "marsh" : "pond", bounds: b, holes: p.holes || [] };
}
function waterReservations(reach, points, b) {
  const layers = ["trees", "rocks", "decor", "groundcover"], controls = reach.renderPoints;
  if (!reach.generated) return [{ id: reach.id + ":water-reserve", ownerId: reach.id, hydrology: true, shape: "polyline", points: controls.map((p) => ({ x: p.x, z: p.z })), width: Math.max(...points.map((p) => p.halfWidth)) * 2, bounds: b, layers }];
  const out = [];
  for (let start = 0, piece = 0; start < controls.length - 1; start += 16, piece++) {
    const part = controls.slice(start, Math.min(controls.length, start + 17)), width = Math.max(...part.map((p) => p.halfWidth)) * 2, bounds2 = blank();
    for (const p of part) grow(bounds2, p.x, p.z, width * 0.5);
    out.push({ id: reach.id + ":water-reserve:" + piece, ownerId: reach.id, hydrology: true, shape: "polyline", points: part.map((p) => ({ x: p.x, z: p.z })), width, bounds: bounds2, layers });
  }
  return out;
}
function compileWaterFirstGeometry(plan) {
  if (!plan || !Number.isSafeInteger(plan.seed) || !finite(plan.seaLevel) || !Array.isArray(plan.rivers) || !Array.isArray(plan.lakes) || !Array.isArray(plan.ponds)) throw TypeError("Seeded water-first plan required");
  const features = [], segments = [], approaches = [], ponds = [...plan.lakes, ...plan.ponds, ...plan.sourcePools || []].map(normalizedPond), seenIds = /* @__PURE__ */ new Set();
  if (ponds.length > WATER_FIRST_QUERY_LIMITS.ponds) throw RangeError("Water-first pond budget exceeded");
  const unique = (id) => {
    if (typeof id !== "string" || !id || seenIds.has(id)) throw TypeError("Unique water-first feature ids required");
    seenIds.add(id);
  };
  for (const pond of ponds) {
    unique(pond.id);
    if (pond.sourcePool) continue;
    const terrainBounds = { minX: pond.bounds.minX - pond.shoreFade, maxX: pond.bounds.maxX + pond.shoreFade, minZ: pond.bounds.minZ - pond.shoreFade, maxZ: pond.bounds.maxZ + pond.shoreFade };
    features.push({
      id: pond.id,
      generationMode: "water-first",
      networkVersion: "water-first-v1",
      kind: pond.kind,
      bounds: pond.bounds,
      terrainBounds,
      ponds: [pond],
      streams: [],
      falls: [],
      // Marshes (v92) keep their dry hummocks open to low plants (placement
      // still tests the actual water there); no trees, rocks or shrubs.
      reservations: [{ id: pond.id + ":water-reserve", ownerId: pond.id, hydrology: true, shape: "polygon", points: pond.polygon, bounds: pond.bounds, layers: pond.kind === "marsh" ? ["trees", "rocks", "decor"] : ["trees", "rocks", "decor", "groundcover"] }],
      soundSources: []
    });
  }
  for (const river of plan.rivers) {
    if (!Array.isArray(river.reaches)) throw TypeError("Water-first river reaches required");
    for (let ri = 0; ri < river.reaches.length; ri++) {
      const reach = river.reaches[ri];
      unique(reach.id);
      if (!Array.isArray(reach.points) || reach.points.length < 2 || reach.points.length > WATER_FIRST_QUERY_LIMITS.segments + 1 || !Array.isArray(reach.renderPoints) || reach.renderPoints.length < 2) throw TypeError("Sampled reach and original public controls required");
      const points = reach.points.map(station), rows = points.map(row), b = blank(), terrainBounds = blank();
      const startFall = fallAtStart(reach), endFall = fallAtEnd(reach, river.reaches[ri + 1]);
      if (endFall) {
        const last = rows.length - 1;
        rows[last] = rows[last].map((v, k) => {
          const q = lipRowPoint(endFall, k);
          return { ...v, x: q.x, z: q.z, halfWidth: endFall.width / 2 };
        });
      }
      const oceanConnected = reach.oceanConnected === true;
      if (oceanConnected && (reach.kind !== "estuary" || river.mouth?.estuaryReachId !== reach.id || points.some((p) => p.level !== plan.seaLevel))) throw TypeError("Ocean estuary must be explicitly linked and exactly at sea level");
      if (reach.kind === "estuary" && !oceanConnected) throw TypeError("Estuary requires explicit ocean connectivity");
      const render = reach.render || { segmentLength: 3, crossSegments: 8, bankOverlap: 0 };
      if (render.segmentLength !== 3 || render.crossSegments !== 8 || render.bankOverlap !== 0) throw RangeError("Water-first public ribbon settings differ from shared stations");
      const stream = {
        ...reach,
        id: reach.id,
        riverId: river.id,
        widthMode: "physical",
        render,
        renderSettings: render,
        points: points.map((p) => ({ ...p, y: p.level, width: p.halfWidth * 2 })),
        renderPoints: reach.renderPoints.map((p) => ({ ...p, y: p.level, width: p.halfWidth * 2 })),
        surfaceSpeed: reach.surfaceSpeed ?? river.surfaceSpeed ?? 1.1,
        startFall: startFall ? fallEdge(startFall) : null,
        endFall: endFall ? fallEdge(endFall) : null
      };
      for (let i = 0; i < points.length; i++) {
        const p = points[i], pad = p.halfWidth + p.bankWidth + p.valleyWidth;
        grow(terrainBounds, p.x, p.z, pad);
        for (const v of rows[i]) grow(b, v.x, v.z);
        if (!i) continue;
        if (segments.length >= WATER_FIRST_QUERY_LIMITS.segments) throw RangeError("Water-first segment budget exceeded");
        const a = points[i - 1], dx = p.x - a.x, dz = p.z - a.z, length2 = dx * dx + dz * dz;
        if (length2 <= 1e-12) throw RangeError("Collapsed water-first station interval");
        const wetBounds = blank(), influenceBounds = blank(), triangles = [];
        for (const v of [...rows[i - 1], ...rows[i]]) grow(wetBounds, v.x, v.z);
        for (const v of [a, p]) grow(influenceBounds, v.x, v.z, v.halfWidth + v.bankWidth + v.valleyWidth);
        for (let k = 0; k < 8; k++) for (const tri of [triangle(rows[i - 1][k], rows[i - 1][k + 1], rows[i][k + 1]), triangle(rows[i - 1][k], rows[i][k + 1], rows[i][k])]) if (tri) triangles.push(tri);
        if (triangles.length !== 16) throw RangeError("Degenerate water-first public ribbon triangle");
        segments.push({
          id: reach.id + ":segment:" + (i - 1),
          featureId: reach.id,
          reachId: reach.id,
          riverId: river.id,
          a,
          b: p,
          dx,
          dz,
          length2,
          triangles,
          bounds: wetBounds,
          influenceBounds,
          stream,
          leftA: rows[i - 1][0],
          leftB: rows[i][0],
          rightA: rows[i - 1][8],
          rightB: rows[i][8],
          first: i === 1 && !startFall,
          last: i === points.length - 1
        });
      }
      if (startFall) {
        const p0 = points[0], near = rows[0], far = near.map((v) => {
          const q = approachPoint(startFall, v);
          return { ...v, x: q.x, z: q.z, fx: startFall.flow.x, fz: startFall.flow.z };
        });
        const c2 = approachPoint(startFall, p0), a = { ...p0, x: c2.x, z: c2.z, fx: startFall.flow.x, fz: startFall.flow.z, along: (p0.along ?? 0) - c2.back }, dx = p0.x - a.x, dz = p0.z - a.z, length2 = dx * dx + dz * dz;
        if (length2 <= 1e-12) throw RangeError("Collapsed water-first approach");
        const wetBounds = blank(), influenceBounds = blank(), triangles = [];
        for (const v of [...far, ...near]) {
          grow(wetBounds, v.x, v.z);
          grow(b, v.x, v.z);
        }
        for (const v of [a, p0]) grow(influenceBounds, v.x, v.z, v.halfWidth + v.bankWidth + v.valleyWidth);
        for (let k = 0; k < 8; k++) for (const tri of [triangle(far[k], far[k + 1], near[k + 1]), triangle(far[k], near[k + 1], near[k])]) if (tri) triangles.push(tri);
        if (triangles.length !== 16) throw RangeError("Degenerate water-first approach triangle");
        approaches.push({
          id: reach.id + ":approach",
          featureId: reach.id,
          reachId: reach.id,
          riverId: river.id,
          a,
          b: p0,
          dx,
          dz,
          length2,
          triangles,
          bounds: wetBounds,
          influenceBounds,
          stream,
          leftA: far[0],
          leftB: near[0],
          rightA: far[8],
          rightB: near[8],
          first: true,
          last: false,
          approach: true,
          fallId: startFall.id
        });
      }
      stream.bounds = b;
      stream.grade = Math.max(0, (points[0].level - points.at(-1).level) / Math.max(1, points.at(-1).along ?? 1));
      const headwater = plan.headwaters?.find((a) => a.reachId === reach.id) || null, sourcePool = headwater ? ponds.find((p) => p.id === headwater.pool.id) : null, featureBounds = { ...b };
      if (headwater) {
        if (!sourcePool) throw TypeError("Headwater pool must compile with its receiving reach");
        for (const key of ["minX", "minZ"]) {
          featureBounds[key] = Math.min(featureBounds[key], headwater.bounds[key]);
          terrainBounds[key] = Math.min(terrainBounds[key], headwater.supportBounds[key]);
        }
        for (const key of ["maxX", "maxZ"]) {
          featureBounds[key] = Math.max(featureBounds[key], headwater.bounds[key]);
          terrainBounds[key] = Math.max(terrainBounds[key], headwater.supportBounds[key]);
        }
      }
      const channelFalls = (reach.falls || []).map((f2) => ({ ...f2, channel: true, streamId: reach.id }));
      for (const f2 of channelFalls) for (const q of [f2.lip, f2.base]) {
        grow(featureBounds, q.x, q.z, f2.width);
        grow(terrainBounds, q.x, q.z, f2.width + 8);
      }
      features.push({
        id: reach.id,
        generationMode: "water-first",
        networkVersion: "water-first-v1",
        kind: "stream",
        bounds: featureBounds,
        terrainBounds,
        ponds: sourcePool ? [sourcePool] : [],
        streams: [stream],
        falls: [...channelFalls, ...headwater ? [headwater.fall] : []],
        headwater,
        reservations: [...waterReservations(reach, points, b), ...headwater ? headwaterReservations(headwater) : []],
        soundSources: []
      });
    }
  }
  if (features.length > WATER_FIRST_QUERY_LIMITS.features) throw RangeError("Water-first feature budget exceeded");
  freeze(features);
  freeze(segments);
  freeze(approaches);
  freeze(ponds);
  const wetIndex = index([...segments, ...approaches], (s) => s.bounds, 64), influenceIndex = index(segments, (s) => s.influenceBounds, 128), featureIndex = index(features, (f2) => f2.terrainBounds, 128);
  const scratch2 = {};
  function riverSurfaceAt(x, z, out = {}, oceanOnly = false) {
    checkedXZ(x, z);
    for (const s of wetIndex.at(x, z)) {
      if (oceanOnly && !s.stream.oceanConnected || !inside(s.bounds, x, z)) continue;
      for (const tri of s.triangles) if (hitTriangle(tri, x, z, scratch2)) {
        const length = Math.hypot(scratch2.fx, scratch2.fz) || 1;
        out.id = s.reachId;
        out.featureId = s.featureId;
        out.reachId = s.reachId;
        out.riverId = s.riverId;
        out.segmentId = s.id;
        out.kind = "stream";
        out.level = scratch2.level;
        out.lateral = scratch2.lateral;
        out.halfWidth = scratch2.halfWidth;
        out.width = scratch2.halfWidth * 2;
        out.channelDepth = scratch2.depth;
        out.depth = scratch2.depth;
        out.edgeDistance = Math.max(0, scratch2.halfWidth * (1 - Math.abs(scratch2.lateral)));
        out.flowX = scratch2.fx / length;
        out.flowZ = scratch2.fz / length;
        const flow = out.flow || (out.flow = { x: 0, z: 0 });
        flow.x = out.flowX;
        flow.z = out.flowZ;
        out.oceanConnected = s.stream.oceanConnected === true;
        out.surfaceSpeed = s.stream.surfaceSpeed;
        out.discharge = s.stream.discharge ?? 0;
        out.bulkSpeed = s.stream.bulkSpeed ?? 0;
        out.minLevel = Math.min(s.a.level, s.b.level);
        out.maxLevel = Math.max(s.a.level, s.b.level);
        return out;
      }
    }
    return null;
  }
  return Object.freeze({
    plan,
    features,
    ponds,
    segments,
    approaches,
    riverSurfaceAt,
    oceanSurfaceAt: segments.some((s) => s.stream.oceanConnected) ? (x, z, out = {}) => riverSurfaceAt(x, z, out, true) : () => null,
    pondSample: sampleWaterFirstPond,
    sampleRiverSegment: sampleWaterFirstRiverSegment,
    riverSegmentsAt: (x, z, influence = false) => (influence ? influenceIndex : wetIndex).at(x, z),
    nearbyPonds: (x, z, pad = 0) => ponds.filter((p) => inside(p.bounds, x, z, pad)),
    queryRiverSegments: (b) => wetIndex.query(b),
    queryBounds: (b) => featureIndex.query(b).sort((a, b2) => a.id.localeCompare(b2.id)),
    stats: Object.freeze({
      features: features.length,
      ponds: ponds.length,
      segments: segments.length,
      approaches: approaches.length,
      triangles: segments.length * 16,
      indexEntries: wetIndex.entries + influenceIndex.entries + featureIndex.entries,
      geometry: "ideal public ribbon rows; mean surface before animated displacement/Float32 upload",
      segmentLength: 3,
      crossSegments: 8,
      bankOverlap: 0
    })
  });
}
function createWaterFirstRuntime({ plan, geometry = compileWaterFirstGeometry(plan), island, height: height2 = null, terrainHeight = null }) {
  if (!island?.isLandExtent || !island?.sample || !island?.shoreDistance || island.params?.seaLevel !== plan.seaLevel) throw TypeError("Matching canonical island/coast required");
  if (geometry.plan !== plan) throw TypeError("Runtime geometry must use the identical plan");
  if (!plan.generated) for (const river of plan.rivers) {
    if (river.terminal?.kind === "lake") {
      const lake = plan.lakes.find((l) => l.id === river.terminal.id), inlet = lake?.ports?.inlet, end = river.reaches.at(-1)?.points.at(-1);
      if (!lake?.closedBasin || !lake.terminal || lake.ports.outlet || !inlet || inlet.id !== river.terminal.portId || river.mouth || river.reaches.some((r) => r.oceanConnected || r.kind === "estuary" || r.from === lake.id + ":outlet") || river.reaches.at(-1)?.to !== inlet.id || !end || Math.hypot(end.x - inlet.center.x, end.z - inlet.center.z) > 1e-8 || Math.abs(end.level - lake.level) > 1e-9)
        throw TypeError("Terminal lake river must finish exactly at its closed lake inlet, with no outlet or estuary");
    } else {
      const estuary = river.reaches.find((r) => r.id === river.mouth?.estuaryReachId);
      if (!estuary?.oceanConnected || island.isLandExtent(estuary.points.at(-1).x, estuary.points.at(-1).z)) throw TypeError("Planned estuary must end in canonical connected sea");
    }
  }
  let finalHeight = height2;
  const floor = (x, z, ground) => {
    const y = ground ?? finalHeight?.(x, z);
    if (!finite(y)) throw TypeError("Final water-first terrain height must be bound");
    return y;
  };
  function connectedOceanAt(x, z, ground) {
    checkedXZ(x, z);
    if (island.isLandExtent(x, z) && !geometry.oceanSurfaceAt(x, z)) return false;
    return plan.seaLevel - floor(x, z, ground) > EPS;
  }
  function inlandSurface(x, z) {
    for (const pond of geometry.ponds) {
      if (!inside(pond.bounds, x, z)) continue;
      const quick = pondQuick(pond, x, z);
      if (quick === -1) continue;
      if (quick >= 0) return { id: pond.id, featureId: pond.id, kind: pond.kind, level: pond.level, edgeDistance: quick, flow: { x: 0, z: 0 } };
      const q = sampleWaterFirstPond(pond, x, z);
      if (q.inside) return { id: pond.id, featureId: pond.id, kind: pond.kind, level: pond.level, edgeDistance: q.edgeDistance, flow: { x: 0, z: 0 } };
    }
    return geometry.riverSurfaceAt(x, z);
  }
  function surfaceAt(x, z) {
    checkedXZ(x, z);
    if (!island.isLandExtent(x, z)) return { id: "island:ocean", featureId: "island:ocean", kind: "ocean", level: plan.seaLevel, edgeDistance: Math.max(0, -island.shoreDistance(x, z)), flow: { x: 0, z: 0 } };
    const estuary = geometry.oceanSurfaceAt(x, z);
    if (estuary) return { ...estuary, id: "island:ocean", featureId: "island:ocean", kind: "ocean", level: plan.seaLevel };
    return inlandSurface(x, z);
  }
  function waterAt(x, z, ground) {
    const s = surfaceAt(x, z);
    if (!s) return null;
    const y = floor(x, z, ground), depth = s.level - y;
    return depth > EPS ? { ...s, depth } : null;
  }
  function nearWater(x, z, maxDistance = 6) {
    checkedXZ(x, z);
    if (!finite(maxDistance) || maxDistance < 0 || maxDistance > 1024) throw RangeError("Water-first shore radius must be0–1024m");
    const wet = waterAt(x, z);
    if (wet) return { ...wet, distance: 0 };
    let best = null;
    for (const p of geometry.ponds) {
      if (!inside(p.bounds, x, z, maxDistance)) continue;
      const q = sampleWaterFirstPond(p, x, z), distance3 = Math.max(0, -q.edgeDistance);
      if (distance3 <= maxDistance && (!best || distance3 < best.distance)) best = { id: p.id, featureId: p.id, kind: p.kind, level: p.level, distance: distance3 };
    }
    const candidates = geometry.queryRiverSegments({ minX: x - maxDistance, maxX: x + maxDistance, minZ: z - maxDistance, maxZ: z + maxDistance });
    for (const s of candidates) {
      if (!inside(s.bounds, x, z, maxDistance)) continue;
      let distance3 = Math.min(distanceSegment(x, z, s.leftA, s.leftB), distanceSegment(x, z, s.rightA, s.rightB));
      if (s.first) distance3 = Math.min(distance3, distanceSegment(x, z, s.leftA, s.rightA));
      if (s.last) distance3 = Math.min(distance3, distanceSegment(x, z, s.leftB, s.rightB));
      if (distance3 <= maxDistance && (!best || distance3 < best.distance)) {
        const q = sampleWaterFirstRiverSegment(s, x, z);
        best = { id: s.reachId, featureId: s.stream.oceanConnected ? "island:ocean" : s.featureId, kind: s.stream.oceanConnected ? "ocean" : "stream", level: q.level, distance: distance3, width: q.halfWidth * 2, channelDepth: q.depth, surfaceSpeed: s.stream.surfaceSpeed, discharge: s.stream.discharge ?? 0, bulkSpeed: s.stream.bulkSpeed ?? 0 };
      }
    }
    if (island.shoreBeyond?.(x, z, maxDistance)) return best;
    const distance = Math.max(0, island.shoreDistance ? island.shoreDistance(x, z) : island.sample(x, z).shoreDistance);
    if (distance <= maxDistance && (!best || distance < best.distance)) best = { id: "island:ocean", featureId: "island:ocean", kind: "ocean", level: plan.seaLevel, distance };
    return best;
  }
  function projectChannel2(x, z, maxDistance = 128) {
    checkedXZ(x, z);
    if (!finite(maxDistance) || maxDistance < 0 || maxDistance > 1024) throw RangeError("Bounded channel projection required");
    let best = null;
    for (const s of geometry.queryRiverSegments({ minX: x - maxDistance, maxX: x + maxDistance, minZ: z - maxDistance, maxZ: z + maxDistance })) {
      if (!inside(s.bounds, x, z, maxDistance)) continue;
      const q = sampleWaterFirstRiverSegment(s, x, z), distance = Math.max(0, q.distance - q.halfWidth);
      if (distance <= maxDistance && (!best || distance < best.distance || distance === best.distance && s.id < best.id)) best = { id: s.id, featureId: s.featureId, x: q.x, z: q.z, level: q.level, width: q.halfWidth * 2, distance, flow: { x: s.dx / Math.sqrt(s.length2), z: s.dz / Math.sqrt(s.length2) } };
    }
    return best;
  }
  function channelSections2(z) {
    if (!finite(z)) throw TypeError("Finite channel section Z required");
    const result = [];
    for (const s of geometry.segments) {
      if (Math.abs(s.dz) < 1e-12) continue;
      const t = (z - s.a.z) / s.dz;
      if (t < 0 || t > 1) continue;
      result.push({ id: s.id, featureId: s.featureId, x: mix4(s.a.x, s.b.x, t), z, level: mix4(s.a.level, s.b.level, t), width: mix4(s.a.halfWidth, s.b.halfWidth, t) * 2, flow: { x: s.dx / Math.sqrt(s.length2), z: s.dz / Math.sqrt(s.length2) } });
    }
    return result.sort((a, b) => b.width - a.width || a.x - b.x || a.id.localeCompare(b.id)).slice(0, 64);
  }
  return Object.freeze({
    version: "water-first-runtime-v1",
    generationMode: "water-first",
    generated: !!plan.generated,
    seed: plan.seed,
    features: geometry.features,
    geometry,
    network: Object.freeze({ version: "water-first-v1", generationMode: "water-first", routingRaster: false }),
    surfaceAt,
    waterAt,
    nearWater,
    connectedOceanAt,
    projectChannel: projectChannel2,
    channelSections: channelSections2,
    queryBounds: geometry.queryBounds,
    reservations: (b) => geometry.queryBounds(b).flatMap((f2) => f2.reservations),
    terrainHeight: (x, z, original) => terrainHeight ? terrainHeight(x, z, original) : original,
    setFinalHeight(fn) {
      if (typeof fn !== "function") throw TypeError("Final triangle height callback required");
      finalHeight = fn;
    },
    clearCache() {
    },
    diagnostics: () => ({ ...geometry.stats, seed: plan.seed, generationMode: "water-first", drainageRaster: false, cacheArtifact: false })
  });
}

// water-first-environment.js
function createWaterFirstEnvironment({ plan, hydrology: hydrology2, island, height: height2, slope: slope2 = null }) {
  if (!plan || !hydrology2?.nearWater || !hydrology2?.waterAt || typeof height2 !== "function" || !island?.sample) throw TypeError("Water-first field and canonical height required");
  const clamp13 = (v) => Math.max(0, Math.min(1, v));
  const swampRegions = (plan.swampCoverage || []).map((c2) => ({ id: c2.wetlandId, bodyId: c2.bodyId, region: c2.region, cos: Math.cos(c2.region.yaw), sin: Math.sin(c2.region.yaw) }));
  const mouths = Object.freeze(plan.rivers.filter((r) => r.mouth).map((r) => Object.freeze({
    ...r.mouth,
    id: r.id + ":mouth",
    riverId: r.id,
    level: plan.seaLevel,
    physicalFlowModel: "designed-watercourse",
    distributaries: Object.freeze([])
  })));
  function environmentAt(x, z, out = {}) {
    if (!Number.isFinite(x) || !Number.isFinite(z)) throw TypeError("Finite habitat coordinates required");
    const elevation = height2(x, z);
    if (!Number.isFinite(elevation)) throw TypeError("Finite final habitat height required");
    const wet = hydrology2.waterAt(x, z, elevation), shore = wet ? { ...wet, distance: 0 } : hydrology2.nearWater(x, z, 24), distance = shore?.distance ?? Infinity;
    const grade = slope2 ? slope2(x, z) : Math.hypot(height2(x + 2, z) - height2(x - 2, z), height2(x, z + 2) - height2(x, z - 2)) / 4;
    if (!Number.isFinite(grade) || grade < 0) throw TypeError("Finite nonnegative terrain slope required");
    const shoreBlend = clamp13((24 - distance) / 6), shoreWeight = shoreBlend * shoreBlend * (3 - 2 * shoreBlend);
    const humidity = clamp13(0.28 + 0.55 * Math.exp(-distance / 18) * shoreWeight);
    let swampRegionId = null;
    for (const r of swampRegions) {
      if ((shore?.featureId ?? shore?.id) !== r.bodyId) continue;
      const dx = x - r.region.center.x, dz = z - r.region.center.z;
      if (Math.hypot((dx * r.cos + dz * r.sin) / r.region.radiusX, (-dx * r.sin + dz * r.cos) / r.region.radiusZ) < 1) {
        swampRegionId = r.id;
        break;
      }
    }
    const riparian = distance < 18 && shore?.kind !== "ocean", wetland = distance < 10 && (grade < 0.075 || swampRegionId !== null && grade < 0.25) && (!wet || wet.depth < 0.35);
    const rapids = shore?.kind === "stream" && distance < 12 && grade > 0.1;
    const coastSample = island.sample(x, z), coast = Math.abs(coastSample.shoreDistance) < 32;
    let mouth = null;
    for (const m of mouths) if (Math.hypot(x - m.x, z - m.z) < 48) {
      mouth = m;
      break;
    }
    Object.assign(out, {
      elevation,
      seaLevel: plan.seaLevel,
      seaAltitude: elevation - plan.seaLevel,
      terrainSlope: grade,
      land: wet?.kind !== "ocean",
      ocean: wet?.kind === "ocean",
      oceanDepth: wet?.kind === "ocean" ? wet.depth : 0,
      waterKind: wet?.kind ?? null,
      waterLevel: wet?.level ?? null,
      waterDepth: wet?.depth ?? 0,
      waterDistance: distance,
      basinId: null,
      flowDirection: wet?.flow ?? null,
      flowAccumulation: null,
      discharge: shore?.discharge ?? null,
      riverWidth: shore?.kind === "stream" ? shore.width ?? 0 : 0,
      channelDepth: shore?.kind === "stream" ? shore.channelDepth ?? 0 : 0,
      flowSpeed: shore?.kind === "stream" ? shore.bulkSpeed ?? 0 : 0,
      surfaceSpeed: shore?.kind === "stream" ? shore.surfaceSpeed ?? 0 : 0,
      rainfall: null,
      humidity,
      riparian,
      wetland,
      swampRegionId,
      rapids,
      mouth: mouth?.id ?? null,
      sediment: swampRegionId && wetland ? "mud" : coast ? grade > 0.5 ? "rock" : grade > 0.13 ? "gravel" : "sand" : rapids ? "gravel" : "soil",
      coast: coast ? grade > 0.6 ? "cliff" : grade > 0.16 ? "rocky" : "beach" : null,
      vegetationWeight: wet ? 0 : 1 + (riparian ? 0.35 : 0) + (wetland ? 0.2 : 0),
      rockWeight: 1 + (rapids ? 0.6 : 0) + (coast && grade > 0.16 ? 0.4 : 0),
      habitat: wet ? wet.kind === "ocean" ? "marine" : "freshwater" : wetland ? "wetland" : riparian ? "riparian" : "upland",
      physicalWaterAuthoritative: true,
      flowDataSource: "seeded-water-first-descriptor",
      routingRaster: false,
      flowResolution: null
    });
    return out;
  }
  return Object.freeze({ environmentAt, mouths, version: "water-first-environment-v1" });
}

// generated-water-plan.js
var GENERATED_WATER_PLAN_VERSION = 7;
var SPAWN = Object.freeze({ x: -4, z: 20 });
var CAMPFIRE = Object.freeze({ x: -6, z: 11 });
function freeze2(v) {
  if (v && typeof v === "object" && !Object.isFrozen(v) && !ArrayBuffer.isView(v)) {
    for (const x of Object.values(v)) freeze2(x);
    Object.freeze(v);
  }
  return v;
}
function boundsOf(points, pad = 0) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z);
    maxZ = Math.max(maxZ, p.z);
  }
  return { minX: minX - pad, maxX: maxX + pad, minZ: minZ - pad, maxZ: maxZ + pad };
}
var station2 = (p) => ({ x: p.x, z: p.z, level: p.level, halfWidth: p.halfWidth, depth: p.depth, bankWidth: p.bankWidth, valleyWidth: p.valleyWidth, u: p.u, along: p.along, fx: p.fx, fz: p.fz, grade: p.grade });
var control = (p) => ({ x: p.x, z: p.z, level: p.level, halfWidth: p.halfWidth, depth: p.depth, bankWidth: p.bankWidth, valleyWidth: p.valleyWidth });
function planStartAccess(rivers, reachOf) {
  let best = null;
  for (const r2 of rivers) for (let k2 = 0; k2 < r2.x.length; k2++) {
    const d = Math.hypot(r2.x[k2] - SPAWN.x, r2.z[k2] - SPAWN.z) - r2.width[k2] * 0.5;
    if (r2.width[k2] >= 2.2 && (!best || d < best.d)) best = { r: r2, k: k2, d };
  }
  if (!best || best.d > 260) return null;
  const { r, k } = best, cx = r.x[k], cz = r.z[k], dist = Math.hypot(SPAWN.x - cx, SPAWN.z - cz) || 1, nx = (SPAWN.x - cx) / dist, nz = (SPAWN.z - cz) / dist;
  const half = r.width[k] * 0.5, bank = { x: cx + nx * half, z: cz + nz * half }, to = { x: bank.x + nx * 16, z: bank.z + nz * 16 };
  if (Math.hypot(to.x - SPAWN.x, to.z - SPAWN.z) < 8) return null;
  const reach = reachOf(r.id, k);
  return {
    riverId: reach?.riverId ?? null,
    reachId: reach?.id ?? null,
    spawn: { ...SPAWN },
    campfire: { ...CAMPFIRE },
    center: { x: cx, z: cz },
    bank,
    level: r.level[k],
    halfWidth: half,
    bankDistance: Math.hypot(SPAWN.x - bank.x, SPAWN.z - bank.z),
    approach: { from: { ...SPAWN }, to, radius: 6, bankElevation: r.level[k] + 1.5, shoreClearance: 16, bedFringe: 6, nativePad: Math.SQRT2 * 4 / 3 },
    targetLevel: r.level[k]
  };
}
function createGeneratedWaterPlan(world, { domain = null } = {}) {
  const seed = world.seed, sea = world.seaLevel, id = (...parts) => `generated:${seed}:${parts.join(":")}`;
  const lb = world.island?.landBounds;
  domain = domain || (lb ? { minX: lb.minX, maxX: lb.maxX, minZ: lb.minZ, maxZ: lb.maxZ, seaLevel: sea } : { minX: -3600, maxX: 3600, minZ: -3600, maxZ: 3600, seaLevel: sea });
  const lakes = world.lakes.map((l) => ({
    id: id("lake", l.id),
    kind: "lake",
    lakeKind: l.lakeKind,
    riverId: null,
    center: { ...l.center },
    level: l.level,
    depth: l.depth,
    shoreFade: 12,
    radiusAlong: Math.max(l.bounds.maxX - l.bounds.minX, l.bounds.maxZ - l.bounds.minZ) * 0.5,
    radiusAcross: Math.min(l.bounds.maxX - l.bounds.minX, l.bounds.maxZ - l.bounds.minZ) * 0.5,
    polygon: l.polygon.map((p) => ({ x: p.x, z: p.z })),
    holes: [],
    bounds: { ...l.bounds },
    ports: {},
    closedBasin: l.lakeKind === "crater",
    terminal: l.lakeKind === "crater",
    outlet: l.outlet ? { ...l.outlet } : null,
    area: l.area
  }));
  const lakeById = new Map(world.lakes.map((l, i) => [l.id, lakes[i]]));
  const waterfalls = new Map(world.waterfalls.map((w) => [w.id, w]));
  const rivers = [], reachIndex = [];
  for (const r of world.rivers) {
    const runs = world.runs.filter((run) => run.riverId === r.id);
    if (!runs.length) continue;
    const riverId = id("river", r.id);
    const reaches = runs.map((run, j) => {
      const reachId = id("river", r.id, "reach", j), fall = run.fallBefore ? waterfalls.get(run.fallBefore) : null;
      const first = run.stations[0], last = run.stations[run.stations.length - 1];
      const length = last.along || 1, grade = Math.max(0, (first.level - last.level) / length);
      const falls = fall ? [{ id: id("river", r.id, "fall", j), kind: "channel-fall", channel: true, streamId: reachId, lip: { ...fall.lip }, base: { ...fall.base }, flow: { ...fall.flow }, width: Math.max(0.8, fall.width * 0.92), drop: fall.drop }] : [];
      const reach = {
        id: reachId,
        riverId,
        from: j ? id("river", r.id, "fall", j) : id("river", r.id, "source"),
        to: j < runs.length - 1 ? id("river", r.id, "fall", j + 1) : id("river", r.id, "end"),
        renderPoints: run.controls.map(control),
        points: run.stations.map(station2),
        bounds: run.bounds,
        waterBounds: run.waterBounds,
        render: run.render,
        proof: { sampledYMonotone: run.proof.sampledYMonotone, maxSampleRise: run.proof.maxSampleRise, maxDownhillGrade: run.proof.maxDownhillGrade, totalLength: run.proof.totalLength, controlCount: run.proof.controlCount },
        surfaceSpeed: Math.min(2.6, 0.7 + grade * 9),
        grade,
        falls,
        generated: true,
        maxWidth: Math.max(...run.stations.map((p) => p.halfWidth)) * 2
      };
      reachIndex.push({ riverId: r.id, first: run.first, last: run.last, reach });
      return reach;
    });
    const fullPath = reaches.flatMap((reach) => reach.renderPoints);
    const terminal = r.terminal.kind === "ocean" ? { kind: "ocean", id: "island:ocean" } : r.terminal.kind === "lake" ? { kind: "lake", id: lakeById.get(r.terminal.lakeId)?.id ?? null } : { kind: "river", id: id("river", r.terminal.riverId) };
    let mouth = null;
    if (r.terminal.kind === "ocean") {
      let k = r.x.length - 1;
      while (k > 0 && world.island && !world.island.isLandExtent(r.x[k], r.z[k])) k--;
      mouth = { id: riverId + ":mouth", x: r.x[k], z: r.z[k], level: sea, shore: { x: r.x[k], z: r.z[k], level: sea }, seaOverlap: 36 };
    }
    const sourceKind = r.source.kind === "lake" ? "lake" : "spring";
    rivers.push({
      id: riverId,
      kind: "river",
      generatedId: r.id,
      parentId: r.parent >= 0 ? id("river", r.parent) : null,
      order: r.parent >= 0 ? "tributary" : "main",
      source: { id: riverId + ":source", kind: sourceKind, x: r.x[0], z: r.z[0], level: r.level[0], lakeId: r.source.kind === "lake" ? lakeById.get(r.source.lakeId)?.id ?? null : null },
      ...mouth ? { mouth } : {},
      terminal,
      fullPath,
      reaches,
      lakeIds: [],
      bounds: boundsOf(fullPath, 32),
      grade: reaches.reduce((g, q) => Math.max(g, q.grade), 0),
      length: r.length,
      maxWidth: Math.max(...r.width)
    });
  }
  for (const lake of lakes) lake.outletRiverId = rivers.find((r) => r.source.lakeId === lake.id)?.id ?? null;
  const ponds = [], swampCoverage = [];
  for (const m of world.swamps || []) {
    if (!m.polygon || m.polygon.length < 3) continue;
    const pondId = id("marsh", m.id), b = m.bounds || boundsOf(m.polygon);
    ponds.push({
      id: pondId,
      kind: "marsh",
      wetlandId: m.id,
      riverId: null,
      center: { x: m.x, z: m.z },
      level: m.level,
      depth: 1.1,
      shoreFade: 8,
      radiusAlong: Math.max(m.radiusX, m.radiusZ),
      radiusAcross: Math.min(m.radiusX, m.radiusZ),
      polygon: m.polygon.map((p) => ({ x: p.x, z: p.z })),
      holes: [],
      bounds: { minX: b.minX, maxX: b.maxX, minZ: b.minZ, maxZ: b.maxZ },
      ports: {},
      closedBasin: false,
      terminal: false,
      outlet: null,
      area: m.area
    });
    swampCoverage.push({ wetlandId: m.id, bodyId: pondId, type: "generated-marsh", region: { center: { x: m.x, z: m.z }, radiusX: m.radiusX, radiusZ: m.radiusZ, yaw: m.yaw } });
  }
  const reachOf = (generatedRiverId, k) => reachIndex.find((e) => e.riverId === generatedRiverId && k >= e.first && k <= e.last)?.reach ?? null;
  const startAccess = planStartAccess(world.rivers, reachOf);
  const counts = { rivers: rivers.length, reaches: reachIndex.length, lakes: lakes.length, ponds: ponds.length, sourcePools: 0, sourceFalls: 0, waterfalls: world.waterfalls.length };
  return freeze2({
    version: GENERATED_WATER_PLAN_VERSION,
    mode: "water-first",
    generated: true,
    topology: "generated-network",
    seed,
    domain: { ...domain },
    seaLevel: sea,
    counts,
    coast: { source: "generated-macro-contour", mouthAngles: [] },
    rivers,
    lakes,
    ponds,
    sourcePools: [],
    headwaters: [],
    headwaterStats: null,
    startAccess,
    lakeDirections: null,
    sourceSpacing: null,
    oceanCourses: null,
    lakeLengths: null,
    longitudinalProfiles: null,
    swampCoverage,
    mountains: [],
    clearings: [{ id: "start", minX: SPAWN.x - 8, maxX: SPAWN.x + 8, minZ: SPAWN.z - 8, maxZ: SPAWN.z + 8 }, { id: "campfire", minX: CAMPFIRE.x - 7, maxX: CAMPFIRE.x + 7, minZ: CAMPFIRE.z - 7, maxZ: CAMPFIRE.z + 7 }],
    limits: { rivers: rivers.length, lakes: lakes.length, ponds: ponds.length, controlStep: 9, renderStep: 3 }
  });
}

// start-access-terrain.js
var clamp10 = (t) => Math.max(0, Math.min(1, t));
var smooth8 = (a, b, x) => {
  const t = clamp10((x - a) / (b - a));
  return t * t * t * (t * (t * 6 - 15) + 10);
};
var mix5 = (a, b, t) => a + (b - a) * t;
function createStartAccessTerrain({ access, height: height2, waterAt }) {
  if (!access?.approach?.to || typeof height2 !== "function" || typeof waterAt !== "function") throw TypeError("Planned near-start river and canonical base height required");
  const { spawn, campfire, approach, level } = access;
  if (![spawn.x, spawn.z, campfire.x, campfire.z, approach.to.x, approach.to.z, level].every(Number.isFinite)) throw TypeError("Finite start-access anchors required");
  const startY = height2(spawn.x, spawn.z);
  if (!Number.isFinite(startY) || startY < level + 0.2 || waterAt(spawn.x, spawn.z, startY)) throw RangeError("Planned start must already have dry river-fitted ground");
  const endY = height2(approach.to.x, approach.to.z);
  if (!Number.isFinite(endY) || endY < level + 0.2 || waterAt(approach.to.x, approach.to.z, endY)) throw RangeError("Planned river approach must finish on dry ground");
  const make = (a, b, ay, by, radius) => {
    const dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx, dz);
    if (length < 1) throw RangeError("Collapsed access route");
    return { a, b, dx, dz, length2: length * length, length, ay, by, radius, minX: Math.min(a.x, b.x) - radius, maxX: Math.max(a.x, b.x) + radius, minZ: Math.min(a.z, b.z) - radius, maxZ: Math.max(a.z, b.z) + radius };
  };
  const paths = [make(campfire, spawn, startY, startY, 6), make(spawn, approach.to, startY, endY, approach.radius ?? 6)];
  if (paths.some((p) => Math.abs(p.by - p.ay) / p.length > 0.25)) throw RangeError("Start river approach is too steep");
  function applyHeight(x, z, original) {
    let uncovered = 1;
    for (const p of paths) {
      if (x < p.minX || x > p.maxX || z < p.minZ || z > p.maxZ) continue;
      const t2 = clamp10(((x - p.a.x) * p.dx + (z - p.a.z) * p.dz) / p.length2), distance = Math.hypot(x - p.a.x - t2 * p.dx, z - p.a.z - t2 * p.dz), w = 1 - smooth8(2, p.radius, distance);
      uncovered *= 1 - w;
    }
    const main = paths[1], t = ((x - spawn.x) * main.dx + (z - spawn.z) * main.dz) / main.length2;
    return mix5(original, mix5(startY, endY, t), 1 - uncovered);
  }
  function sample(x, z) {
    return applyHeight(x, z, height2(x, z));
  }
  let checks = 0, maxGrade = 0;
  for (const p of paths) {
    const count = Math.ceil(p.length / 1.25);
    let previous = null;
    for (let i = 0; i <= count; i++) {
      const t = i / count, x = mix5(p.a.x, p.b.x, t), z = mix5(p.a.z, p.b.z, t), y = sample(x, z);
      if (waterAt(x, z, y)) throw RangeError("Start access intersects generated water");
      if (previous !== null) maxGrade = Math.max(maxGrade, Math.abs(y - previous) / (p.length / count));
      previous = y;
      checks++;
    }
  }
  return Object.freeze({ height: sample, applyHeight, stats: Object.freeze({ version: "seed-directed-start-access-v2-natural-elevation", startHeight: startY, bankApproachHeight: endY, approachLength: paths[1].length, maxGrade, checks, paths: paths.map((p) => Object.freeze({ from: p.a, to: p.b, radius: p.radius })) }) });
}

// seeded-landmarks.js
var SEEDED_LANDMARK_LIMITS = Object.freeze({ revision: "seeded-authored-landmarks-v99-r1", sampleStep: 3, waterPad: 12, shorePad: 18, primaryProbes: 288, gridSide: 28, maxProbesPerType: 1072 });
var FIXED_START_RESERVATIONS = Object.freeze([Object.freeze({ id: "spawn", x: -4, z: 20, radius: 18 }), Object.freeze({ id: "camp", x: -6, z: 11, radius: 14 })]);
var TYPES2 = Object.freeze([
  Object.freeze({ type: "shrine", id: "landmark:shrine", name: "風詠みの祭壇", radius: 14, feather: 18, clear: 14, maxRelief: 4.5, maxGrade: 0.28 }),
  Object.freeze({ type: "boss", id: "landmark:boss", name: "朽ちた王庭", radius: 19, feather: 22, clear: 18, maxRelief: 5, maxGrade: 0.24 }),
  Object.freeze({ type: "memory", id: "landmark:wind-memory", name: "風の記憶碑", radius: 8, feather: 12, clear: 7.4, maxRelief: 3, maxGrade: 0.32 })
]);
var clamp11 = (v) => Math.max(0, Math.min(1, v));
var smooth9 = (v) => {
  const t = clamp11(v);
  return t * t * t * (t * (t * 6 - 15) + 10);
};
function hash(seed, type, index2, salt) {
  let h = (seed ^ Math.imul(type + 1, 2654435761) ^ Math.imul(index2 + 1, 2246822507) ^ Math.imul(salt + 1, 3266489909)) >>> 0;
  h = Math.imul(h ^ h >>> 16, 2146121005);
  h = Math.imul(h ^ h >>> 15, 2221713035);
  return ((h ^ h >>> 16) >>> 0) / 4294967296;
}
var freeze3 = (v) => {
  if (v && typeof v === "object" && !Object.isFrozen(v)) {
    for (const q of Object.values(v)) freeze3(q);
    Object.freeze(v);
  }
  return v;
};
function createSeededLandmarkPlan({ seed, island, height: height2, waterAt, nearWater, reserved = FIXED_START_RESERVATIONS } = {}) {
  if (!Number.isSafeInteger(seed) || island?.seed !== seed || !island?.params || typeof island.isLandExtent !== "function" || typeof island.shoreDistance !== "function" || typeof height2 !== "function" || typeof waterAt !== "function" || typeof nearWater !== "function") throw TypeError("Seeded landmark sites require matching island and pre-foundation height/water queries");
  if (!Array.isArray(reserved) || reserved.some((r) => ![r.x, r.z, r.radius].every(Number.isFinite) || r.radius < 0)) throw TypeError("Reserved sites require finite circles");
  const p = island.params, sites = [], byType = {}, stats = { revision: SEEDED_LANDMARK_LIMITS.revision, candidateProbes: 0, heightSamples: 0, waterSamples: 0, reservedFootprints: reserved.map((r) => ({ id: r.id ?? null, x: r.x, z: r.z, radius: r.radius })), sites: [] };
  const h = (x, z) => {
    stats.heightSamples++;
    return height2(x, z);
  };
  function inspect(spec, x, z) {
    const outer = spec.radius + spec.feather;
    if (!island.isLandExtent(x, z) || island.shoreDistance(x, z) < outer + SEEDED_LANDMARK_LIMITS.shorePad) return null;
    if (reserved.some((r) => Math.hypot(x - r.x, z - r.z) < outer + r.radius + 12) || sites.some((r) => Math.hypot(x - r.x, z - r.z) < outer + r.radius + r.feather + 18)) return null;
    const level = h(x, z);
    if (!Number.isFinite(level) || level < p.seaLevel + 3) return null;
    const gx = (h(x + 4, z) - h(x - 4, z)) / 8, gz = (h(x, z + 4) - h(x, z - 4)) / 8;
    if (!Number.isFinite(gx + gz) || Math.hypot(gx, gz) > spec.maxGrade) return null;
    let min = Infinity, max = -Infinity, samples = 0;
    const step = SEEDED_LANDMARK_LIMITS.sampleStep, n = Math.ceil(outer / step);
    for (let iz = -n; iz <= n; iz++) for (let ix = -n; ix <= n; ix++) {
      const dx = ix * step, dz = iz * step, dist = Math.hypot(dx, dz);
      if (dist > outer + step * Math.SQRT2) continue;
      const xx = x + dx, zz = z + dz, y = h(xx, zz);
      samples++;
      if (!Number.isFinite(y) || y < p.seaLevel + 2 || !island.isLandExtent(xx, zz) || island.shoreDistance(xx, zz) < SEEDED_LANDMARK_LIMITS.shorePad) return null;
      stats.waterSamples++;
      if (waterAt(xx, zz, y) || nearWater(xx, zz, SEEDED_LANDMARK_LIMITS.waterPad)) return null;
      if (dist <= spec.radius) {
        min = Math.min(min, y);
        max = Math.max(max, y);
        if (max - min > spec.maxRelief) return null;
      }
      if (Math.abs(y - level) > spec.maxRelief + spec.feather * 0.28) return null;
    }
    return { level, min, max, samples };
  }
  for (let type = 0; type < TYPES2.length; type++) {
    const spec = TYPES2[type], begin = stats.candidateProbes;
    let selected = null;
    const attempt = (x, z, phase, index2) => {
      stats.candidateProbes++;
      const fit = inspect(spec, x, z);
      if (fit) {
        selected = { ...spec, x, z, y: fit.level, level: fit.level, yaw: 0, seed, sitePhase: phase, siteIndex: index2, bounds: { minX: x - spec.radius - spec.feather, maxX: x + spec.radius + spec.feather, minZ: z - spec.radius - spec.feather, maxZ: z + spec.radius + spec.feather }, fit: { minimumHeight: fit.min, maximumHeight: fit.max, footprintSamples: fit.samples } };
        return true;
      }
      return false;
    };
    for (let i = 0; i < SEEDED_LANDMARK_LIMITS.primaryProbes && !selected; i++) {
      const band = i < 96 ? 0 : 1, j = band ? i - 96 : i, count = band ? 192 : 96, angle = (j + 0.5) * 2.399963229728653 + hash(seed, type, 0, 11) * Math.PI * 2;
      const r = (band ? 0.2 : 0.09) + Math.sqrt((j + hash(seed, type, i, 12)) / count) * (band ? 0.45 : 0.3);
      attempt(p.centerX + Math.cos(angle) * p.radiusX * r, p.centerZ + Math.sin(angle) * p.radiusZ * r, "rings", i);
    }
    if (!selected) {
      const side = SEEDED_LANDMARK_LIMITS.gridSide, order = Array.from({ length: side * side }, (_, i) => i).sort((a, b) => hash(seed, type, a, 31) - hash(seed, type, b, 31) || a - b);
      for (const i of order) {
        const ix = i % side, iz = Math.floor(i / side), u = ((ix + 0.2 + 0.6 * hash(seed, type, i, 32)) / side * 2 - 1) * 0.76, v = ((iz + 0.2 + 0.6 * hash(seed, type, i, 33)) / side * 2 - 1) * 0.76;
        if (attempt(p.centerX + u * p.radiusX, p.centerZ + v * p.radiusZ, "expanded-grid", i)) break;
      }
    }
    if (!selected) throw new Error("No dry, low-relief seeded landmark site for " + spec.type + " after " + (stats.candidateProbes - begin) + " bounded probes (seed " + seed + ")");
    if (spec.type === "cave") {
      selected.caveId = "moonveil";
      selected.caveSeed = seed;
      selected.returnPose = { x: selected.x, z: selected.z + 7, y: selected.level, yaw: 0 };
    } else if (spec.type === "shrine") selected.returnPose = { x: selected.x, z: selected.z + 8, y: selected.level, yaw: 0 };
    stats.sites.push({ type: spec.type, probes: stats.candidateProbes - begin, phase: selected.sitePhase });
    sites.push(selected);
    byType[spec.type] = selected;
  }
  const applyLandmarkGround = (x, z, base) => {
    if (!Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(base)) throw TypeError("Finite landmark ground coordinates/height required");
    for (let i = 0; i < sites.length; i++) {
      const site = sites[i], reach = site.radius + site.feather, dx = x - site.x, dz = z - site.z;
      if (dx >= reach || dx <= -reach || dz >= reach || dz <= -reach) continue;
      const d = Math.hypot(dx, dz);
      if (d >= reach) continue;
      if (d <= site.radius) return site.level;
      const t = smooth9((d - site.radius) / site.feather);
      return site.level + (base - site.level) * t;
    }
    return base;
  };
  return freeze3({ seed, revision: SEEDED_LANDMARK_LIMITS.revision, sites, byType, stats, applyLandmarkGround });
}

// underworld-plan.js
var UNDERWORLD = Object.freeze({
  revision: "underworld-v102-r1",
  mouths: Object.freeze({
    grid: 22,
    minSlope: 0.58,
    maxSlope: 1.7,
    spacing: 290,
    perKm2: 1.35,
    max: 18,
    min: 6,
    width: 3.1,
    height: 5.6,
    alcove: 5.2,
    notch: 2.6,
    apron: 9,
    feather: 5.5,
    shore: 40,
    water: 12
  }),
  stamp: Object.freeze({ hide: 1.95 })
});
var TAU7 = Math.PI * 2;
var clamp12 = (v, a, b) => v < a ? a : v > b ? b : v;
var smooth10 = (a, b, v) => {
  const t = clamp12((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
var MOUTH_NAMES = ["風穴", "苔の岩屋", "白岩の洞", "霧の洞", "鳴き岩の洞", "狐の穴", "岩窟", "黒岩の口", "雫の洞", "石の喉", "夕影の洞", "谷底の洞", "影の岩屋", "鷲岩の洞", "冷えた洞", "眠りの口"];
var OLD_ENTRANCES = Object.freeze({
  moonveil: Object.freeze({ width: 3.95, height: 5.2, at: -7.1, cut: 6.4, notch: 6.2, trigger: Object.freeze([-1.6, -4.6]), half: 2.1 }),
  mine: Object.freeze({ width: 1.7, height: 2.6, at: -2.2, cut: 3.55, notch: 4.3, arch: 1.4, inner: 1.16, roof: 2.3, dark: -0.75, trigger: Object.freeze([-0.3, -0.65]), props: Object.freeze([["quarry-stone-pile", -3.4, 2.3, 0.5], ["miners-tools", 2.9, 2.7, -0.4]]) }),
  root: Object.freeze({ width: 2, height: 3.2, at: -2.2, cut: 3.95, notch: 4.8, arch: 1.7, inner: 1.46, roof: 2.3, dark: -0.75, trigger: Object.freeze([-0.3, -0.65]), props: Object.freeze([["split-log-stack", -3.6, 2.2, 1.2]]) })
});
function mouthSites({ island, height: height2, macro, waterAt, nearWater, marshDistance, seaLevel, reserved, random, seed }) {
  const M = UNDERWORLD.mouths, b = island.landBounds, out = [];
  for (let z = b.minZ + M.grid * 0.5; z < b.maxZ; z += M.grid) for (let x = b.minX + M.grid * 0.5; x < b.maxX; x += M.grid) {
    const px = x + (hash2(Math.round(x), Math.round(z), seed ^ 20973) - 0.5) * M.grid * 0.8, pz = z + (hash2(Math.round(z), Math.round(x), seed ^ 11130) - 0.5) * M.grid * 0.8;
    if (!island.isLandExtent(px, pz)) continue;
    const mg = Math.hypot(macro(px + 6, pz) - macro(px - 6, pz), macro(px, pz + 6) - macro(px, pz - 6)) / 12;
    if (mg < M.minSlope * 0.45) continue;
    const h = height2(px, pz), gx = (height2(px + 4, pz) - height2(px - 4, pz)) / 8, gz = (height2(px, pz + 4) - height2(px, pz - 4)) / 8, grade = Math.hypot(gx, gz);
    if (!(grade >= M.minSlope && grade <= M.maxSlope) || h < seaLevel + 4) continue;
    out.push({ x: px, z: pz, h, dx: gx / grade, dz: gz / grade, grade });
  }
  const fits = [];
  for (const c2 of out) {
    if (reserved.some((r) => Math.hypot(c2.x - r.x, c2.z - r.z) < r.radius + 26)) continue;
    if (island.shoreDistance(c2.x, c2.z) < M.shore) continue;
    if (marshDistance && marshDistance(c2.x, c2.z) > -30) continue;
    const D = [c2.dx, c2.dz], T = [-c2.dz, c2.dx], at = (u, v) => height2(c2.x + D[0] * u + T[0] * v, c2.z + D[1] * u + T[1] * v);
    const n0 = at(0, 0), rise6 = at(6, 0) - n0, rise14 = at(14, 0) - n0, rise22 = at(22, 0) - n0;
    if (rise6 < 3.4 || rise14 < 7.5 || rise22 < 10.5) continue;
    const sideL = at(0, -9) - n0, sideR = at(0, 9) - n0, sideL2 = at(2, -12) - n0, sideR2 = at(2, 12) - n0;
    if (Math.abs(sideL) > 3.6 || Math.abs(sideR) > 3.6 || Math.abs(sideL2) > 5.5 || Math.abs(sideR2) > 5.5) continue;
    if (at(-14, 0) - n0 > -2 || at(-8, 0) - n0 > 0) continue;
    let wet = false;
    for (const [u, v] of [[0, 0], [-6, 0], [-12, 0], [-6, -6], [-6, 6], [4, 0], [2, -7], [2, 7]]) {
      const x = c2.x + D[0] * u + T[0] * v, z = c2.z + D[1] * u + T[1] * v;
      if (waterAt(x, z, height2(x, z)) || nearWater(x, z, M.water)) {
        wet = true;
        break;
      }
    }
    if (wet) continue;
    const score = -Math.abs(c2.grade - 0.85) * 1.6 + Math.min(1.5, rise22 / 16) - (Math.abs(sideL) + Math.abs(sideR)) * 0.12 + random() * 0.35;
    fits.push({ ...c2, n0, D, T, score, rise: rise14 });
  }
  return fits;
}
function createUnderworldPlan({ seed, island, height: height2, macro, waterAt, nearWater, marshDistance = null, seaLevel = 0, reserved = [], biomeAt = null } = {}) {
  if (!Number.isSafeInteger(seed) || !island?.landBounds || typeof height2 !== "function" || typeof macro !== "function" || typeof waterAt !== "function" || typeof nearWater !== "function") throw new TypeError("The underworld needs the island, its heights and its water");
  const started = typeof performance !== "undefined" ? performance.now() : Date.now();
  const planSeed = hashString(UNDERWORLD.revision + ":" + seed), random = randomSource(planSeed);
  const b = island.landBounds;
  const M = UNDERWORLD.mouths;
  let landArea = 0;
  {
    const s = 64;
    for (let z = b.minZ; z < b.maxZ; z += s) for (let x = b.minX; x < b.maxX; x += s) if (island.isLandExtent(x, z)) landArea += s * s;
  }
  const want = clamp12(Math.round(landArea / 1e6 * M.perKm2), M.min, M.max);
  const sites = mouthSites({ island, height: height2, macro, waterAt, nearWater, marshDistance, seaLevel, reserved, random, seed: planSeed });
  sites.sort((p, q) => q.score - p.score);
  const camp = reserved.find((r) => r.id === "camp") || { x: -6, z: 11 };
  const mouths = [];
  let mainPick = null, mainScore = -Infinity;
  for (const s of sites) {
    const d = Math.hypot(s.x - camp.x, s.z - camp.z);
    if (d < 150 || d > 1200) continue;
    const v = s.score - d / 300;
    if (v > mainScore) {
      mainScore = v;
      mainPick = s;
    }
  }
  if (mainPick ||= sites[0]) mouths.push(mainPick);
  const region = Math.max(320, Math.sqrt(landArea / Math.max(1, want))), best = /* @__PURE__ */ new Map();
  for (const s of sites) {
    const key = Math.floor(s.x / region) + "," + Math.floor(s.z / region), o = best.get(key);
    if (!o || s.score > o.score) best.set(key, s);
  }
  const order = [...[...best.values()].sort((p, q) => q.score - p.score), ...sites];
  for (const s of order) {
    if (mouths.length >= want) break;
    if (mouths.some((m) => Math.hypot(m.x - s.x, m.z - s.z) < M.spacing)) continue;
    mouths.push(s);
  }
  const entrances = mouths.map((m, index2) => {
    const r = randomSource(hashString("mouth:" + index2, planSeed));
    const yaw = Math.atan2(m.D[0], m.D[1]);
    const biome2 = biomeAt ? biomeAt(m.x, m.z) : 0;
    let style = index2 === 0 ? "cave" : r() < 0.22 ? "gate" : (biome2 === 2 || biome2 === 3) && r() < 0.55 ? "mine" : r() < 0.16 ? "mine" : "cave";
    let width = M.width * (0.92 + r() * 0.16), tall = M.height * (0.9 + r() * 0.2);
    const look = randomSource(hashString("mouth-look:" + index2, planSeed));
    if (index2 === 0) style = "moonveil";
    else if (style === "cave" && (biome2 === 0 || biome2 === 4) && look() < 0.5) style = "root";
    const name = index2 === 0 ? "月影の洞窟" : style === "mine" ? "古い坑道" : style === "gate" ? "崩れた門" : style === "root" ? "根喰いの洞穴" : MOUTH_NAMES[(index2 * 7 + Math.floor(r() * 5)) % MOUTH_NAMES.length];
    if (style === "cave" || style === "gate") style = biome2 === 0 || biome2 === 4 ? "root" : "mine";
    const model = OLD_ENTRANCES[style];
    ({ width, height: tall } = model);
    const cut = model.cut, y0 = m.n0 - cut, apron = Math.max(clamp12(cut / m.grade + 1.5, 5, 13), -model.at + 3.5);
    return {
      id: "mouth:" + index2,
      index: index2,
      x: m.x,
      z: m.z,
      y0,
      top: m.n0,
      yaw,
      dir: { x: m.D[0], z: m.D[1] },
      side: { x: m.T[0], z: m.T[1] },
      grade: m.grade,
      style,
      name,
      width,
      height: tall,
      cut,
      alcove: M.alcove,
      notch: model.notch,
      apron,
      feather: M.feather,
      at: model.at,
      exit: model.at - 1.8,
      trigger: { u0: model.at - model.trigger[0], u1: model.at - model.trigger[1], half: model.half ?? model.inner - 0.3 },
      seed: hashString("mouth-shape:" + index2, planSeed)
    };
  });
  {
    const seen = /* @__PURE__ */ new Map();
    for (const e of entrances) {
      const n = seen.get(e.name) || 0;
      seen.set(e.name, n + 1);
      if (n) e.name += ["", "（二）", "（三）", "（四）", "（五）"][Math.min(4, n)];
    }
  }
  const bounds2 = { minX: b.minX, maxX: b.maxX, minZ: b.minZ, maxZ: b.maxZ };
  const interiorInput = { seed, planSeed, bounds: bounds2, entrances: entrances.map((e) => ({ index: e.index, name: e.name, x: e.x, z: e.z })) };
  const data = {
    revision: UNDERWORLD.revision,
    seed,
    planSeed,
    seaLevel,
    bounds: bounds2,
    entrances,
    pits: Object.freeze([]),
    interiorInput,
    stats: { mouths: entrances.length, landArea: Math.round(landArea), mouthCandidates: sites.length, milliseconds: Math.round((typeof performance !== "undefined" ? performance.now() : Date.now()) - started) }
  };
  const stamps = createUnderworldStamps(data);
  let interior = null;
  return Object.freeze({
    ...data,
    applyGround: stamps.applyGround,
    stamps,
    // The inside's plain data: the worker's (adopted when it sends it), or made here when needed first.
    interior() {
      return interior ??= generateAbyss(interiorInput);
    },
    hasInterior: () => !!interior,
    adoptInterior(d) {
      if (!interior && d?.revision === ABYSS.revision && d.seed === seed && d.grid?.sd) interior = d;
      return interior;
    }
  });
}
function createUnderworldStamps(data) {
  const list = [];
  for (const e of data.entrances) {
    const reach = Math.max(e.apron + e.feather + 2, e.notch + e.feather + 2);
    list.push({ kind: 0, e, minX: e.x - reach - 4, maxX: e.x + reach + 4, minZ: e.z - reach - 4, maxZ: e.z + reach + 4 });
  }
  function applyGround(x, z, base) {
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      if (x < s.minX || x > s.maxX || z < s.minZ || z > s.maxZ) continue;
      const e = s.e, dx = x - e.x, dz = z - e.z, u = dx * e.dir.x + dz * e.dir.z, v = dx * e.side.x + dz * e.side.z, av = Math.abs(v);
      if (u > 0) return base;
      const w = (1 - smooth10(0, 1, (av - e.notch) / e.feather)) * (1 - smooth10(0, 1, (-u - e.apron) / e.feather));
      if (w <= 0) return base;
      return base + (e.y0 - base) * w;
    }
    return base;
  }
  return { applyGround, list };
}

// canonical-height-cache.js
var TILE_SHIFT = 7;
var TILE = 1 << TILE_SHIFT;
var TILE_MASK = TILE - 1;
var TILE_CELLS = TILE * TILE;
function createCanonicalHeightCache({ seed, bounds: bounds2, sampleGridHeight, step = 4 / 3, halo = 128, maxBytes = 384 * 1024 * 1024, maxResidentBytes = 160 * 1024 * 1024, outsideLimit = 16384 } = {}) {
  if (!Number.isSafeInteger(seed) || !bounds2 || !["minX", "maxX", "minZ", "maxZ"].every((k) => Number.isFinite(bounds2[k])) || bounds2.minX > bounds2.maxX || bounds2.minZ > bounds2.maxZ || typeof sampleGridHeight !== "function" || !Number.isFinite(step) || step <= 0 || !Number.isFinite(halo) || halo < 0) throw TypeError("Finite seeded canonical grid bounds and sampler required");
  const minIX = Math.floor((bounds2.minX - halo) / step), maxIX = Math.ceil((bounds2.maxX + halo) / step), minIZ = Math.floor((bounds2.minZ - halo) / step), maxIZ = Math.ceil((bounds2.maxZ + halo) / step);
  const width = maxIX - minIX + 1, rows = maxIZ - minIZ + 1, total = width * rows, bytes = total * 8;
  if (![minIX, maxIX, minIZ, maxIZ, total].every(Number.isSafeInteger) || total < 1 || !Number.isFinite(maxBytes) || bytes > maxBytes || !Number.isInteger(outsideLimit) || outsideLimit < 0 || outsideLimit > 3e5) throw RangeError("Canonical height cache exceeds finite storage limits");
  const tilesX = Math.ceil(width / TILE), tilesZ = Math.ceil(rows / TILE);
  let tiles = new Array(tilesX * tilesZ).fill(null), tileCount = 0, cursor = 0, prepared = 0, disposed = false, outsideCount = 0, clock = 0, evicted = 0;
  const used = new Float64Array(tilesX * tilesZ), maxTiles = Math.max(16, Math.floor(maxResidentBytes / (TILE_CELLS * 8)));
  const outsideRows = /* @__PURE__ */ new Map();
  const counters = { lookups: 0, hits: 0, demandPrepared: 0, preloadPrepared: 0, outsideLookups: 0, outsideHits: 0, outsideSamples: 0, outsideClears: 0, disposedSamples: 0 };
  function evictOne() {
    let oldest = -1, age = Infinity;
    for (let k = 0; k < tiles.length; k++) if (tiles[k] && used[k] < age) {
      age = used[k];
      oldest = k;
    }
    if (oldest < 0) return;
    const tile = tiles[oldest];
    for (let i = 0; i < TILE_CELLS; i++) if (tile[i] === tile[i]) prepared--;
    tiles[oldest] = null;
    tileCount--;
    evicted++;
  }
  function tileFor(lx, lz) {
    const key = (lz >> TILE_SHIFT) * tilesX + (lx >> TILE_SHIFT);
    let tile = tiles[key];
    if (!tile) {
      if (tileCount >= maxTiles) evictOne();
      tile = tiles[key] = new Float64Array(TILE_CELLS).fill(NaN);
      tileCount++;
    }
    used[key] = ++clock;
    return tile;
  }
  function sample(ix, iz) {
    const y = sampleGridHeight(ix, iz);
    if (!Number.isFinite(y)) throw TypeError("Canonical grid height must be finite");
    return y;
  }
  function outside(ix, iz) {
    counters.outsideLookups++;
    let row2 = outsideRows.get(iz), y = row2?.get(ix);
    if (y !== void 0) {
      counters.outsideHits++;
      return y;
    }
    y = sample(ix, iz);
    counters.outsideSamples++;
    if (outsideLimit) {
      if (outsideCount >= outsideLimit) {
        outsideRows.clear();
        outsideCount = 0;
        counters.outsideClears++;
      }
      row2 = outsideRows.get(iz);
      if (!row2) {
        row2 = /* @__PURE__ */ new Map();
        outsideRows.set(iz, row2);
      }
      row2.set(ix, y);
      outsideCount++;
    }
    return y;
  }
  function lookup(ix, iz) {
    if (!Number.isFinite(ix) || !Number.isFinite(iz)) throw TypeError("Finite canonical grid indices required");
    counters.lookups++;
    if (disposed) {
      counters.disposedSamples++;
      return sample(ix, iz);
    }
    if (!Number.isInteger(ix) || !Number.isInteger(iz) || ix < minIX || ix > maxIX || iz < minIZ || iz > maxIZ) return outside(ix, iz);
    const lx = ix - minIX, lz = iz - minIZ, tile = tileFor(lx, lz), index2 = (lz & TILE_MASK) << TILE_SHIFT | lx & TILE_MASK, old = tile[index2];
    if (old === old) {
      counters.hits++;
      return old;
    }
    const y = sample(ix, iz);
    tile[index2] = y;
    prepared++;
    counters.demandPrepared++;
    return y;
  }
  function snapshot() {
    return { seed, step, halo, minIX, maxIX, minIZ, maxIZ, width, rows, total, bytes, residentBytes: tileCount * TILE_CELLS * 8, allocated: tileCount > 0, tiles: tileCount, maxTiles, evicted, tileCells: TILE_CELLS, prepared, remaining: total - prepared, scanned: cursor, complete: prepared === total, disposed, outsideLimit, outsideEntries: outsideCount, ...counters };
  }
  function fill(ix, iz) {
    const lx = ix - minIX, lz = iz - minIZ, tile = tileFor(lx, lz), index2 = (lz & TILE_MASK) << TILE_SHIFT | lx & TILE_MASK;
    if (tile[index2] === tile[index2]) return false;
    tile[index2] = sample(ix, iz);
    prepared++;
    counters.preloadPrepared++;
    return true;
  }
  function* prepare({ batchCells = 512, signal = null } = {}) {
    if (!Number.isInteger(batchCells) || batchCells < 1 || batchCells > 16384) throw RangeError("Preparation batch must be 1–16384 cells");
    while (!disposed && cursor < total) {
      if (signal?.aborted) return { ...snapshot(), cancelled: true };
      const start = cursor, stop = Math.min(total, cursor + batchCells);
      let added = 0;
      while (cursor < stop) {
        const row2 = Math.floor(cursor / width), column = cursor - row2 * width;
        if (fill(minIX + column, minIZ + row2)) added++;
        cursor++;
      }
      yield { ...snapshot(), batchScanned: cursor - start, batchPrepared: added };
    }
    return { ...snapshot(), cancelled: false };
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    tiles = [];
    tileCount = 0;
    outsideRows.clear();
    outsideCount = 0;
  }
  function windowRange(b) {
    return [Math.max(minIX, Math.floor(b.minX / step)), Math.min(maxIX, Math.ceil(b.maxX / step)), Math.max(minIZ, Math.floor(b.minZ / step)), Math.min(maxIZ, Math.ceil(b.maxZ / step))];
  }
  function* prepareWindow(b, { batchCells = 512, signal = null } = {}) {
    if (!b || ![b.minX, b.maxX, b.minZ, b.maxZ].every(Number.isFinite)) throw TypeError("Finite preparation window required");
    const [x0, x1, z0, z1] = windowRange(b);
    let added = 0;
    for (let iz = z0; iz <= z1 && !disposed; iz++) {
      if (signal?.aborted) return { ...snapshot(), cancelled: true };
      for (let ix = x0; ix <= x1; ix++) if (fill(ix, iz)) added++;
      if (added >= batchCells) {
        added = 0;
        yield { ...snapshot(), window: true };
      }
    }
    return { ...snapshot(), cancelled: false };
  }
  function windowCells(b) {
    const [x0, x1, z0, z1] = windowRange(b);
    return Math.max(0, x1 - x0 + 1) * Math.max(0, z1 - z0 + 1);
  }
  return Object.freeze({ lookup, prepare, prepareWindow, windowCells, snapshot, dispose });
}

// river-bank-resource.js
var RIVER_BANK_RESOURCE_LIMITS = Object.freeze({ maxChannelDistance: 30, minRise: -0.3, ordinaryMaxRise: 5.4, upperMaxRise: 32, upperRiseBoost: 26.6, minSlope: 0.28 });
function createUpperRiverBankRockAllowed({ hydrology: hydrology2, terrainFunctions, morphology } = {}) {
  const f2 = terrainFunctions, geometry = hydrology2?.geometry;
  if (typeof f2?.height !== "function" || typeof f2?.slope !== "function" || typeof f2?.projectChannel !== "function" || typeof hydrology2?.waterAt !== "function") throw TypeError("Canonical terrain and hydrology queries required");
  const context = morphology ?? (geometry?.plan ? getRiverReachMorphology({ plan: geometry.plan, geometry }) : null), scratch2 = {}, L = RIVER_BANK_RESOURCE_LIMITS;
  return function upperRiverBankRockAllowed(x, z, y = f2.height(x, z)) {
    const channel2 = f2.projectChannel(x, z, L.maxChannelDistance);
    if (!channel2 || !(y >= channel2.level + L.minRise)) return false;
    if (y > channel2.level + L.ordinaryMaxRise) {
      if (y > channel2.level + L.upperMaxRise) return false;
      const m = context?.sample(x, z, scratch2);
      if (!m || m.featureId !== channel2.featureId || !(y <= channel2.level + (L.ordinaryMaxRise + L.upperRiseBoost * m.upper))) return false;
    }
    return f2.slope(x, z) >= L.minSlope && !hydrology2.waterAt(x, z, y);
  };
}

// terrain-core.js
var SEED = ISLAND_BIOME_SEED;
var mix6 = MathUtils.lerp;
function hash3(x, z = 0) {
  let n = Math.sin(x * 127.1 + z * 311.7 + SEED * 0.013) * 43758.5453;
  return n - Math.floor(n);
}
function noise3(x, z) {
  const i = Math.floor(x), j = Math.floor(z), u = x - i, v = z - j;
  const a = u * u * (3 - 2 * u), b = v * v * (3 - 2 * v);
  return mix6(mix6(hash3(i, j), hash3(i + 1, j), a), mix6(hash3(i, j + 1), hash3(i + 1, j + 1), a), b);
}
var islandTerrain = worldModel.island;
var terrainSampler = worldModel.sampler;
function baseContinuousHeight(x, z) {
  return terrainSampler.height(x, z);
}
var waterFirstPlan = createGeneratedWaterPlan(worldModel);
var waterFirstGeometry = compileWaterFirstGeometry(waterFirstPlan);
var hydrology = createWaterFirstRuntime({ plan: waterFirstPlan, geometry: waterFirstGeometry, island: islandTerrain });
hydrology.setFinalHeight(baseContinuousHeight);
function noStartAccess(height2) {
  return Object.freeze({ height: height2, applyHeight: (x, z, original) => original, stats: Object.freeze({ version: "generated-no-start-access", paths: Object.freeze([]) }) });
}
var startAccessTerrain = noStartAccess(baseContinuousHeight);
if (waterFirstPlan.startAccess) {
  try {
    startAccessTerrain = createStartAccessTerrain({ access: waterFirstPlan.startAccess, height: baseContinuousHeight, waterAt: hydrology.waterAt });
  } catch (error) {
    console.info("Start access path skipped:", error.message);
  }
}
hydrology.setFinalHeight(startAccessTerrain.height);
var landmarkPlan = createSeededLandmarkPlan({
  seed: SEED,
  island: islandTerrain,
  height: startAccessTerrain.height,
  waterAt: hydrology.waterAt,
  nearWater: hydrology.nearWater,
  reserved: [{ x: -4, z: 20, radius: 20 }, { x: -6, z: 11, radius: 16 }]
});
var hydrologyPreparation = Object.freeze({ mode: "generated", seed: SEED, counts: waterFirstPlan.counts, world: worldModel.timings, startAccess: startAccessTerrain.stats, landmarks: landmarkPlan.stats });
function preMouthHeight(x, z) {
  return landmarkPlan.applyLandmarkGround(x, z, startAccessTerrain.height(x, z));
}
var underworldPlan = createUnderworldPlan({
  seed: SEED,
  island: islandTerrain,
  height: preMouthHeight,
  macro: terrainSampler.macro,
  waterAt: hydrology.waterAt,
  nearWater: hydrology.nearWater,
  marshDistance: terrainSampler.marshDistance,
  seaLevel: islandTerrain.params.seaLevel,
  reserved: [{ id: "spawn", x: -4, z: 20, radius: 20 }, { id: "camp", x: -6, z: 11, radius: 16 }, ...landmarkPlan.sites.map((s) => ({ id: s.type, x: s.x, z: s.z, radius: s.radius + s.feather }))],
  biomeAt: (x, z) => islandBiomes.biomeId(x, z, preMouthHeight(x, z))
});
function continuousHeight(x, z) {
  return underworldPlan.applyGround(x, z, preMouthHeight(x, z));
}
var DISTANT_SINK = Object.freeze({ wet: 0.9 });
var DISTANT_SEA = worldModel.seaLevel;
setFarCoastSeaLevel(DISTANT_SEA);
function distantHeight(x, z) {
  const wet = terrainSampler.wetAt(x, z), h = continuousHeight(x, z);
  return h - DISTANT_SINK.wet * wet - (wet > 0 ? farCoastStep(h, DISTANT_SEA, 0) - farCoastStep(h, DISTANT_SEA, wet) : 0);
}
function backdropHeight(x, z) {
  const wet = terrainSampler.wetAt(x, z);
  return farCoastStep(continuousHeight(x, z), DISTANT_SEA, wet) - 0.4 * wet;
}
function mapHeight(x, z) {
  return terrainSampler.macro(x, z);
}
function riverX(z) {
  const section = channelSections(z)[0];
  return section ? section.x : islandTerrain.landBounds.maxX + CHUNK * 4;
}
var HEIGHT_STEP = 4 / 3;
var canonicalHeightCache = createCanonicalHeightCache({
  seed: SEED,
  bounds: islandTerrain.landBounds,
  step: HEIGHT_STEP,
  sampleGridHeight: (ix, iz) => continuousHeight(ix * HEIGHT_STEP, iz * HEIGHT_STEP)
});
function gridHeight(ix, iz) {
  return canonicalHeightCache.lookup(ix, iz);
}
function height(x, z) {
  const gx = x / HEIGHT_STEP, gz = z / HEIGHT_STEP, ix = Math.floor(gx), iz = Math.floor(gz), u = gx - ix, v = gz - iz, a = gridHeight(ix, iz), b = gridHeight(ix + 1, iz), c2 = gridHeight(ix, iz + 1), d = gridHeight(ix + 1, iz + 1);
  return u + v <= 1 ? a + (b - a) * u + (c2 - a) * v : d + (c2 - d) * (1 - u) + (b - d) * (1 - v);
}
hydrology.setFinalHeight(height);
var hydrologyEnvironment = createWaterFirstEnvironment({ plan: waterFirstPlan, hydrology, island: islandTerrain, height, slope });
function projectChannel(x, z, maxDistance = 128) {
  return hydrology.projectChannel(x, z, maxDistance);
}
function channelSections(z) {
  return hydrology.channelSections(z);
}
var bankResourceAllowed = createUpperRiverBankRockAllowed({ hydrology, terrainFunctions: { height, slope, projectChannel } });
function riverBankRockAllowed(x, z, y = height(x, z)) {
  return bankResourceAllowed(x, z, y);
}
function slope(x, z) {
  return Math.hypot(height(x + 0.6, z) - height(x - 0.6, z), height(x, z + 0.6) - height(x, z - 0.6)) / 1.2;
}
var BIOMES = ISLAND_BIOME_DEFINITIONS;
function climate2(x, z, altitude, out) {
  return islandBiomes.sample(x, z, Number.isFinite(altitude) ? altitude : height(x, z), out);
}
function biome(x, z, altitude) {
  return BIOMES[islandBiomes.biomeId(x, z, Number.isFinite(altitude) ? altitude : height(x, z))];
}
function terrainFunctionsBase() {
  return { height, noise: noise3, hash: hash3, biome, climate: climate2, slope, riverX, projectChannel, channelSections, riverBankRockAllowed, coastAt: terrainSampler.coastAt, seaLevel: worldModel.seaLevel, environmentAt: hydrologyEnvironment.environmentAt, waterAt: hydrology.waterAt, nearWater: hydrology.nearWater, surfaceAt: hydrology.surfaceAt, waterReservations: hydrology.reservations };
}

export {
  ordinaryRockWaterAllowed,
  COAST_BOULDERS,
  ordinaryRockCoastAllowed,
  coastalBouldersPossible,
  coastalBoulderCandidate,
  vegetationClimate,
  vegetationCover,
  vegetationSpecies,
  vegetationLeafless,
  vegetationTint,
  vegetationChunkCover,
  getRiverReachMorphology,
  RIVER_BANK_SURFACE,
  riverBankPatchAt,
  riverBankSurfaceAt,
  patchRiverBankSurfaceShader,
  legacyPlacementSlot,
  rememberPlacementSlot,
  reservationTreeSpecies,
  installTreeReservationResolver,
  treePlacementAllowed,
  rockPlacementAllowed,
  logPlacementAllowed,
  contactPatchAllowed,
  pruneReservedDecorSteps,
  ROCK_SLOTS,
  ROCK_SIZES,
  rockSlotRadius,
  chunkRng,
  TREE_PLACEMENT_SLOTS,
  coastBare,
  inMarshBasin,
  marshTreeThinned,
  treeSpotOffRocks,
  treePlacementCandidate,
  treeCharacter,
  activateFinalTreePlacement,
  finalTreePlacementStatus,
  revokeFinalTreePlacement,
  scheduleTask,
  scheduleTaskNow,
  scheduleIdleTask,
  cancelTask,
  yieldTask,
  MINERAL_SURFACE_GRADIENT_GLSL,
  TEMPERATE_MINERAL_GLSL,
  MATERIAL_ALBEDO,
  createRockPlan,
  generateRockGeometry,
  ROCK_FORM,
  chooseRockFamily,
  rockFormMatrix,
  createProceduralRockLibrary,
  createRockEnvelopeSampler,
  rockEnvelopeContains,
  fillHabitatBytes,
  sampleHabitat,
  releaseHabitatCache,
  prepareHabitatObstaclesSteps,
  plantPositionAllowed,
  habitatAt,
  habitatMeadowPlanned,
  rebuildHabitatMeadowSteps,
  planHabitatMeadowSteps,
  replaceHabitatShrubsSteps,
  landmarksNear,
  meadowDensity,
  meadowCountMax,
  meadowCountSteps,
  grassPlacementsSteps,
  fernPlacementsSteps,
  FAR_COAST,
  patchFarCoastBackdrop,
  markFarCoastBaked,
  patchFarCoast,
  createSeededBridgeIntents,
  prewarmSeededBridges,
  buildMarshRiparianModel,
  RIPARIAN_LIMITS,
  selectRiparian,
  createRiverCobbleGeometry,
  GRAVEL_LIMITS,
  selectRiverGravel,
  createRiverGravelGeometry,
  riparianOptions,
  planRiparianBaseSteps,
  frozenMarks,
  refreeze,
  OLD_ENTRANCES,
  SEED,
  hash3 as hash,
  noise3 as noise,
  islandTerrain,
  waterFirstPlan,
  waterFirstGeometry,
  hydrology,
  startAccessTerrain,
  landmarkPlan,
  hydrologyPreparation,
  preMouthHeight,
  underworldPlan,
  DISTANT_SEA,
  distantHeight,
  backdropHeight,
  mapHeight,
  riverX,
  HEIGHT_STEP,
  canonicalHeightCache,
  height,
  hydrologyEnvironment,
  slope,
  biome,
  terrainFunctionsBase
};
