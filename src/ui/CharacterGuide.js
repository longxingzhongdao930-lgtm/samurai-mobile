import { ENEMY_TIPS } from '../game/combat/CombatCoach.js';
import { ACESFilmicToneMapping, AmbientLight, Clock, DirectionalLight, HemisphereLight, Mesh, MeshBasicMaterial, Box3, Sphere, CircleGeometry, PerspectiveCamera, Scene, WebGLRenderer, LoopOnce, LoopRepeat } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { TOWN_CHARACTERS, TOWN_TYPES } from '../game/data/townCharacters.js';
import { TownEnemy } from '../game/ai/TownEnemy.js';

const canvas = document.querySelector('#portrait');
const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.toneMapping = ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.35;
const scene = new Scene();
scene.add(new HemisphereLight('#d8eeff', '#565048', 2.5), new AmbientLight('#ffffff', 0.7));
for (const [x, z, color, strength] of [[3, 4, '#ffe4bf', 3], [-3, -3, '#80caff', 4]]) {
  const light = new DirectionalLight(color, strength); light.position.set(x, 6, z); scene.add(light);
}
const floor = new Mesh(new CircleGeometry(2.5, 64), new MeshBasicMaterial({ color: '#1c292b' }));
floor.rotation.x = -Math.PI / 2; floor.position.y = -0.015; scene.add(floor);
const camera = new PerspectiveCamera(38, 1, 0.05, 100);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true; controls.enablePan = false; controls.minDistance = 2; controls.maxDistance = 14; controls.maxPolarAngle = Math.PI / 2;
const status = document.querySelector('#load-status');
const motions = [...document.querySelectorAll('[data-motion]')];
let current, source, request = 0, selected;
function free(gltf) {
  const textures = new Set(), geometries = new Set(), materials = new Set();
  gltf?.scene.traverse(node => {
    if (!node.isMesh) return;
    geometries.add(node.geometry);
    for (const m of Array.isArray(node.material) ? node.material : [node.material]) {
      materials.add(m); for (const value of Object.values(m)) if (value?.isTexture) textures.add(value);
    }
    if (node.isSkinnedMesh) node.skeleton.dispose();
  });
  for (const value of [...textures, ...materials, ...geometries]) value.dispose();
}
function play(name) {
  if (!current) return;
  const next = current.mixer.clipAction(current.clips.get(name));
  current.mixer.stopAllAction();
  next.reset().setLoop(name === 'attack0' ? LoopOnce : LoopRepeat, name === 'attack0' ? 1 : Infinity);
  next.clampWhenFinished = name === 'attack0'; next.play();
  for (const button of motions) button.setAttribute('aria-pressed', String(button.dataset.motion === name));
}
async function select(definition) {
  const token = ++request; selected = definition.id;
  for (const card of document.querySelectorAll('.card')) card.setAttribute('aria-pressed', String(card.dataset.id === selected));
  for (const [id, value] of Object.entries({ name: definition.name, role: definition.role, original: definition.label, description: definition.description, location: definition.location, 'motion-note': ENEMY_TIPS[definition.id] ?? (definition.id === 'mage' ? '距離を取り、詠唱から魔弾を放つ。' : definition.procedural ? '間合いを詰め、予備動作から斬撃へつなぐ。' : '爪・翼・巨体を使った固有の攻撃。') })) document.getElementById(id).textContent = value;
  status.textContent = '姿を呼び出しています…'; motions.forEach(b => b.disabled = true);
  try {
    const gltf = await new GLTFLoader().loadAsync(definition.url);
    if (token !== request) { free(gltf); return; }
    current?.dispose(); free(source); source = gltf;
    current = new TownEnemy(gltf, definition, TOWN_TYPES[selected], null);
    scene.add(current.root);
    current.place(0, 0, 0);
    current.mixer.addEventListener('finished', () => play('idle'));
    const h = current.height;
    current.root.updateMatrixWorld(true);
    const bounds = new Box3().setFromObject(current.root).getBoundingSphere(new Sphere());
    const distance = Math.min(h * 3.6, Math.max(h * 2.9, bounds.radius / Math.sin(camera.fov * Math.PI / 360) * 1.15));
    controls.maxDistance = distance * 2;
    controls.target.set(0, h * 0.5, 0);
    camera.position.set(distance * 0.32, h * 0.8, distance * 0.95); controls.update();
    floor.scale.setScalar(h * 0.52);
    play('idle'); motions.forEach(b => b.disabled = false); status.textContent = '';
    window.characterGuide = { current, selected, select, play };
  } catch (error) {
    if (token === request) status.textContent = '読み込めませんでした。カードを選び直してください。';
    console.error(error);
  }
}
for (const [index, definition] of TOWN_CHARACTERS.entries()) {
  const button = document.createElement('button'); button.className = 'card'; button.dataset.id = definition.id;
  button.innerHTML = `<span class="number">0${index + 1}</span><span class="eyebrow">${definition.role}</span><strong>${definition.name}</strong><small>${definition.label}<br>${definition.location}</small>`;
  button.addEventListener('click', () => select(definition)); document.querySelector('#cards').append(button);
}
for (const button of motions) button.addEventListener('click', () => play(button.dataset.motion));
new ResizeObserver(() => {
  const { width, height } = canvas.parentElement.getBoundingClientRect();
  renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix();
}).observe(canvas.parentElement);
const clock = new Clock();
renderer.setAnimationLoop(() => { const dt = Math.min(clock.getDelta(), 0.05); if (!document.hidden) { current?.mixer.update(dt); controls.update(); renderer.render(scene, camera); } });
select(TOWN_CHARACTERS[0]);
