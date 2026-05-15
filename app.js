/* =========================================================
   ФИНАЛЬНЫЙ ОБЪЕДИНЕННЫЙ КОД: СВЕТ + КАРТИНЫ + ФИЗИКА
   ========================================================= */

const CONFIG_PATH = "./config/config.json";
const $ = (sel) => document.querySelector(sel);

/** * 1. УЛУЧШЕННЫЙ КОМПОНЕНТ КОЛЛИЗИЙ (wall-collider)
 * Проверяет 4 направления и выталкивает игрока из стен
 */
AFRAME.registerComponent('wall-collider', {
  init: function () {
    this.raycaster = new THREE.Raycaster();
    this.colliders = [];
    this.playerRadius = 0.4; // Радиус "тела" игрока
    
    const roomEl = document.querySelector('#room');
    roomEl.addEventListener('model-loaded', () => {
      this.colliders = [roomEl.getObject3D('mesh')];
    });
  },

  tick: function () {
    if (this.colliders.length === 0) return;

    const camObj = this.el.object3D;
    const rigObj = document.querySelector('#rig').object3D;
    
    // Получаем позицию в мировых координатах
    const worldPos = new THREE.Vector3();
    camObj.getWorldPosition(worldPos);

    // Лучи в 4 стороны (вперед, назад, влево, вправо)
    const dirs = [
      new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0),
      new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1)
    ];

    dirs.forEach(dir => {
      // Проверяем на уровне колен (0.5м) и на уровне груди (1.2м)
      [0.5, 1.2].forEach(yHeight => {
        const rayOrigin = worldPos.clone();
        rayOrigin.y = yHeight;

        this.raycaster.set(rayOrigin, dir);
        const hits = this.raycaster.intersectObjects(this.colliders, true);

        if (hits.length > 0 && hits[0].distance < this.playerRadius) {
          // Вычисляем, насколько сильно нас нужно вытолкнуть
          const overlap = this.playerRadius - hits[0].distance;
          const pushVec = dir.clone().multiplyScalar(-overlap);
          
          // Применяем выталкивание к rig (основанию камеры)
          rigObj.position.add(pushVec);
        }
      });
    });

    // Фиксация высоты, чтобы не падать под пол
    if (camObj.position.y !== 1.65) camObj.position.y = 1.65;
  }
});

/** * 2. НАСТРОЙКА HDRI СВЕТА
 */
function setupEnvironment(cfg) {
  const envPath = cfg?.ENVIRONMENT?.MAP_PATH;
  if (!envPath) return;
  const sceneEl = $("a-scene");
  const intensity = cfg?.ENVIRONMENT?.INTENSITY ?? 0.5;

  new THREE.TextureLoader().load(envPath, (texture) => {
    texture.mapping = THREE.EquirectangularReflectionMapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    sceneEl.object3D.environment = texture;
    if ("environmentIntensity" in sceneEl.object3D) {
      sceneEl.object3D.environmentIntensity = intensity;
    }
    console.log("✅ HDRI свет загружен");
  });
}

async function buildWorks(root3D, cfg) {
  const works = cfg?.WORKS || [];
  const sceneEl = document.querySelector("a-scene");

  for (const work of works) {
    const slotNum = work.SLOT_ID.split('_')[1]; 
    const hookName = `HOOK_${slotNum}`;
    const winName = `WIN_${slotNum}`;

    const hookObj = root3D.getObjectByName(hookName); // Точка привязки
    const winObj = root3D.getObjectByName(winName);   // Габариты (рамка)

    if (!hookObj || !winObj) {
      console.warn(`Не найдены объекты для: ${work.SLOT_ID}`);
      continue;
    }

    // 1. Считаем размеры из WIN_XX
    const box = new THREE.Box3().setFromObject(winObj);
    const size = new THREE.Vector3();
    box.getSize(size);
    
    // Выбираем ширину (зависит от того, как повернута плоскость в 3D пакете)
    const w = size.x > size.z ? size.x : size.z;
    const h = size.y;

    // 2. Создаем сущность
    const plane = document.createElement("a-entity");
    
    // Используем геометрию и материал через атрибуты
    plane.setAttribute("geometry", {
      primitive: "plane",
      width: w,
      height: h
    });
    
    plane.setAttribute("material", {
      src: `./works/${work.FILE}`,
      shader: "standard",
      side: "double",
      transparent: true
    });

    plane.classList.add("clickable");

    // 3. ПРИВЯЗКА К HOOK:
    // Чтобы позиция и ротация совпали идеально, 
    // используем мировые координаты HOOK_XX
    const worldPos = new THREE.Vector3();
    const worldQuat = new THREE.Quaternion();
    
    hookObj.getWorldPosition(worldPos);
    hookObj.getWorldQuaternion(worldQuat);

    // Добавляем в сцену ПЕРЕД установкой координат (важно для A-Frame)
    sceneEl.appendChild(plane);

    // 4. Применяем трансформации после добавления
    plane.addEventListener('loaded', () => {
      plane.object3D.position.copy(worldPos);
      plane.object3D.quaternion.copy(worldQuat);
    });
    
    plane.addEventListener("click", () => ui.open(work));
  }
}
/** UI панель опису */
const ui = {
  panel: $("#infoPanel"),
  title: $("#infoTitle"),
  meta: $("#infoMeta"),
  desc: $("#infoDesc"),
  closeBtn: $("#closeInfo"),
  open(work) {
    this.title.textContent = work.TITLE || work.WORK_ID || "Без назви";
    const metaParts = [];
    if (work.AUTHOR) metaParts.push(work.AUTHOR);
    if (work.YEAR) metaParts.push(String(work.YEAR));
    if (work.TECHNIQUE) metaParts.push(work.TECHNIQUE);
    this.meta.textContent = metaParts.join(" • ") || "—";
    this.desc.textContent = work.DESCRIPTION || "—";
    this.panel.style.display = "block";
  },
  close() {
    this.panel.style.display = "none";
  }
};

// ГЛАВНЫЙ ЗАПУСК
(async function main() {
  try {
    const res = await fetch(CONFIG_PATH, { cache: "no-store" });
    const cfg = await res.json();
    
    setupEnvironment(cfg);

    const cam = $("#camera");
    const rig = $("#rig");
    const start = cfg?.PLAYER?.START_POSITION || [0, 0, 0];
    
    rig.setAttribute("position", `${start[0]} ${start[1]} ${start[2]}`);
    cam.setAttribute("wall-collider", ""); // Включаем физику

    const room = $("#room");
    room.setAttribute("gltf-model", `url(${cfg.ROOM.GLB_PATH})`);

    room.addEventListener("model-loaded", async () => {
      const root3D = room.getObject3D("mesh");
      if (root3D) {
        // Скрываем шаблоны WIN_XX
        root3D.traverse(child => {
          if (child.name && child.name.toUpperCase().includes("WIN_")) {
            child.visible = false;
          }
        });
        await buildWorks(root3D, cfg);
      }
    });

  } catch (e) { console.error("Ошибка запуска:", e); }
})();