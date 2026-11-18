(() => {
  'use strict';

  const SAVE_KEY = 'nong-trai-1-mua-save-v16';
  const VILLAGE_WORLD_WIDTH = 4608;
  const SEASONS = ['Xuân', 'Hè', 'Thu', 'Đông'];
  const $ = (id) => document.getElementById(id);
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const copy = (value) => JSON.parse(JSON.stringify(value));
  const worldWidth = () => state?.currentMap === 'village' ? VILLAGE_WORLD_WIDTH : data.meta.world.width;

  let data;
  let state;
  let scale = 1;
  let camera = { x: 0, y: 0 };
  let direction = { x: 0, y: 0 };
  let destination = null;
  let walkPath = [];
  let walkPathIndex = 0;
  let pendingAction = null;
  let lastFrame = 0;
  let gameMinute = 360;
  let clockTimer;
  let autoTimer;
  let toastTimer;
  let fishTimer;
  let fishPhase = 0;
  let currentFeed = 'LÀNG';
  let currentMarketTab = 'nongsan';
  let currentHandbookTab = 'cay';
  let currentVillager = null;
  let fishing = false;

  const SEASON_NAMES = ['Mùa xuân', 'Mùa hè', 'Mùa thu', 'Mùa đông'];
  const WEATHER_BY_DAY = ['sunny', 'rain', 'sunny', 'cloudy', 'sunny', 'dry', 'rain', 'sunny', 'cloudy', 'sunny', 'rain', 'sunny', 'dry', 'cloudy', 'sunny', 'rain', 'sunny', 'cloudy', 'dry', 'sunny', 'rain', 'storm', 'sunny', 'cloudy', 'sunny', 'rain', 'sunny', 'dry', 'cloudy', 'sunny'];

  async function boot() {
    try {
      const response = await fetch('./data.json', { cache: 'no-store' });
      if (!response.ok) throw new Error('Không tải được data.json');
      data = await response.json();
    } catch (error) {
      document.body.innerHTML = '<div style="max-width:760px;margin:12vh auto;padding:24px;background:#17131f;color:#ffe6a0;border:3px solid #bd7f3a;font:18px monospace"><h1>Không tải được dữ liệu game</h1><p>Hãy chạy web server trong thư mục <b>farm-game</b>, vì game đọc <code>data.json</code> bằng fetch.</p><p><code>python -m http.server 8931</code></p><p>Mở <code>http://localhost:8931</code></p></div>';
      console.error(error);
      return;
    }
    state = loadSave();
    restorePlayer();
    setWorldHotspots();
    createBuildingObjects();
    createObjectTouchFrames();
    createVillageHomes();
    createPlotButtons();
    bindEvents();
    setWeatherForCurrentDay();
    generateOrders(false);
    addFeed('HỆ THỐNG', 'Chào mừng Arthur đến với Oakshire Valley. Một mùa mới bắt đầu!');
    renderAll();
    updateCamera();
    requestAnimationFrame(frame);
    clockTimer = setInterval(updateClock, 4000);
    autoTimer = setInterval(() => {
      if (state.autoFarm && !isModalOpen()) autoTendOne();
    }, 1800);
  }

  function makeDefaultSave() {
    const inventory = copy(data.startingInventory);
    const tools = {};
    data.hotbar.forEach((item) => { tools[item.id] = item.count; });
    const seedsUnlocked = {};
    data.crops.forEach((crop) => { seedsUnlocked[crop.id] = crop.unlock === 'Mở đầu'; });
    const goods = inventory.goods;
    data.fish.forEach((fish) => { goods[fish.id] = 0; });
    goods['grilled-fish'] = 0;
    return {
      version: 16,
      season: 1,
      day: 1,
      coins: data.meta.startingCoins,
      seasonEarnings: 0,
      xp: 0,
      level: 1,
      energy: data.meta.startingEnergy,
      health: 12,
      water: 8,
      fertilizer: 6,
      tea: 1,
      lunch: 2,
      inventory,
      tools,
      selectedSeed: 'cabbage',
      selectedSlot: 2,
      selectedPlot: null,
      plots: Array.from({ length: data.meta.plotPositions.length }, () => null),
      unlockedCrops: seedsUnlocked,
      harvestCounts: {},
      totalHarvests: 0,
      tutorialStep: 0,
      tutorialDone: false,
      machines: {},
      buildings: { coop: true, barn: true },
      animals: { chicken: 0, cow: 0, bee: 0, sheep: 0 },
      workers: {},
      animalFedToday: false,
      friendship: {},
      orders: [],
      ordersDay: 0,
      prices: {},
      pricesDay: 0,
      weatherId: 'sunny',
      marketMood: 1,
      dailyRewardCount: 0,
      autoFarm: false,
      mapExplored: false,
      jobs: [],
      chat: [],
      player: { x: data.meta.spawn.x, y: data.meta.spawn.y },
      currentMap: 'farm',
      mapPositions: { farm: { x: data.meta.spawn.x, y: data.meta.spawn.y }, village: { x: VILLAGE_WORLD_WIDTH * .5, y: data.meta.world.height * .77 } },
      villageWorldVersion: 2,
      lastPlayed: Date.now(),
      deliveredOrders: 0,
      seasonHistory: []
    };
  }

  function loadSave() {
    const fresh = makeDefaultSave();
    try {
      const saved = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
      if (!saved || typeof saved !== 'object') return fresh;
      const merged = { ...fresh, ...saved };
      merged.inventory = { ...fresh.inventory, ...(saved.inventory || {}) };
      merged.inventory.seeds = { ...fresh.inventory.seeds, ...(saved.inventory?.seeds || {}) };
      merged.inventory.produce = { ...fresh.inventory.produce, ...(saved.inventory?.produce || {}) };
      merged.inventory.goods = { ...fresh.inventory.goods, ...(saved.inventory?.goods || {}) };
      merged.tools = { ...fresh.tools, ...(saved.tools || {}) };
      merged.buildings = { ...fresh.buildings, ...(saved.buildings || {}) };
      merged.buildings.coop = true;
      merged.buildings.barn = true;
      merged.animals = { ...fresh.animals, ...(saved.animals || {}) };
      merged.workers = { ...fresh.workers, ...(saved.workers || {}) };
      merged.unlockedCrops = { ...fresh.unlockedCrops, ...(saved.unlockedCrops || {}) };
      merged.harvestCounts = { ...fresh.harvestCounts, ...(saved.harvestCounts || {}) };
      merged.plots = Array.isArray(saved.plots) ? saved.plots.slice(0, fresh.plots.length) : fresh.plots;
      while (merged.plots.length < fresh.plots.length) merged.plots.push(null);
      merged.player = { ...fresh.player, ...(saved.player || {}) };
      merged.currentMap = saved.currentMap === 'village' ? 'village' : 'farm';
      merged.mapPositions = { ...fresh.mapPositions, ...(saved.mapPositions || {}) };
      if (saved.mapPositions?.village && saved.villageWorldVersion !== 2) merged.mapPositions.village.x *= VILLAGE_WORLD_WIDTH / worldWidth();
      merged.villageWorldVersion = 2;
      merged.chat = Array.isArray(saved.chat) ? saved.chat.slice(-80) : [];
      merged.jobs = Array.isArray(saved.jobs) ? saved.jobs : [];
      merged.orders = Array.isArray(saved.orders) ? saved.orders : [];
      return merged;
    } catch {
      return fresh;
    }
  }

  function save() {
    if (!state) return;
    state.player = { x: Math.round(state.player.x), y: Math.round(state.player.y) };
    state.mapPositions[state.currentMap] = { ...state.player };
    state.lastPlayed = Date.now();
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); }
    catch (error) { console.warn('Không thể lưu game trên trình duyệt.', error); }
  }

  function restorePlayer() {
    state.player = { ...(state.mapPositions[state.currentMap] || state.player) };
    if (blocked(state.player.x, state.player.y)) state.player = nearestFreePosition(state.player);
    const p = $('arthur');
    p.style.left = `${(state.player.x / worldWidth()) * 100}%`;
    p.style.top = `${(state.player.y / data.meta.world.height) * 100}%`;
  }

  function setWorldHotspots() {
    document.querySelectorAll('.world-hotspot[data-object]').forEach((el) => {
      const point = data.meta.hotspots[el.dataset.object];
      if (!point) return;
      el.style.left = `${point.x}%`;
      el.style.top = `${point.y}%`;
      el.style.width = `${point.w || (el.classList.contains('hotspot-villager') ? 5 : 8)}%`;
      el.style.height = `${point.h || (el.classList.contains('hotspot-villager') ? 8 : 12)}%`;
      el.style.transform = 'translate(-50%,-50%)';
    });
    document.querySelectorAll('.village-fair,.village-gate').forEach((el) => {
      const point = el.classList.contains('village-fair') ? { x: 50, y: 55, w: 10, h: 10 } : { x: 50, y: 94, w: 14, h: 10 };
      el.style.left = `${point.x}%`; el.style.top = `${point.y}%`; el.style.width = `${point.w}%`; el.style.height = `${point.h}%`; el.style.transform = 'translate(-50%,-50%)';
    });
  }

  function createBuildingObjects() {
    const layer = $('buildingLayer');
    const objects = [
      { object: 'house', building: 'house', label: 'Nhà nông trại', x: 37, y: 50, w: 11, h: 16 },
      { object: 'mill', building: 'windmill', label: 'Cối xay gió', x: 82, y: 27, w: 15, h: 12 },
      { object: 'barn', building: 'barn', label: 'Chuồng trại', x: 78, y: 30, w: 16, h: 17 },
      { object: 'apiary', building: 'apiary', label: 'Vườn ong', x: 56, y: 65, w: 7, h: 10, requires: 'apiary' }
    ];
    layer.innerHTML = objects.map((item) => `<button type="button" class="world-building building-${item.building}${item.requires ? ' requires-building' : ''}" data-object="${item.object}" data-building="${item.building}" aria-label="${item.label}" style="--x:${item.x}%;--y:${item.y}%;--w:${item.w}%;--h:${item.h}%;--depth:${item.y}"${item.requires ? ' hidden' : ''}><img class="building-sprite" src="./assets/${item.building}.png" alt=""><span class="building-name">${item.label}</span></button>`).join('');
    layer.querySelectorAll('.world-building').forEach((button) => button.addEventListener('click', (event) => {
      event.stopPropagation();
      goToObject(button.dataset.object);
    }));
  }

  function createObjectTouchFrames() {
    const layer = $('objectTouchLayer');
    if (!layer) return;
    // Paths use the artwork's 1672 × 941 coordinates, so the touch frame scales with the map.
    const objects = [
      { id: 'farmhouse', action: 'house', label: 'Nhà nông trại', d: 'M584 349 L584 361 L579 363 L553 402 L560 414 L564 443 L573 452 L606 460 L627 456 L630 461 L641 456 L653 469 L687 465 L691 448 L698 445 L697 416 L703 410 L692 393 L666 366 L637 359 L614 363 L599 357 L595 351 Z' },
      { id: 'north-house', label: 'Nhà dân ven rừng', d: 'M688 254 L678 267 L664 273 L661 282 L651 286 L656 302 L649 306 L649 319 L657 342 L701 364 L708 364 L714 359 L747 362 L767 343 L769 315 L777 311 L776 304 L766 297 L742 265 Z' },
      { id: 'riverside-house', label: 'Nhà dân ven sông', d: 'M868 209 L845 209 L845 219 L814 213 L806 217 L807 221 L779 258 L781 275 L777 281 L781 288 L778 295 L785 299 L791 319 L806 326 L820 324 L842 330 L871 322 L872 316 L887 306 L890 298 L888 263 L871 244 L867 231 L870 226 L867 223 Z' },
      { id: 'gold-house', label: 'Nhà dân mái vàng', d: 'M1056 298 L1060 325 L1089 343 L1165 350 L1177 341 L1184 326 L1180 325 L1184 314 L1182 300 L1162 275 L1154 254 L1147 249 L1133 252 L1132 243 L1108 241 L1110 252 L1102 253 L1094 261 L1083 262 Z' },
      { id: 'market-house', label: 'Nhà dân cạnh chợ', d: 'M1324 293 L1323 301 L1291 307 L1249 354 L1242 387 L1246 391 L1245 397 L1258 407 L1253 425 L1271 425 L1291 432 L1297 428 L1316 430 L1319 443 L1325 444 L1363 443 L1368 436 L1376 435 L1376 414 L1382 412 L1389 401 L1387 365 L1392 356 L1390 347 L1394 343 L1373 312 L1357 297 Z' },
      { id: 'east-house', label: 'Nhà dân phía đông', d: 'M1600 234 L1594 229 L1577 233 L1574 226 L1563 223 L1546 225 L1534 232 L1514 225 L1495 226 L1497 242 L1485 247 L1483 255 L1457 279 L1457 286 L1451 292 L1451 297 L1456 299 L1460 324 L1474 332 L1474 341 L1521 344 L1528 351 L1532 347 L1539 349 L1548 342 L1572 342 L1582 346 L1584 337 L1607 321 L1611 315 L1608 307 L1618 303 L1614 300 L1612 287 L1619 284 L1618 273 L1622 269 Z' },
      { id: 'blue-house', label: 'Nhà dân mái xanh', d: 'M1572 377 L1565 381 L1564 386 L1550 385 L1549 390 L1536 390 L1521 401 L1488 435 L1486 456 L1492 488 L1507 507 L1536 518 L1546 512 L1569 517 L1575 515 L1597 528 L1607 523 L1610 517 L1617 520 L1623 514 L1635 513 L1632 500 L1637 491 L1649 488 L1648 461 L1640 456 L1639 439 L1605 394 L1606 390 L1599 385 L1580 390 L1579 377 Z' },
      { id: 'south-house', label: 'Nhà dân phía nam', d: 'M828 454 L795 498 L790 522 L794 533 L790 540 L792 559 L798 556 L801 562 L808 564 L809 575 L815 574 L820 578 L826 573 L830 581 L840 578 L844 587 L882 585 L893 589 L903 585 L932 584 L934 576 L950 568 L953 546 L961 541 L959 535 L953 533 L951 524 L954 506 L919 467 L893 460 L889 450 L880 442 L853 441 L851 446 L840 452 Z' },
      { id: 'mill-west', action: 'mill', label: 'Cối xay gió phía tây', d: 'M1268 90 L1261 97 L1257 96 L1243 109 L1240 109 L1236 118 L1252 135 L1255 145 L1261 145 L1261 149 L1265 148 L1267 140 L1285 143 L1289 142 L1290 126 L1287 123 L1289 118 L1286 113 L1293 106 L1284 98 L1277 99 Z' },
      { id: 'mill-center', action: 'mill', label: 'Cối xay gió giữa đồi', d: 'M1331 106 L1331 122 L1339 123 L1353 133 L1353 145 L1358 141 L1385 141 L1384 113 L1392 105 L1380 102 L1375 95 L1368 93 L1364 86 L1355 88 L1357 97 L1348 95 L1338 105 Z' },
      { id: 'mill-east', action: 'mill', label: 'Cối xay gió phía đông', d: 'M1456 92 L1442 108 L1436 104 L1431 105 L1421 117 L1421 125 L1431 130 L1430 136 L1443 141 L1442 152 L1446 157 L1450 147 L1467 151 L1475 149 L1475 135 L1478 127 L1476 121 L1485 113 L1470 99 L1464 100 Z' },
      { id: 'sheep-pen', action: 'barn', label: 'Chuồng cừu', d: 'M1450 205 L1437 199 L1436 191 L1428 193 L1418 188 L1417 185 L1403 181 L1402 175 L1388 176 L1387 172 L1379 168 L1357 170 L1346 164 L1299 166 L1292 170 L1276 167 L1271 172 L1262 174 L1238 174 L1232 179 L1222 176 L1213 186 L1201 183 L1191 194 L1176 196 L1174 201 L1166 204 L1161 202 L1148 205 L1136 211 L1134 215 L1124 218 L1123 229 L1139 250 L1149 249 L1157 261 L1161 258 L1184 261 L1227 261 L1256 268 L1282 266 L1288 272 L1296 272 L1317 265 L1328 268 L1335 264 L1347 264 L1358 256 L1385 255 L1398 246 L1405 246 L1409 243 L1419 245 L1445 237 L1450 223 Z' },
      { id: 'market-red', action: 'market', label: 'Sạp chợ mái đỏ', d: 'M1074 394 L1050 370 L992 382 L976 404 L975 441 L997 450 L1026 453 L1034 447 L1076 436 L1080 419 L1074 414 Z' },
      { id: 'market-blue', action: 'market', label: 'Sạp chợ mái xanh', d: 'M1175 398 L1173 432 L1176 446 L1181 450 L1212 453 L1223 462 L1245 463 L1262 456 L1264 433 L1275 423 L1275 413 L1264 402 L1264 388 L1243 384 L1237 389 L1235 383 L1227 384 L1206 377 L1200 386 L1192 384 Z' },
      { id: 'market-fountain', action: 'market', label: 'Đài phun nước ở chợ', d: 'M1116 411 L1110 438 L1105 442 L1105 451 L1077 467 L1073 472 L1074 481 L1070 488 L1082 496 L1122 504 L1151 500 L1174 489 L1179 483 L1179 477 L1170 467 L1168 457 L1144 452 L1135 439 L1135 429 L1127 422 L1126 412 Z' },
      { id: 'west-well', label: 'Giếng nước phía tây', d: 'M384 333 L369 366 L369 371 L381 379 L376 430 L381 446 L386 446 L391 452 L408 453 L446 447 L454 437 L459 396 L457 370 L464 366 L448 344 L413 340 L395 332 Z' },
      { id: 'south-well', label: 'Giếng nước phía nam', d: 'M1127 629 L1063 656 L1062 663 L1043 677 L1045 683 L1056 681 L1056 733 L1064 746 L1064 753 L1073 757 L1075 762 L1114 763 L1116 759 L1130 755 L1142 742 L1141 681 L1151 676 L1153 669 Z' },
      { id: 'river', action: 'pond', label: 'Sông và ao câu cá', d: 'M1024 303 L994 283 L973 278 L973 287 L986 298 L986 313 L894 349 L873 375 L878 390 L899 402 L902 413 L934 406 L938 400 L926 397 L917 385 L918 367 L926 358 L938 358 L939 348 L995 331 L1006 314 Z M890 940 L1219 940 L1222 930 L1249 918 L1250 912 L1274 911 L1276 905 L1290 905 L1304 894 L1341 888 L1384 851 L1427 838 L1521 831 L1555 841 L1587 838 L1589 829 L1611 825 L1650 833 L1646 814 L1671 811 L1671 734 L1583 743 L1559 753 L1519 750 L1496 735 L1496 689 L1507 682 L1488 664 L1449 650 L1387 639 L1231 579 L1212 599 L1211 605 L1219 605 L1221 613 L1253 624 L1263 638 L1281 634 L1322 641 L1342 668 L1358 672 L1375 691 L1435 709 L1439 738 L1419 747 L1372 750 L1315 772 L1303 785 L1253 802 L1221 830 L1179 843 L1124 845 L1088 854 L1061 879 L962 904 Z' }
    ];
    const svgNS = 'http://www.w3.org/2000/svg';
    for (const item of objects) {
      const path = document.createElementNS(svgNS, 'path');
      path.setAttribute('d', item.d);
      path.setAttribute('class', 'object-touch');
      path.setAttribute('role', 'button');
      path.setAttribute('tabindex', '0');
      path.setAttribute('aria-label', item.label);
      const title = document.createElementNS(svgNS, 'title');
      title.textContent = item.label;
      path.appendChild(title);
      path.dataset.object = item.action || item.id;
      path.dataset.label = item.label;
      path.addEventListener('click', (event) => {
        event.stopPropagation();
        if (item.action) return goToObject(item.action, path);
        document.querySelectorAll('.object-touch.selected').forEach((shape) => shape.classList.remove('selected'));
        path.classList.add('selected');
        notify(`${item.label} · Chức năng của ngôi nhà sẽ được bổ sung sau.`);
      });
      path.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); path.dispatchEvent(new MouseEvent('click', { bubbles: true })); }
      });
      layer.appendChild(path);
    }
  }

  function createVillageHomes() {
    const homes = [
      { resident: 'madeline', name: 'Nhà Madeline · Tiệm bánh', sprite: 'house-bakery', x: 24, y: 29, w: 4, h: 7.5 },
      { resident: 'barnaby', name: 'Nhà Barnaby · Quán rượu', sprite: 'house-blue', x: 76, y: 29, w: 4, h: 7.5 },
      { resident: 'eleanor', name: 'Nhà Eleanor · Trường học', sprite: 'house-violet', x: 24, y: 82, w: 4, h: 7.5 },
      { resident: 'cedric', name: 'Nhà Cedric · Cửa hàng', sprite: 'house-fisher', x: 76, y: 82, w: 4, h: 7.5 }
    ];
    const layer = $('villageHomes');
    layer.innerHTML = homes.map((home) => `<button type="button" class="village-home" data-object="${home.resident}" data-resident="${home.resident}" aria-label="${home.name}" style="--x:${home.x}%;--y:${home.y}%;--w:${home.w}%;--h:${home.h}%;--depth:${home.y}"><img src="./assets/${home.sprite}.png" alt=""><span>${home.name}</span></button>`).join('');
    layer.querySelectorAll('.village-home').forEach((button) => { button.style.zIndex = String(Math.round(Number.parseFloat(button.style.getPropertyValue('--depth')) + 8)); });
    layer.querySelectorAll('.village-home').forEach((button) => button.addEventListener('click', (event) => {
      event.stopPropagation();
      goToObject(button.dataset.resident);
    }));
  }

  function renderWorldEntities() {
    const buildings = $('buildingLayer');
    if (!buildings) return;
    buildings.querySelectorAll('.world-building').forEach((el) => {
      const id = el.dataset.building;
      const visible = !el.classList.contains('requires-building') || Boolean(state.buildings[id]);
      el.hidden = !visible;
      el.classList.toggle('constructed', Boolean(state.buildings[id]));
      el.classList.toggle('built-in', id === 'coop' || id === 'barn');
      el.style.zIndex = String(Math.round(Number.parseFloat(el.style.getPropertyValue('--depth')) + 6));
    });

    const workerSpots = { gardener: [17, 67], harvester: [22, 75], rancher: [85, 51] };
    $('worldWorkers').innerHTML = (data.workers || []).filter((worker) => state.workers[worker.id]).map((worker) => {
      const [x, y] = workerSpots[worker.id] || [52, 65];
      return `<div class="map-worker worker-${worker.id}" style="left:${x}%;top:${y}%"><span>${worker.icon}</span><small>${worker.name}</small></div>`;
    }).join('');
    $('worldWorkers').querySelectorAll('.map-worker').forEach((el) => { el.style.zIndex = String(Math.round(Number.parseFloat(el.style.top)) + 8); });

    const animalSpots = { chicken: [86, 55], cow: [92, 46], bee: [72, 68], sheep: [84, 60] };
    $('worldAnimals').innerHTML = Object.entries(state.animals).flatMap(([id, count]) => {
      const animal = data.animals.find((item) => item.id === id);
      if (!animal || !count) return [];
      const [x, y] = animalSpots[id] || [88, 54];
      return Array.from({ length: Math.min(count, 4) }, (_, i) => `<span class="map-animal animal-${id}" style="left:${x + (i % 3) * 1.8}%;top:${y + Math.floor(i / 3) * 2.4}%" title="${animal.name}">${animal.icon}</span>`);
    }).join('');
    $('worldAnimals').querySelectorAll('.map-animal').forEach((el) => { el.style.zIndex = String(Math.round(Number.parseFloat(el.style.top)) + 8); });
    $('arthur').style.zIndex = String(Math.round(state.player.y / data.meta.world.height * 100) + 8);
  }

  function createPlotButtons() {
    const layer = $('plotLayer');
    layer.innerHTML = '';
    data.meta.plotPositions.forEach((point, index) => {
      const button = document.createElement('button');
      button.className = 'plot-hit empty';
      button.dataset.plot = String(index);
      button.setAttribute('aria-label', `Luống đất ${index + 1}`);
      button.style.left = `${point.x}%`;
      button.style.top = `${point.y}%`;
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        handlePlotClick(index);
      });
      layer.appendChild(button);
    });
  }

  function bindEvents() {
    $('gameViewport').addEventListener('pointerdown', onWorldClick);
    document.querySelectorAll('.world-hotspot[data-object]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        goToObject(button.dataset.object);
      });
    });
    document.querySelectorAll('[data-map]').forEach((button) => button.addEventListener('click', () => switchMap(button.dataset.map)));
    $('plantButton').addEventListener('click', plantNear);
    $('harvestButton').addEventListener('click', harvestNear);
    $('waterButton').addEventListener('click', waterNear);
    $('mobilePlant').addEventListener('click', plantNear);
    $('mobileHarvest').addEventListener('click', harvestNear);
    $('mobileWater').addEventListener('click', waterNear);
    $('storageButton').addEventListener('click', inventoryMenu);
    $('questGo').addEventListener('click', goToQuestTarget);
    $('resetButton').addEventListener('click', confirmReset);
    $('chatForm').addEventListener('submit', sendChat);
    document.querySelectorAll('[data-toggle]').forEach((button) => {
      button.addEventListener('click', () => {
        const panel = $(button.dataset.toggle);
        panel.classList.toggle('collapsed');
        button.textContent = panel.classList.contains('collapsed') ? '+' : '−';
      });
    });
    document.querySelectorAll('[data-feed]').forEach((button) => {
      button.addEventListener('click', () => {
        currentFeed = button.dataset.feed;
        document.querySelectorAll('[data-feed]').forEach((item) => item.classList.toggle('selected', item === button));
        renderFeed();
      });
    });
    document.querySelectorAll('.quick-actions [data-menu],.map-travel [data-menu]').forEach((button) => {
      button.addEventListener('click', () => {
        const menu = button.dataset.menu;
        if (menu === 'auto') toggleAuto();
        if (menu === 'inventory') inventoryMenu();
        if (menu === 'handbook') handbookMenu();
        if (menu === 'rest') restPrompt();
        if (menu === 'quest') { $('questPanel').classList.toggle('collapsed'); if (!$('questPanel').classList.contains('collapsed')) goToQuestTarget(); }
        if (menu === 'farm') workshopMenu();
        if (menu === 'village') switchMap('village');
        if (menu === 'villagers') villageMenu();
        if (menu === 'workers') workerMenu();
        if (menu === 'fish') goToObject('pond');
      });
    });
    $('modalRoot').addEventListener('click', onModalClick);
    $('seedDock').addEventListener('click', (event) => {
      const button = event.target.closest('[data-action]');
      if (!button) return;
      if (button.dataset.action === 'seed-close') closeSeedDock();
      if (button.dataset.action === 'select-seed' && !button.disabled) {
        const plotIndex = Number(button.dataset.plot);
        state.selectedSeed = button.dataset.id;
        state.selectedSlot = 2;
        closeSeedDock();
        renderAll();
        plant(plotIndex);
      }
    });
    $('fishDock').addEventListener('click', (event) => {
      const button = event.target.closest('[data-action]');
      if (!button) return;
      if (button.dataset.action === 'fish-close') closeFishDock();
      if (button.dataset.action === 'fish-start' && !button.disabled) startFishing();
      if (button.dataset.action === 'fish-cast' && !button.disabled) castFish();
    });
    $('modalRoot').addEventListener('input', (event) => {
      if (event.target.id === 'saveCodeInput') $('importSaveButton').disabled = !event.target.value.trim();
    });
    $('joystick').querySelectorAll('[data-dir]').forEach((button) => {
      const dir = button.dataset.dir;
      const set = (on) => {
        if (dir === 'up') direction.y = on ? -1 : 0;
        if (dir === 'down') direction.y = on ? 1 : 0;
        if (dir === 'left') direction.x = on ? -1 : 0;
        if (dir === 'right') direction.x = on ? 1 : 0;
      };
      button.addEventListener('pointerdown', (e) => { e.preventDefault(); set(true); button.setPointerCapture(e.pointerId); });
      button.addEventListener('pointerup', () => set(false));
      button.addEventListener('pointercancel', () => set(false));
      button.addEventListener('lostpointercapture', () => set(false));
    });
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', () => { direction = { x: 0, y: 0 }; });
    window.addEventListener('resize', updateCamera);
  }

  function onWorldClick(event) {
    if (!event.target.closest('.world,.world-background')) return;
    if (event.target.closest('.world-hotspot,.world-building,.object-touch,.plot-hit,.village-home')) return;
    if (isModalOpen()) return;
    const box = $('gameViewport').getBoundingClientRect();
    const x = (event.clientX - box.left - camera.offsetX) / scale;
    const y = (event.clientY - box.top - camera.offsetY) / scale;
    const reachedByPath = setWalkTarget({ x: clamp(x, 30, worldWidth() - 30), y: clamp(y, 30, data.meta.world.height - 30) });
    pendingAction = null;
    document.querySelectorAll('.world-hotspot.selected,.world-building.selected,.object-touch.selected').forEach((item) => item.classList.remove('selected'));
    $('gameViewport').classList.remove('game-pond-selected');
    closeFishDock();
    closeSeedDock();
    state.mapExplored = true;
    $('gameViewport').focus({ preventScroll: true });
    if (!reachedByPath) notify('Lối tới điểm đó đang bị chặn. Hãy chọn một vị trí gần hơn.');
    updateCamera();
  }

  function onKeyDown(event) {
    if (isModalOpen()) {
      if (event.key === 'Escape') closeModal();
      return;
    }
    if (event.key === 'Escape' && $('seedDock').classList.contains('open')) { closeSeedDock(); return; }
    if (event.key === 'Escape' && $('fishDock').classList.contains('open')) { closeFishDock(); return; }
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
    const key = event.key.toLowerCase();
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(key)) event.preventDefault();
    if (key === 'w' || key === 'arrowup') direction.y = -1;
    if (key === 's' || key === 'arrowdown') direction.y = 1;
    if (key === 'a' || key === 'arrowleft') direction.x = -1;
    if (key === 'd' || key === 'arrowright') direction.x = 1;
    if (['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].includes(key)) {
      destination = null;
      walkPath = [];
      walkPathIndex = 0;
      pendingAction = null;
      closeSeedDock();
      state.mapExplored = true;
    }
    if (key === 'shift') state.running = true;
    if (key === 'e') plantNear();
    if (key === ' ') harvestNear();
    if (key === 'escape') restPrompt();
    if (key === 'i') inventoryMenu();
    if (key === 'k') handbookMenu();
    if (key === 'q') { $('questPanel').classList.toggle('collapsed'); if (!$('questPanel').classList.contains('collapsed')) goToQuestTarget(); }
    if (key === 'f') waterNear();
    if (key === 'b') workshopMenu();
    if (key === 'm') workerMenu();
    if (key === 'p') goToObject('pond');
    if (key === 'c') switchMap('village');
    if (key === 'z') toggleAuto();
    if (key === '1') selectSlot(0);
    if (key === '2') selectSlot(1);
    if (key === '3') selectSlot(2);
    if (key === '4') selectSlot(3);
    if (key === '5') selectSlot(4);
    if (key === '6') useLunch();
    if (key === '7') useTea();
    if (key === 'enter' && $('chatInput') === document.activeElement) $('chatForm').requestSubmit();
  }

  function onKeyUp(event) {
    const key = event.key.toLowerCase();
    if (key === 'w' || key === 'arrowup') direction.y = direction.y === -1 ? 0 : direction.y;
    if (key === 's' || key === 'arrowdown') direction.y = direction.y === 1 ? 0 : direction.y;
    if (key === 'a' || key === 'arrowleft') direction.x = direction.x === -1 ? 0 : direction.x;
    if (key === 'd' || key === 'arrowright') direction.x = direction.x === 1 ? 0 : direction.x;
    if (key === 'shift') state.running = false;
  }

  function frame(timestamp) {
    const dt = Math.min(0.05, (timestamp - (lastFrame || timestamp)) / 1000);
    lastFrame = timestamp;
    movePlayer(dt);
    updateCamera();
    requestAnimationFrame(frame);
  }

  function movePlayer(dt) {
    const player = state.player;
    let dx = direction.x;
    let dy = direction.y;
    if (!dx && !dy && destination) {
      let target = walkPath[walkPathIndex] || destination;
      let tx = target.x - player.x;
      let ty = target.y - player.y;
      let distance = Math.hypot(tx, ty);
      while (distance < 16 && walkPathIndex < walkPath.length - 1) {
        target = walkPath[++walkPathIndex];
        tx = target.x - player.x;
        ty = target.y - player.y;
        distance = Math.hypot(tx, ty);
      }
      if (distance < 16) {
        destination = null;
        walkPath = [];
        walkPathIndex = 0;
      } else { dx = tx / distance; dy = ty / distance; }
    }
    const moving = Boolean(dx || dy);
    if (moving && !state.mapExplored) state.mapExplored = true;
    $('arthur').classList.toggle('walking', moving);
    if (moving) {
      const length = Math.hypot(dx, dy) || 1;
      dx /= length; dy /= length;
      const speed = (state.running ? 340 : 220) * (state.weatherId === 'storm' ? 0.78 : 1);
      const nx = clamp(player.x + dx * speed * dt, 20, worldWidth() - 20);
      const ny = clamp(player.y + dy * speed * dt, 20, data.meta.world.height - 20);
      if (!blocked(nx, player.y)) player.x = nx;
      if (!blocked(player.x, ny)) player.y = ny;
      if (!direction.x && !direction.y && blocked(nx, ny) && blocked(player.x, player.y)) {
        destination = null;
        walkPath = [];
        walkPathIndex = 0;
      }
    }
    $('arthur').style.left = `${(player.x / worldWidth()) * 100}%`;
    $('arthur').style.top = `${(player.y / data.meta.world.height) * 100}%`;
    $('arthur').style.zIndex = String(Math.round(player.y / data.meta.world.height * 100) + 8);
    if (pendingAction && distanceTo(pendingAction.x, pendingAction.y) <= pendingAction.radius) {
      const action = pendingAction;
      pendingAction = null;
      destination = null;
      walkPath = [];
      walkPathIndex = 0;
      action.run();
    } else if (pendingAction && !destination && !walkPath.length) {
      pendingAction = null;
      notify('Arthur không tìm thấy lối đi tới điểm đó.');
    }
  }

  function blocked(x, y) {
    const margin = 24;
    if (x < margin || y < margin || x > worldWidth() - margin || y > data.meta.world.height - margin) return true;
    if (state.currentMap === 'village') {
      const px = x / worldWidth() * 100;
      const py = y / data.meta.world.height * 100;
      return [
        [[0,0],[15,0],[16,40],[0,40]], [[17,8],[31,8],[31,30],[17,30]],
        [[69,8],[83,8],[83,30],[69,30]], [[92,0],[100,0],[100,100],[92,100]],
        [[17,63],[31,63],[31,84],[17,84]], [[69,63],[83,63],[83,84],[69,84]],
        [[35,31],[41,31],[42,39],[35,39]], [[59,31],[66,31],[66,39],[59,39]],
        [[34,59],[42,59],[42,66],[34,66]], [[59,59],[67,59],[67,66],[59,66]],
        [[47,42],[53,42],[54,48],[53,51],[47,51],[46,48]],
        [[39,83],[43,88],[42,93],[37,91]], [[59,83],[63,88],[62,93],[57,91]]
      ].some((polygon) => pointInPolygon(px, py, polygon));
    }
    const obstacles = data.meta.navigation?.obstacles || [];
    const samples = [[0,0],[margin,0],[-margin,0],[0,margin],[0,-margin]];
    const blockedByObject = obstacles.some((obstacle) => {
      if (obstacle.requires && !state.buildings[obstacle.requires]) return false;
      return samples.some(([ox, oy]) => pointInPolygon(
        (x + ox) / worldWidth() * 100,
        (y + oy) / data.meta.world.height * 100,
        obstacle.points
      ));
    });
    if (blockedByObject) return true;
    const nearPlot = data.meta.plotPositions.some((point, index) => {
      const px = point.x * worldWidth() / 100;
      const py = point.y * data.meta.world.height / 100;
      const radius = state.plots[index] ? 54 : 42;
      return Math.hypot(x - px, y - py) < radius;
    });
    if (nearPlot && state.currentMap === 'farm') return true;
    const workers = { gardener: [17,67], harvester: [22,75], rancher: [85,51] };
    for (const [id, pos] of Object.entries(workers)) {
      if (state.currentMap !== 'farm') break;
      if (!state.workers[id]) continue;
      if (Math.hypot(x - pos[0] * worldWidth() / 100, y - pos[1] * data.meta.world.height / 100) < 48) return true;
    }
    const animals = { chicken: [86,55], cow: [92,46], bee: [72,68], sheep: [84,60] };
    for (const [id, pos] of Object.entries(animals)) {
      if (state.currentMap !== 'farm') break;
      if (!state.animals[id]) continue;
      const count = Math.min(state.animals[id], 4);
      for (let i = 0; i < count; i++) {
        const ax = (pos[0] + (i % 3) * 1.8) * worldWidth() / 100;
        const ay = (pos[1] + Math.floor(i / 3) * 2.4) * data.meta.world.height / 100;
        if (Math.hypot(x - ax, y - ay) < 44) return true;
      }
    }
    return false;
  }

  function pointInPolygon(x, y, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const [xi, yi] = polygon[i];
      const [xj, yj] = polygon[j];
      const crosses = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / ((yj - yi) || Number.EPSILON) + xi);
      if (crosses) inside = !inside;
    }
    return inside;
  }

  function nearestFreePosition(point) {
    if (!blocked(point.x, point.y)) return point;
    for (let radius = 40; radius <= 800; radius += 40) {
      for (let step = 0; step < 24; step++) {
        const angle = step / 24 * Math.PI * 2;
        const x = clamp(point.x + Math.cos(angle) * radius, 30, worldWidth() - 30);
        const y = clamp(point.y + Math.sin(angle) * radius, 30, data.meta.world.height - 30);
        if (!blocked(x, y)) return { x, y };
      }
    }
    return { x: data.meta.spawn.x, y: data.meta.spawn.y };
  }

  function pointSegmentDistance(point, a, b) {
    const vx = b.x - a.x;
    const vy = b.y - a.y;
    const len2 = vx * vx + vy * vy || 1;
    const t = clamp(((point.x - a.x) * vx + (point.y - a.y) * vy) / len2, 0, 1);
    return Math.hypot(point.x - (a.x + t * vx), point.y - (a.y + t * vy));
  }

  function laneCost(x, y) {
    if (state.currentMap === 'village') return 1;
    const lanes = data.meta.navigation?.lanes || [];
    const p = { x: x / worldWidth() * 100, y: y / data.meta.world.height * 100 };
    let nearest = Infinity;
    lanes.forEach((lane) => {
      for (let i = 1; i < lane.length; i++) {
        const d = pointSegmentDistance(p, { x: lane[i - 1][0], y: lane[i - 1][1] }, { x: lane[i][0], y: lane[i][1] });
        nearest = Math.min(nearest, d);
      }
    });
    const worldDistance = nearest * Math.min(worldWidth(), data.meta.world.height) / 100;
    if (worldDistance < 100) return 0.72;
    if (worldDistance < 230) return 0.98;
    return 1.3;
  }

  function findWalkPath(start, goal) {
    const nav = data.meta.navigation || {};
    const cell = nav.cellSize || 80;
    const cols = Math.ceil(worldWidth() / cell);
    const rows = Math.ceil(data.meta.world.height / cell);
    const total = cols * rows;
    const indexOf = (col, row) => row * cols + col;
    const centerOf = (index) => ({ x: (index % cols + .5) * cell, y: (Math.floor(index / cols) + .5) * cell });
    const openCell = (index) => { const p = centerOf(index); return !blocked(p.x, p.y); };
    const nearestCell = (point, maxDistance = 600) => {
      const gc = clamp(Math.floor(point.x / cell), 0, cols - 1);
      const gr = clamp(Math.floor(point.y / cell), 0, rows - 1);
      let best = -1, bestDistance = maxDistance;
      for (let radius = 0; radius < Math.max(cols, rows); radius++) {
        const minCol = Math.max(0, gc - radius), maxCol = Math.min(cols - 1, gc + radius);
        const minRow = Math.max(0, gr - radius), maxRow = Math.min(rows - 1, gr + radius);
        for (let row = minRow; row <= maxRow; row++) for (let col = minCol; col <= maxCol; col++) {
          if (radius > 0 && col > minCol && col < maxCol && row > minRow && row < maxRow) continue;
          const idx = indexOf(col, row);
          if (!openCell(idx)) continue;
          const p = centerOf(idx);
          const d = Math.hypot(p.x - point.x, p.y - point.y);
          if (d < bestDistance) { bestDistance = d; best = idx; }
        }
        if (best >= 0 && radius * cell > bestDistance + cell) break;
      }
      return best;
    };
    const startIndex = nearestCell(start, 520);
    const endIndex = nearestCell(goal, 460);
    if (startIndex < 0 || endIndex < 0) return [];
    if (startIndex === endIndex) return [centerOf(endIndex)];

    const costs = new Float64Array(total); costs.fill(Infinity); costs[startIndex] = 0;
    const parents = new Int32Array(total); parents.fill(-1);
    const heap = [];
    const push = (item) => {
      heap.push(item); let i = heap.length - 1;
      while (i > 0) { const p = (i - 1) >> 1; if (heap[p].f <= item.f) break; heap[i] = heap[p]; i = p; }
      heap[i] = item;
    };
    const pop = () => {
      const root = heap[0], last = heap.pop();
      if (heap.length) {
        let i = 0;
        while (true) { const l = i * 2 + 1, r = l + 1; if (l >= heap.length) break; const c = r < heap.length && heap[r].f < heap[l].f ? r : l; if (heap[c].f >= last.f) break; heap[i] = heap[c]; i = c; }
        heap[i] = last;
      }
      return root;
    };
    const heuristic = (idx) => { const p = centerOf(idx), q = centerOf(endIndex); return Math.hypot(p.x - q.x, p.y - q.y) / cell * .72; };
    push({ index: startIndex, g: 0, f: heuristic(startIndex) });
    const dirs = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
    let found = false;
    let bestIndex = startIndex;
    let bestDistance = heuristic(startIndex);
    while (heap.length) {
      const current = pop();
      if (current.g > costs[current.index] + .001) continue;
      const h = heuristic(current.index);
      if (h < bestDistance) { bestDistance = h; bestIndex = current.index; }
      if (current.index === endIndex) { found = true; break; }
      const col = current.index % cols, row = Math.floor(current.index / cols);
      for (const [dx, dy] of dirs) {
        const nc = col + dx, nr = row + dy;
        if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
        const next = indexOf(nc, nr);
        if (!openCell(next)) continue;
        if (dx && dy && (!openCell(indexOf(col + dx, row)) || !openCell(indexOf(col, row + dy)))) continue;
        const p = centerOf(next);
        const step = (dx && dy ? Math.SQRT2 : 1) * laneCost(p.x, p.y);
        const g = current.g + step;
        if (g >= costs[next]) continue;
        costs[next] = g; parents[next] = current.index;
        push({ index: next, g, f: g + heuristic(next) });
      }
    }
    const pathEndIndex = found ? endIndex : bestIndex;
    if (pathEndIndex === startIndex) return [];
    const raw = [];
    for (let i = pathEndIndex; i !== startIndex && i >= 0; i = parents[i]) raw.push(centerOf(i));
    raw.reverse();
    const smoothed = [];
    let anchor = start;
    let cursor = 0;
    while (cursor < raw.length) {
      let furthest = raw.length - 1;
      while (furthest > cursor && !segmentIsClear(anchor, raw[furthest])) furthest--;
      smoothed.push(raw[furthest]);
      anchor = raw[furthest];
      cursor = furthest + 1;
    }
    const actualGoal = { x: clamp(goal.x, 30, worldWidth() - 30), y: clamp(goal.y, 30, data.meta.world.height - 30) };
    if (segmentIsClear(anchor, actualGoal)) smoothed.push(actualGoal);
    return smoothed;
  }

  function segmentIsClear(a, b) {
    const distance = Math.hypot(b.x - a.x, b.y - a.y);
    const steps = Math.max(1, Math.ceil(distance / 35));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      if (blocked(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t)) return false;
    }
    return true;
  }

  function setWalkTarget(point) {
    walkPath = findWalkPath(state.player, point);
    walkPathIndex = 0;
    destination = walkPath[walkPath.length - 1] || null;
    return walkPath.length > 0;
  }

  function updateCamera() {
    const viewport = $('gameViewport');
    if (!viewport || !data) return;
    const w = worldWidth();
    const h = data.meta.world.height;
    const fitWidth = viewport.clientWidth / w;
    const fitHeight = viewport.clientHeight / h;
    scale = Math.min(fitWidth, fitHeight);
    const world = $('world');
    const scene = state.currentMap;
    if ($('gameViewport').dataset.scene !== scene) {
      $('gameViewport').dataset.scene = scene;
      $('gameViewport').classList.toggle('village-map', scene === 'village');
      $('gameViewport').classList.toggle('compact-valley-map', scene === 'farm');
      $('world').querySelector('.world-background').src = scene === 'village' ? './assets/village-map-wide.png' : './assets/farm-valley-compact.png';
      $('mapTitle').textContent = scene === 'village' ? 'LÀNG OAKSHIRE · HỘI CHỢ MÙA VỤ' : 'NÔNG TRẠI OAKSHIRE';
      $('world').querySelectorAll('.world-hotspot:not(.village-fair):not(.village-gate),#buildingLayer,#worldAnimals,#worldWorkers,#plotLayer,#objectTouchLayer,.pond-outline').forEach((el) => { el.hidden = scene === 'village'; });
      $('villageHomes').hidden = scene !== 'village';
      $('world').querySelectorAll('.village-fair,.village-gate').forEach((el) => { el.hidden = scene !== 'village'; });
      document.querySelectorAll('[data-map]').forEach((button) => button.classList.toggle('active', button.dataset.map === scene));
    }
    world.style.width = `${w * scale}px`;
    world.style.height = `${h * scale}px`;
    const maxX = Math.max(0, w * scale - viewport.clientWidth);
    const maxY = Math.max(0, h * scale - viewport.clientHeight);
    camera.x = clamp(state.player.x * scale - viewport.clientWidth / 2, 0, maxX);
    camera.y = clamp(state.player.y * scale - viewport.clientHeight / 2, 0, maxY);
    camera.offsetX = maxX ? -camera.x : (viewport.clientWidth - w * scale) / 2;
    camera.offsetY = maxY ? -camera.y : (viewport.clientHeight - h * scale) / 2;
    world.style.setProperty('--world-scale', scale);
    world.style.transform = `translate3d(${camera.offsetX}px,${camera.offsetY}px,0)`;
  }

  function switchMap(map) {
    if (map !== 'farm' && map !== 'village') return;
    if (state.currentMap === map) return;
    state.mapPositions[state.currentMap] = { ...state.player };
    state.currentMap = map;
    state.player = { ...(state.mapPositions[map] || (map === 'farm' ? data.meta.spawn : { x: worldWidth() * .5, y: data.meta.world.height * .77 })) };
    destination = null; walkPath = []; walkPathIndex = 0; pendingAction = null;
    if (blocked(state.player.x, state.player.y)) state.player = nearestFreePosition(state.player);
    $('arthur').style.left = `${state.player.x / worldWidth() * 100}%`;
    $('arthur').style.top = `${state.player.y / data.meta.world.height * 100}%`;
    closeSeedDock(); closeFishDock();
    updateCamera(); renderWorldEntities(); save();
    notify(map === 'village' ? 'Đã tới Làng Oakshire. Hội chợ nằm giữa quảng trường!' : 'Arthur đã về nông trại.');
  }

  function distanceTo(x, y) { return Math.hypot(state.player.x - x, state.player.y - y); }
  function plotPoint(index) {
    const p = data.meta.plotPositions[index];
    return { x: worldWidth() * p.x / 100, y: data.meta.world.height * p.y / 100 };
  }

  function handlePlotClick(index) {
    closeSeedDock();
    closeFishDock();
    walkPath = [];
    walkPathIndex = 0;
    pendingAction = null;
    state.selectedPlot = index;
    renderPlots();
    const point = plotPoint(index);
    if (distanceTo(point.x, point.y) > 125) {
      state.mapExplored = true;
      pendingAction = { ...point, radius: 175, run: () => actOnPlot(index) };
      if (!setWalkTarget(point)) { pendingAction = null; return notify('Không có lối vào luống này.'); }
      notify('Arthur đang đi tới luống đất…');
      return;
    }
    actOnPlot(index);
  }

  function goToObject(id, sourceElement = null) {
    if (id === 'farm-gate') return switchMap('farm');
    if (id === 'market' && state.currentMap === 'farm') { switchMap('village'); return; }
    closeSeedDock();
    if (id !== 'pond') closeFishDock();
    const villageHomePoints = { madeline: [24, 29], barnaby: [76, 29], eleanor: [24, 82], cedric: [76, 82] };
    const home = state.currentMap === 'village' ? villageHomePoints[id] : null;
    const point = id === 'market' && state.currentMap === 'village' ? { x: 50, y: 55, radius: 180 } : home ? { x: home[0], y: home[1], radius: 400 } : data.meta.hotspots[id];
    if (!point) return;
    document.querySelectorAll('.world-hotspot.selected,.world-building.selected,.object-touch.selected').forEach((item) => item.classList.remove('selected'));
    (sourceElement || document.querySelector(`.object-touch[data-object="${id}"],.world-building[data-object="${id}"],.world-hotspot[data-object="${id}"]`))?.classList.add('selected');
    $('gameViewport').classList.toggle('game-pond-selected', id === 'pond');
    const x = worldWidth() * point.x / 100;
    const y = data.meta.world.height * point.y / 100;
    const radius = point.radius || 120;
    const action = () => interact(id);
    if (distanceTo(x, y) > radius) {
      state.mapExplored = true;
      pendingAction = { x, y, radius, run: action };
      const dx = state.player.x - x;
      const dy = state.player.y - y;
      const length = Math.hypot(dx, dy) || 1;
      if (!setWalkTarget({ x: x + dx / length * (radius * .65), y: y + dy / length * (radius * .65) })) {
        pendingAction = null;
        return notify('Không tìm thấy lối đi tới công trình.');
      }
      notify('Arthur đang đi tới…');
      return;
    }
    action();
  }

  function interact(id) {
    destination = null;
    walkPath = [];
    walkPathIndex = 0;
    if (id === 'house') return workshopMenu();
    if (id === 'mill') return workshopMenu('mill');
    if (id === 'barn') return barnMenu();
    if (id === 'pond') return fishingMenu();
    if (id === 'market') return marketMenu('nongsan');
    if (['madeline', 'barnaby', 'eleanor', 'cedric'].includes(id)) return villagerMenu(id);
  }

  function actOnPlot(index) {
    const plot = state.plots[index];
    if (!plot) return seedPickerMenu(index);
    if (plot.ready) return harvest(index);
    if (!plot.watered) return water(index);
    if (state.selectedSlot === 4 && state.fertilizer > 0) return fertilize(index);
    const crop = getCrop(plot.crop);
    notify(`${crop.name} đang lớn · còn ${plot.daysLeft} ngày. Nhấn F để tưới hoặc ngủ qua ngày.`);
  }

  function plantNear() {
    if (!ensureEnergy(1)) return;
    const index = nearestPlot((plot) => !plot);
    if (index < 0) return notify('Không có ô đất trống ở gần. Đi tới luống đất rồi thử lại.');
    const point = plotPoint(index);
    if (distanceTo(point.x, point.y) > 28) return handlePlotClick(index);
    plant(index);
  }

  function plant(index) {
    const crop = getCrop(state.selectedSeed);
    if (!crop || !isCropUnlocked(crop)) return notify('Giống này chưa mở khóa. Xem điều kiện trong Chợ.');
    if (!ensureEnergy(1)) return;
    if (state.inventory.seeds[crop.id] < 1) return notify(`Hết hạt ${crop.name}. Ghé chợ để mua thêm.`);
    state.energy--;
    state.inventory.seeds[crop.id]--;
    state.plots[index] = { crop: crop.id, daysLeft: crop.days, watered: false, ready: false, plantedDay: state.day, fertilized: false, harvests: 0 };
    $('arthur').classList.add('hoeing');
    setTimeout(() => $('arthur').classList.remove('hoeing'), 1100);
    completeTutorial('plant');
    addFeed('HỆ THỐNG', `Arthur đã gieo ${crop.name} ở luống ${index + 1}.`);
    showFloating(pointForPlot(index), `-${1} TL · 🌱`);
    renderAll();
  }

  function waterNear() {
    const index = nearestPlot((plot) => plot && !plot.watered && !plot.ready);
    if (index < 0) return notify('Không có cây khô ở gần để tưới.');
    const point = plotPoint(index);
    if (distanceTo(point.x, point.y) > 28) return handlePlotClick(index);
    water(index);
  }

  function water(index) {
    const plot = state.plots[index];
    if (!plot) return notify('Luống này chưa có hạt.');
    if (plot.watered) return notify('Cây này đã được tưới hôm nay.');
    if (plot.ready) return harvest(index);
    if (!ensureEnergy(1)) return;
    if (state.water < 1) return notify('Thùng nước đã cạn. Nghỉ qua ngày để đổ đầy lại.');
    state.energy--;
    state.water--;
    plot.watered = true;
    completeTutorial('water');
    addFeed('HỆ THỐNG', `${getCrop(plot.crop).name} đã được tưới nước.`);
    showFloating(pointForPlot(index), '💧 -1 TL');
    renderAll();
  }

  function harvestNear() {
    const index = nearestPlot((plot) => plot && plot.ready);
    if (index < 0) return notify('Chưa có cây chín ở gần. Tưới cây rồi nghỉ qua ngày.');
    const point = plotPoint(index);
    if (distanceTo(point.x, point.y) > 28) return handlePlotClick(index);
    harvest(index);
  }

  function harvest(index) {
    const plot = state.plots[index];
    if (!plot?.ready) return notify('Cây chưa chín.');
    if (!ensureEnergy(1)) return;
    state.energy--;
    const crop = getCrop(plot.crop);
    const amount = crop.yield * (plot.fertilized ? 2 : 1);
    state.inventory.produce[crop.id] = (state.inventory.produce[crop.id] || 0) + amount;
    state.harvestCounts[crop.id] = (state.harvestCounts[crop.id] || 0) + amount;
    state.totalHarvests += amount;
    plot.harvests = (plot.harvests || 0) + 1;
    addXp(5 + crop.days * 2);
    completeTutorial('harvest');
    $('arthur').classList.add('hoeing');
    setTimeout(() => $('arthur').classList.remove('hoeing'), 800);
    showFloating(pointForPlot(index), `+${amount} ${crop.stages[3]}`);
    addFeed('HỆ THỐNG', `Thu hoạch ${amount} ${crop.name}. Có thể bán ở chợ hoặc đem chế biến.`);
    const regrow = crop.regrow;
    if (regrow && plot.harvests < 3) {
      plot.daysLeft = regrow;
      plot.watered = false;
      plot.ready = false;
      plot.fertilized = false;
      notify(`${crop.name} đã cho trái. Cây sẽ ra đợt mới sau ${regrow} ngày.`);
    } else {
      state.plots[index] = null;
      notify(`Thu hoạch ${crop.name} x${amount}!`);
    }
    renderAll();
  }

  function fertilize(index) {
    const plot = state.plots[index];
    if (!plot || plot.ready) return notify('Chỉ bón phân cho cây đang lớn.');
    if (plot.fertilized) return notify('Cây này đã được bón phân.');
    if (!ensureEnergy(1)) return;
    state.energy--;
    state.fertilizer--;
    plot.fertilized = true;
    plot.daysLeft = Math.max(1, plot.daysLeft - 1);
    addFeed('HỆ THỐNG', `Bón phân cho ${getCrop(plot.crop).name}; cây lớn nhanh và cho thu hoạch gấp đôi.`);
    renderAll();
  }

  function nearestPlot(predicate) {
    let best = -1;
    let bestDistance = Infinity;
    state.plots.forEach((plot, index) => {
      if (!predicate(plot)) return;
      const point = plotPoint(index);
      const dist = distanceTo(point.x, point.y);
      if (dist < bestDistance) { bestDistance = dist; best = index; }
    });
    return best;
  }

  function pointForPlot(index) { return plotPoint(index); }
  function ensureEnergy(cost) {
    if (state.energy < cost) {
      notify('Arthur đã cạn thể lực. Nhấn Nghỉ để sang ngày mới.');
      return false;
    }
    return true;
  }

  function selectSlot(index) {
    state.selectedSlot = index;
    if (index === 2) state.selectedSeed = state.selectedSeed || 'cabbage';
    if (index === 5) return useLunch();
    if (index === 6) return useTea();
    const item = data.hotbar[index];
    if ($('toolTooltip')) $('toolTooltip').textContent = `[PHÍM ${index + 1}] ${item.name.toLocaleUpperCase('vi-VN')} — ${item.description}`;
    renderHotbar();
    save();
  }

  function useLunch() {
    if (!state.lunch) return notify('Túi đồ không còn cơm trưa.');
    state.lunch--;
    state.energy = Math.min(data.meta.maxEnergy, state.energy + 6);
    notify('Ăn cơm trưa · hồi 6 thể lực.');
    renderAll();
  }

  function useTea() {
    if (!state.tea) return notify('Túi đồ không còn trà hoa cúc.');
    state.tea--;
    state.energy = Math.min(data.meta.maxEnergy, state.energy + 3);
    notify('Uống trà hoa cúc · hồi 3 thể lực.');
    renderAll();
  }

  function restPrompt() {
    if (isModalOpen()) return closeModal();
    const forecast = state.plots.filter(Boolean).length;
    showModal('NGHỈ QUA NGÀY', `<p>Arthur sẽ nghỉ ngơi, hồi đầy thể lực và thùng nước. Cây đã tưới sẽ lớn thêm một ngày.</p><div class="modal-note">🌱 ${forecast} cây đang trồng · 🌦️ ${weatherFor(state.weatherId).name}</div><div class="modal-actions"><button class="retro-btn" data-action="rest-confirm">NGỦ TỚI SÁNG [ENTER]</button><button class="retro-btn" data-action="modal-close">Ở LẠI NÔNG TRẠI</button></div>`);
  }

  function endDay() {
    if (fishing) stopFishing();
    const event = data.events.find((item) => item.day === state.day);
    let growthMultiplier = event?.growth || 1;
    const weather = weatherFor(state.weatherId);
    growthMultiplier *= weather.growth || 1;
    payWorkers();
    if (state.workers.gardener && state.workers.gardener.activeToday) {
      state.plots.forEach((plot) => { if (plot && !plot.ready) plot.watered = true; });
    }
    if (state.workers.harvester && state.workers.harvester.activeToday) harvestAllReadyCrops();
    if (state.autoFarm) {
      state.plots.forEach((plot) => {
        if (!plot || plot.ready || plot.watered || state.energy < 1 || state.water < 1) return;
        plot.watered = true; state.energy--; state.water--;
      });
    }
    state.plots.forEach((plot) => {
      if (!plot || plot.ready) return;
      const rained = state.weatherId === 'rain';
      if (!plot.watered && !rained) return;
      plot.daysLeft -= Math.max(1, Math.round(growthMultiplier));
      plot.watered = false;
      if (plot.daysLeft <= 0) { plot.daysLeft = 0; plot.ready = true; }
    });
    processAnimals();
    const nextDay = state.day + 1;
    completeJobs(nextDay);
    completeTutorial('sleep');
    state.energy = data.meta.maxEnergy;
    state.water = 10;
    state.dailyRewardCount = 0;
    state.animalFedToday = false;
    gameMinute = 360;
    if (state.day >= data.meta.seasonLength) {
      state.day = data.meta.seasonLength;
      save();
      closeModal();
      seasonSummary();
      return;
    }
    state.day = nextDay;
    setWeatherForCurrentDay();
    generateOrders(true);
    logDayStart();
    if (state.autoFarm) autoTendOne();
    destination = null; pendingAction = null;
    renderAll();
    closeModal();
    save();
  }

  function processAnimals() {
    const animalTypes = data.animals;
    for (const type of animalTypes) {
      const count = state.animals[type.id] || 0;
      if (!count) continue;
      const feedKey = type.feed;
      const available = state.inventory.produce[feedKey] || 0;
      const fed = Math.min(count, available);
      if (fed) {
        state.inventory.produce[feedKey] -= fed;
        const bonus = state.workers.rancher?.activeToday ? 1 : 0;
        state.inventory.goods[type.product] = (state.inventory.goods[type.product] || 0) + fed * (type.rate + bonus);
        state.animalFedToday = true;
      }
      if (fed < count) addFeed('HỆ THỐNG', `Thiếu ${getCrop(feedKey)?.name || feedKey} làm thức ăn; ${count - fed} ${type.name} không cho sản phẩm hôm nay.`);
    }
  }

  function payWorkers() {
    for (const worker of data.workers || []) {
      const hired = state.workers[worker.id];
      if (!hired) continue;
      if (state.coins >= worker.wage) {
        state.coins -= worker.wage;
        hired.activeToday = true;
      } else {
        hired.activeToday = false;
        addFeed('HỆ THỐNG', `${worker.name} tạm nghỉ hôm nay vì nông trại không đủ ${worker.wage} xu trả công.`);
      }
    }
  }

  function harvestAllReadyCrops() {
    let total = 0;
    state.plots.forEach((plot, index) => {
      if (!plot?.ready) return;
      const crop = getCrop(plot.crop);
      if (!crop) return;
      const amount = crop.yield * (plot.fertilized ? 2 : 1);
      state.inventory.produce[crop.id] = (state.inventory.produce[crop.id] || 0) + amount;
      state.harvestCounts[crop.id] = (state.harvestCounts[crop.id] || 0) + amount;
      state.totalHarvests += amount;
      total += amount;
      state.plots[index] = null;
    });
    if (total) addFeed('HỆ THỐNG', `Người thu hoạch gom ${total} nông sản chín vào kho.`);
  }

  function completeJobs(nextDay) {
    const remain = [];
    state.jobs.forEach((job) => {
      if (job.readyDay <= nextDay) {
        state.inventory.goods[job.output] = (state.inventory.goods[job.output] || 0) + job.amount;
        const recipe = data.recipes.find((item) => item.id === job.recipeId);
        addFeed('HỆ THỐNG', `${recipe?.icon || '📦'} ${recipe?.name || job.output} đã chế biến xong.`);
      } else remain.push(job);
    });
    state.jobs = remain;
  }

  function seasonSummary() {
    const goal = data.meta.seasonGoal + (state.season - 1) * 300;
    const reached = state.seasonEarnings >= goal;
    state.seasonHistory.push({ season: state.season, earnings: state.seasonEarnings, goal, reached, harvests: state.totalHarvests });
    const bonus = reached ? 150 : 0;
    showModal(`TỔNG KẾT ${SEASON_NAMES[(state.season - 1) % 4].toLocaleUpperCase('vi-VN')}`, `<p>Mùa vụ đã khép lại. Đây là thành quả của Arthur:</p><div class="summary-score"><div><b>${state.seasonEarnings} xu</b><small>Thu nhập mùa</small></div><div><b>${state.totalHarvests}</b><small>Nông sản thu hoạch</small></div><div><b>${state.seasonEarnings >= goal ? 'ĐẠT' : 'CHƯA ĐẠT'}</b><small>Mục tiêu ${goal} xu</small></div></div><div class="modal-note">${reached ? `🎉 Mục tiêu mùa đạt được · thưởng thêm ${bonus} xu.` : `Mùa tới mục tiêu tăng lên ${goal + 300} xu. Thử chế biến và nhận đơn làng để bán được giá hơn.`}</div><div class="modal-actions"><button class="retro-btn" data-action="next-season">MỞ MÙA TIẾP THEO »</button></div>`);
    if (reached) state.coins += bonus;
    save();
  }

  function nextSeason() {
    state.season++;
    state.day = 1;
    state.seasonEarnings = 0;
    state.plots = Array.from({ length: data.meta.plotPositions.length }, () => null);
    state.energy = data.meta.maxEnergy;
    gameMinute = 360;
    setWeatherForCurrentDay();
    generateOrders(true);
    addFeed('HỆ THỐNG', `${SEASON_NAMES[(state.season - 1) % 4]} bắt đầu. Hạt giống và công thức mới đang chờ mở khóa.`);
    closeModal();
    renderAll();
  }

  function setWeatherForCurrentDay() {
    if (state.pricesDay === state.day && Object.keys(state.prices || {}).length) return;
    const event = data.events.find((item) => item.day === state.day);
    let id = event?.weather || WEATHER_BY_DAY[(state.day - 1) % WEATHER_BY_DAY.length];
    if (state.season > 1 && state.day > 1) {
      const shift = (state.season + state.day) % data.weather.length;
      if (Math.random() < .22) id = data.weather[shift].id;
    }
    state.weatherId = id;
    const movement = data.meta.seasonLength;
    const eventToday = data.events.find((item) => item.day === state.day);
    state.marketMood = eventToday?.sell || (weatherFor(id).price || 1) * (0.88 + Math.random() * .25);
    state.prices = {};
    data.crops.forEach((crop) => { state.prices[crop.id] = Math.max(1, Math.round(crop.price * state.marketMood)); });
    state.pricesDay = state.day;
    if (movement) save();
  }

  function generateOrders(log) {
    if (state.ordersDay === state.day && state.orders.length) return;
    state.orders = [];
    const ids = ['madeline', 'barnaby', 'eleanor', 'cedric'];
    for (let i = 0; i < 3; i++) {
      const villager = data.villagers.find((item) => item.id === ids[(state.day + state.season + i) % ids.length]);
      const cropId = villager.orders[(state.day + i) % villager.orders.length];
      const quantity = 2 + ((state.day + i) % 3);
      state.orders.push({ id: `${state.season}-${state.day}-${villager.id}`, villager: villager.id, crop: cropId, quantity, fulfilled: false });
    }
    state.ordersDay = state.day;
    if (log) addFeed('THƯƠNG NHÂN', 'Bảng đơn hàng làng đã cập nhật cho ngày mới. Giao hàng trước khi nghỉ nhé.');
  }

  function logDayStart() {
    const event = data.events.find((item) => item.day === state.day);
    if (event) addFeed('HỆ THỐNG', event.description);
    addFeed('HỆ THỐNG', `Ngày ${state.day} · ${weatherFor(state.weatherId).name} · giá chợ đã cập nhật.`);
    if (state.day >= 9 && state.day < 10) addFeed('LÀNG', 'Eleanor: Ngày mai sẽ có mưa sao băng. Hạt giống ngoài trời lớn nhanh lắm!');
    if (state.day >= 14 && state.day < 15) addFeed('LÀNG', 'Madeline: Hội chợ mùa xuân bắt đầu vào ngày mai. Mang nông sản ra chợ nhé.');
  }

  function updateClock() {
    if (!state) return;
    gameMinute += 5;
    if (gameMinute >= 18 * 60) gameMinute = 18 * 60;
    const hours = String(Math.floor(gameMinute / 60)).padStart(2, '0');
    const minutes = String(gameMinute % 60).padStart(2, '0');
    $('clockLabel').textContent = `${hours}:${minutes}`;
    $('healthLabel').textContent = `${state.health}/12`;
  }

  function renderAll() {
    if (!state) return;
    updateHud();
    renderPlots();
    renderWorldEntities();
    renderFarmPanel();
    renderFeed();
    updateQuest();
    updateCamera();
    save();
  }

  function updateHud() {
    $('levelBadge').textContent = String(state.level);
    $('coinLabel').textContent = format(state.coins);
    $('xpLabel').textContent = `${state.xp}/${state.level * 300}`;
    $('energyLabel').textContent = `${state.energy}/${data.meta.maxEnergy}`;
    $('energyBar').style.width = `${(state.energy / data.meta.maxEnergy) * 100}%`;
    $('weatherIcon').textContent = weatherFor(state.weatherId).icon;
    $('weatherLabel').textContent = weatherFor(state.weatherId).name;
    $('windLabel').textContent = weatherFor(state.weatherId).wind;
    $('eventText').textContent = eventBanner();
  }

  function eventBanner() {
    const event = data.events.find((item) => item.day === state.day);
    const seasonName = SEASON_NAMES[(state.season - 1) % 4].toLocaleUpperCase('vi-VN');
    const msg = event ? `NGÀY ${state.day}: ${event.name} · ${event.description}` : `NGÀY ${state.day}: ${seasonName} · MÙA ${state.season}`;
    return `★ ${msg.toLocaleUpperCase('vi-VN')} ★`;
  }

  function renderPlots() {
    document.querySelectorAll('.plot-hit').forEach((button) => {
      const index = Number(button.dataset.plot);
      const plot = state.plots[index];
      button.className = `plot-hit ${state.selectedPlot === index ? 'selected' : ''}`;
      button.innerHTML = '';
      if (!plot) {
        button.classList.add('empty');
        button.setAttribute('aria-label', `Ô đất ${index + 1}, đất trống`);
        return;
      }
      const crop = getCrop(plot.crop);
      const stage = plot.ready ? 3 : clamp(Math.floor((1 - plot.daysLeft / crop.days) * 3) + 1, 1, 2);
      button.classList.add('planted');
      if (plot.watered) button.classList.add('watered');
      if (plot.ready) button.classList.add('ready');
      button.setAttribute('aria-label', `${crop.name}, ${plot.ready ? 'đã chín' : `còn ${plot.daysLeft} ngày`}`);
      button.innerHTML = `<span class="plot-sprite-anchor"><span class="plot-crop stage-${stage} ${plot.ready ? 'ready' : ''}">${crop.stages[stage]}</span></span>${plot.watered ? '<span class="plot-water">&#128167;</span>' : ''}${plot.ready ? `<span class="plot-label">CH&Iacute;N &middot; ${crop.name}</span>` : ''}${plot.fertilized ? '<span class="plot-fertilizer">&#10024;</span>' : ''}`;
    });
  }

  function renderHotbar() {
    const root = $('hotbar');
    if (!root) return;
    root.innerHTML = '';
    data.hotbar.forEach((item, index) => {
      const button = document.createElement('button');
      button.className = `hotbar-slot ${state.selectedSlot === index ? 'active' : ''}`;
      button.type = 'button';
      button.title = `[${index + 1}] ${item.name}`;
      button.innerHTML = `<span class="slot-key">${index + 1}</span><span class="slot-icon">${index === 2 ? getCrop(state.selectedSeed).stages[1] : item.icon}</span><span class="slot-count">${slotCount(item.id)}</span>`;
      button.addEventListener('click', () => {
        if (index === 2) return seedPickerMenu();
        selectSlot(index);
      });
      root.appendChild(button);
    });
  }

  function slotCount(id) {
    if (id === 'water') return `${state.water}/10`;
    if (id === 'seeds') return `x${state.inventory.seeds[state.selectedSeed] || 0}`;
    if (id === 'fertilizer') return `x${state.fertilizer}`;
    if (id === 'lunch') return `x${state.lunch}`;
    if (id === 'tea') return `x${state.tea}`;
    return state.tools[id] ?? 1;
  }

  function renderFarmPanel() {
    const mill = Boolean(state.machines.mill);
    $('millStatus').textContent = mill ? 'SẴN SÀNG' : 'CHƯA XÂY';
    $('millDetail').textContent = mill ? (state.jobs.some((job) => job.workshop === 'mill') ? 'Đang xay · nhấn để xem tiến độ.' : 'Bột ngô và bột mì có thể làm ngay.') : 'Xây cối xay để làm bột từ lúa mì và ngô.';
    $('millProgress').style.width = mill ? (state.jobs.some((job) => job.workshop === 'mill') ? '48%' : '100%') : '0%';
    const counts = [];
    if (state.animals.cow) counts.push(`Bò sữa x${state.animals.cow}: ${state.inventory.goods.milk || 0} sữa`);
    if (state.animals.chicken) counts.push(`Gà mái x${state.animals.chicken}: ${state.inventory.goods.egg || 0} trứng`);
    if (state.animals.bee) counts.push(`Tổ ong x${state.animals.bee}: ${state.inventory.goods.honey || 0} mật`);
    if (state.animals.sheep) counts.push(`Cừu x${state.animals.sheep}: ${state.inventory.goods.wool || 0} len`);
    $('barnStatus').textContent = counts.length ? counts.join(' · ') : 'Chưa có vật nuôi · nhấn vào chuồng để mở.';
  }

  function updateQuest() {
    const step = data.tutorial[state.tutorialStep];
    if (state.tutorialDone || !step) {
      $('questNumber').textContent = '✓';
      $('questTitle').textContent = 'MÙA ĐẦU ĐANG CHỜ ARTHUR';
      $('questDescription').textContent = `Kiếm ${data.meta.seasonGoal + (state.season - 1) * 300} xu trước ngày 30. Trồng cây, chế biến và giao đơn làng.`;
      $('questProgressText').textContent = `${state.seasonEarnings}/${data.meta.seasonGoal + (state.season - 1) * 300} XU`;
      $('questProgressBar').style.width = `${Math.min(100, state.seasonEarnings / (data.meta.seasonGoal + (state.season - 1) * 300) * 100)}%`;
      $('questState').textContent = 'MÙA VỤ';
      $('questGo').textContent = 'MỞ BẢNG »';
      return;
    }
    $('questNumber').textContent = String(state.tutorialStep + 1).padStart(2, '0');
    $('questTitle').textContent = step.title.toLocaleUpperCase('vi-VN');
    $('questDescription').textContent = step.description;
    $('questProgressText').textContent = `0/${step.target} BƯỚC`;
    $('questProgressBar').style.width = '0%';
    $('questState').textContent = 'ĐANG LÀM';
    $('questGo').textContent = 'ĐẾN NƠI »';
  }

  function completeTutorial(verb) {
    if (state.tutorialDone) return;
    const step = data.tutorial[state.tutorialStep];
    if (!step || step.verb !== verb) return;
    const reward = step.reward || {};
    state.coins += reward.coins || 0;
    state.seasonEarnings += reward.coins || 0;
    if (reward.xp) addXp(reward.xp);
    addFeed('HỆ THỐNG', `Nhiệm vụ hoàn thành: ${step.title} · +${reward.coins || 0} xu.`);
    state.tutorialStep++;
    if (state.tutorialStep >= data.tutorial.length) {
      state.tutorialDone = true;
      notify('Đã nắm vòng lặp nông trại! Thử xây xưởng để chế biến nông sản.');
    }
  }

  function goToQuestTarget() {
    if (state.tutorialDone) return marketMenu('orders');
    const step = data.tutorial[state.tutorialStep];
    if (!step) return;
    if (step.verb === 'plant') {
      state.selectedSeed = 'cabbage';
      const i = nearestPlot((p) => !p);
      if (i >= 0) handlePlotClick(i); else notify('Các luống đất đã kín cây.');
    } else if (step.verb === 'water') {
      const i = nearestPlot((p) => p && !p.watered && !p.ready);
      if (i >= 0) handlePlotClick(i); else notify('Gieo một hạt giống trước nhé.');
    } else if (step.verb === 'sleep') restPrompt();
    else if (step.verb === 'harvest') {
      const i = nearestPlot((p) => p && p.ready);
      if (i >= 0) handlePlotClick(i); else notify('Tưới cây rồi nghỉ qua ngày để cây lớn.');
    } else if (step.verb === 'sell') goToObject('market');
    else if (step.verb === 'build') goToObject('house');
  }

  function addXp(amount) {
    state.xp += amount;
    while (state.xp >= state.level * 300) {
      state.xp -= state.level * 300;
      state.level++;
      state.energy = data.meta.maxEnergy;
      state.coins += 50;
      state.seasonEarnings += 50;
      notify(`Lên cấp nông dân ${state.level}! +50 xu và hồi thể lực.`);
    }
  }

  function toggleAuto() {
    state.autoFarm = !state.autoFarm;
    notify(state.autoFarm ? 'Tự động: Arthur sẽ dùng thể lực để tưới cây khi có thể.' : 'Đã tắt tự động chăm cây.');
    addFeed('HỆ THỐNG', state.autoFarm ? 'Chế độ tự động đã bật.' : 'Chế độ tự động đã tắt.');
    renderAll();
  }

  function autoTendOne() {
    if (!state.autoFarm || state.energy < 1 || state.water < 1) return;
    const plot = state.plots.find((item) => item && !item.ready && !item.watered);
    if (!plot) return;
    plot.watered = true;
    state.water--;
    state.energy--;
    renderAll();
  }

  function workshopMenu(focusId = null) {
    const cards = data.workshops.map((machine) => {
      const owned = Boolean(state.machines[machine.id]);
      const focused = focusId === machine.id;
      return `<div class="data-card"><span class="emoji">${machine.icon}</span><div class="info"><strong>${machine.name}</strong><small>${machine.description}</small><small>${owned ? 'Đã xây · có công thức dùng ngay' : `Chi phí xây: ${machine.cost} xu`}</small></div><button class="retro-btn" data-action="${owned && (focused || !focusId) ? 'open-workshop' : 'build-workshop'}" data-id="${machine.id}">${owned ? 'VÀO XƯỞNG' : 'XÂY'}</button></div>`;
    }).join('');
    const recipeCount = data.recipes.length;
    showModal('NHÀ & XƯỞNG CHẾ BIẾN', `<p>Chế biến là cách tăng giá trị nông sản. Mỗi xưởng mới có ít nhất một công thức làm được ngay bằng nông sản đầu mùa.</p><div class="modal-note">${recipeCount} công thức · ${Object.keys(state.machines).filter((id) => state.machines[id]).length} xưởng đã xây · Xu: ${format(state.coins)}</div><div class="data-grid">${cards}</div><p class="locked-note">Xưởng đã xây vẫn hoạt động qua các mùa. Đơn hàng làng và chế biến giúp đạt mục tiêu 700 xu mùa đầu.</p>`);
  }

  function openWorkshop(id) {
    const machine = data.workshops.find((item) => item.id === id);
    if (!machine) return;
    const recipes = data.recipes.filter((recipe) => recipe.workshop === id);
    const rows = recipes.map((recipe) => {
      const unlocked = recipe.unlock.startsWith('Có ngay') || recipe.unlock === 'Câu được cá Rô' && state.inventory.goods.perch > 0 || (recipe.unlock.includes('Cấp 2') && state.level >= 2) || (recipe.unlock.includes('Cấp 3') && state.level >= 3) || (recipe.unlock.includes('Thu hoạch') && state.totalHarvests >= Number(recipe.unlock.match(/\d+/)?.[0] || 99)) || recipe.unlock.includes('Xây chuồng') && state.animals.cow > 0;
      const ingredients = Object.entries(recipe.inputs).map(([key, amount]) => `${amount} ${resourceName(key)}`).join(' + ');
      const available = Object.entries(recipe.inputs).every(([key, amount]) => resourceCount(key) >= amount);
      const time = recipe.days ? `Ủ ${recipe.days} ngày` : 'Làm ngay';
      return `<div class="recipe-row"><span>${recipe.icon}</span><div style="flex:1"><strong>${recipe.name}</strong><small>${ingredients} → ${recipe.amount} · ${time} · bán ${recipe.value} xu · lời +${recipe.profit}%</small><small>${unlocked ? `Nguyên liệu: ${available ? 'đủ' : 'còn thiếu'}` : `Chưa mở: ${recipe.unlock}`}</small></div><button class="retro-btn" data-action="craft" data-id="${recipe.id}" ${!unlocked || !available ? 'disabled' : ''}>${recipe.days ? 'CHẾ BIẾN' : 'LÀM'}</button></div>`;
    }).join('');
    showModal(machine.name.toLocaleUpperCase('vi-VN'), `<p>${machine.description}</p><div class="modal-note">Mỗi công thức ghi rõ nguyên liệu, thời gian và lợi nhuận so với bán thô.</div>${rows || '<p>Chưa có công thức.</p>'}<div class="modal-actions"><button class="retro-btn" data-action="workshop-home">DANH SÁCH XƯỞNG</button></div>`);
  }

  function buildWorkshop(id) {
    const machine = data.workshops.find((item) => item.id === id);
    if (!machine || state.machines[id]) return openWorkshop(id);
    if (state.coins < machine.cost) return notify('Chưa đủ xu để xây xưởng.');
    state.coins -= machine.cost;
    state.machines[id] = true;
    completeTutorial('build');
    addFeed('HỆ THỐNG', `Đã xây ${machine.name}. Công thức đầu tiên mở ngay!`);
    notify(`${machine.name} đã xây xong!`);
    renderAll();
    openWorkshop(id);
  }

  function craft(recipeId) {
    const recipe = data.recipes.find((item) => item.id === recipeId);
    if (!recipe || !state.machines[recipe.workshop]) return notify('Cần xây xưởng trước.');
    for (const [key, amount] of Object.entries(recipe.inputs)) {
      if (resourceCount(key) < amount) return notify(`Chưa đủ ${resourceName(key)} để làm món này.`);
    }
    Object.entries(recipe.inputs).forEach(([key, amount]) => takeResource(key, amount));
    if (recipe.days > 0) {
      state.jobs.push({ recipeId, workshop: recipe.workshop, output: recipe.output, amount: recipe.amount, readyDay: state.day + recipe.days });
      notify(`${recipe.name} đang chế biến · xong sau ${recipe.days} ngày.`);
    } else {
      state.inventory.goods[recipe.output] = (state.inventory.goods[recipe.output] || 0) + recipe.amount;
      addXp(8);
      addFeed('HỆ THỐNG', `${recipe.name} đã làm xong · giá bán ${recipe.value} xu.`);
      notify(`Đã chế biến ${recipe.name}!`);
    }
    renderAll();
    openWorkshop(recipe.workshop);
  }

  function barnMenu() {
    const cards = data.buildings.filter((building) => !state.buildings[building.id]).map((building) => {
      const owned = Boolean(state.buildings[building.id]);
      return `<div class="data-card"><span class="emoji">${building.icon}</span><div class="info"><strong>${building.name}</strong><small>${building.description}</small><small>${owned ? 'Đã xây' : `Xây: ${building.cost} xu`}</small></div><button class="retro-btn" data-action="build-building" data-id="${building.id}" ${owned ? 'disabled' : ''}>${owned ? 'ĐÃ XÂY' : 'XÂY'}</button></div>`;
    }).join('');
    const animals = data.animals.map((animal) => {
      const count = state.animals[animal.id] || 0;
      const available = state.buildings[animal.building];
      return `<div class="recipe-row"><span>${animal.icon}</span><div style="flex:1"><strong>${animal.name} · ${count} con</strong><small>Giá ${animal.cost} xu · cần ${resourceName(animal.feed)} mỗi ngày · sản phẩm: ${animal.productName}</small></div><button class="retro-btn" data-action="buy-animal" data-id="${animal.id}" ${!available ? 'disabled' : ''}>MUA 1</button></div>`;
    }).join('');
    showModal('CHUỒNG TRẠI · MUA VẬT NUÔI', `<p>Chuồng trại và chuồng gà đã có sẵn. Chọn vật nuôi để đưa vào khu chuồng; mỗi con cần thức ăn hằng ngày.</p><div class="modal-note">Đang nuôi: gà ${state.animals.chicken} · bò ${state.animals.cow} · ong ${state.animals.bee} · cừu ${state.animals.sheep}</div><h3>Mua vật nuôi</h3>${animals}${cards ? `<h3>Xây thêm khu chăn nuôi</h3><div class="data-grid">${cards}</div>` : ""}`);
  }

  function workerMenu() {
    const cards = (data.workers || []).map((worker) => {
      const hired = Boolean(state.workers[worker.id]);
      return `<div class="worker-card"><span class="worker-icon">${worker.icon}</span><div class="worker-info"><strong>${worker.name}</strong><p>${worker.effect}</p><small>Thuê ${worker.hireCost} xu · Lương ${worker.wage} xu/ngày</small></div><button class="retro-btn" data-action="hire-worker" data-id="${worker.id}" ${hired ? 'disabled' : ''}>${hired ? 'ĐÃ THUÊ' : 'THUÊ'}</button></div>`;
    }).join('');
    const upkeep = (data.workers || []).filter((worker) => state.workers[worker.id]).reduce((sum, worker) => sum + worker.wage, 0);
    showModal('VĂN PHÒNG THUÊ NHÂN CÔNG', `<p>Chọn người làm phù hợp với nông trại. Phí thuê trả một lần; lương tự trừ khi kết thúc mỗi ngày. Nếu thiếu xu, nhân công nghỉ và hiệu quả tạm dừng.</p><div class="modal-note">Xu hiện có: ${format(state.coins)} · Quỹ lương hiện tại: ${upkeep} xu/ngày</div><div class="worker-list">${cards}</div>`);
  }

  function hireWorker(id) {
    const worker = (data.workers || []).find((item) => item.id === id);
    if (!worker || state.workers[id]) return;
    if (state.coins < worker.hireCost) return notify(`Cần ${worker.hireCost} xu để thuê ${worker.name}.`);
    state.coins -= worker.hireCost;
    state.workers[id] = { hiredAt: state.day, activeToday: false };
    addFeed('HỆ THỐNG', `Đã thuê ${worker.name}. Lương ${worker.wage} xu sẽ được tính mỗi ngày.`);
    renderAll();
    workerMenu();
  }

  function buildAnimalHouse(id) {
    const building = data.buildings.find((item) => item.id === id);
    if (!building || state.buildings[id]) return;
    if (state.coins < building.cost) return notify('Chưa đủ xu để xây chuồng.');
    state.coins -= building.cost;
    state.buildings[id] = true;
    addFeed('HỆ THỐNG', `${building.name} đã hoàn thành.`);
    notify(`${building.name} đã xây xong.`);
    renderAll(); barnMenu();
  }

  function buyAnimal(id) {
    const animal = data.animals.find((item) => item.id === id);
    if (!animal || !state.buildings[animal.building]) return notify('Cần xây chuồng phù hợp trước.');
    if (state.coins < animal.cost) return notify('Chưa đủ xu mua con giống.');
    state.coins -= animal.cost;
    state.animals[id] = (state.animals[id] || 0) + 1;
    addFeed('HỆ THỐNG', `Đã mua ${animal.name}. Cho ăn ${resourceName(animal.feed)} để nhận ${animal.productName}.`);
    notify(`${animal.name} đã chuyển tới nông trại.`);
    renderAll(); barnMenu();
  }

  function marketMenu(tab = 'nongsan') {
    currentMarketTab = tab;
    const priceTrend = state.marketMood >= 1.05 ? '📈 Giá tốt hôm nay' : state.marketMood <= .92 ? '📉 Giá đang thấp' : '↔ Giá ổn định';
    const tabs = `<div class="modal-tabs"><button data-action="market-tab" data-tab="nongsan" class="${tab === 'nongsan' ? 'active' : ''}">NÔNG SẢN</button><button data-action="market-tab" data-tab="hatgiong" class="${tab === 'hatgiong' ? 'active' : ''}">HẠT GIỐNG</button><button data-action="market-tab" data-tab="donhang" class="${tab === 'donhang' ? 'active' : ''}">ĐƠN LÀNG</button></div>`;
    const content = tab === 'hatgiong' ? seedMarket() : tab === 'donhang' ? orderMarket() : produceMarket();
    const ad = `<div class="modal-note">${priceTrend} · Giá nông sản thay đổi mỗi ngày theo thời tiết và sự kiện.</div><div class="modal-actions"><button class="retro-btn" data-action="watch-ad" ${state.dailyRewardCount >= 2 ? 'disabled' : ''}>▶ XEM QUẢNG CÁO MẪU · +40 XU (${state.dailyRewardCount}/2)</button></div>`;
    showModal('CHỢ OAKSHIRE', `${tabs}<div id="marketContent">${content}</div>${ad}`);
  }

  function produceMarket() {
    const cropRows = data.crops.map((crop) => marketItemRow(crop.id, crop.name, crop.stages[3], state.inventory.produce[crop.id] || 0, getMarketPrice(crop.id), 'crop')).join('');
    const goodIds = [...new Set([...Object.keys(state.inventory.goods), ...data.recipes.map((recipe) => recipe.output), 'egg', 'milk', 'honey', 'wool', ...data.fish.map((fish) => fish.id)])];
    const goodsRows = goodIds.map((id) => marketItemRow(id, resourceName(id), resourceIcon(id), state.inventory.goods[id] || 0, getResourcePrice(id), 'good')).join('');
    return `<div class="market-board"><strong>📊 BẢNG TỈ GIÁ · NGÀY ${state.day}</strong><span>Giá mua vào = giá bán ra + phí thương nhân · Giá thay đổi theo thời tiết và sự kiện.</span><span>🔸 Nông sản · 🔹 Sản phẩm chế biến, vật nuôi và cá</span></div><div class="modal-note">Quỹ mùa vụ: ${state.seasonEarnings} xu · Tiền mang theo: ${state.coins} xu</div><div class="market-list"><h3 class="market-category">NÔNG SẢN</h3>${cropRows}<h3 class="market-category">HÀNG HÓA & THÀNH PHẨM</h3>${goodsRows}</div><div class="modal-actions"><button class="retro-btn" data-action="sell-all">BÁN TẤT CẢ NÔNG SẢN</button><button class="retro-btn" data-action="orders-open">XEM ĐƠN HÀNG LÀNG</button></div>`;
  }

  function marketItemRow(id, name, icon, count, price, type) {
    const buyPrice = Math.ceil(price * 1.35);
    const locked = type === 'crop' && !isCropUnlocked(getCrop(id));
    return `<div class="recipe-row market-row"><span>${icon}</span><div class="market-item-info"><strong>${name} · kho x${count}</strong><small>Mua ${buyPrice} xu · Bán ${price} xu / món</small></div><button class="retro-btn" data-action="buy-item" data-id="${id}" data-kind="${type}" data-price="${buyPrice}" ${locked ? 'disabled title="Giống này chưa mở khóa"' : ''}>MUA 1</button><button class="retro-btn" data-action="sell-item" data-id="${id}" data-kind="${type}" ${count < 1 ? 'disabled' : ''}>BÁN 1</button><button class="retro-btn" data-action="sell-item" data-id="${id}" data-kind="${type}" data-all="true" ${count < 1 ? 'disabled' : ''}>BÁN HẾT</button></div>`;
  }

  function buyMarketItem(id, kind, price) {
    if (state.coins < price) return notify(`Không đủ xu. Cần ${price} xu, hiện có ${state.coins} xu.`);
    state.coins -= price;
    if (kind === 'crop') state.inventory.produce[id] = (state.inventory.produce[id] || 0) + 1;
    else state.inventory.goods[id] = (state.inventory.goods[id] || 0) + 1;
    addFeed('THƯƠNG NHÂN', `Đã mua 1 ${resourceName(id)} với giá ${price} xu.`);
    renderAll(); marketMenu('nongsan');
  }

  function seedMarket() {
    return `<div class="modal-note">Mỗi gói có 3 hạt giống. Hạt giống mở bằng cấp nông dân, mốc thu hoạch hoặc giấy phép.</div>${data.crops.map((crop) => {
      const unlocked = isCropUnlocked(crop);
      const count = state.inventory.seeds[crop.id] || 0;
      const locked = !unlocked;
      let action = '';
      if (!unlocked && crop.unlock.startsWith('Giấy phép')) {
        const cost = Number(crop.unlock.match(/\d+/)?.[0] || 0);
        action = `<button class="retro-btn" data-action="unlock-crop" data-id="${crop.id}">MỞ · ${cost} XU</button>`;
      } else if (!unlocked) action = `<button class="retro-btn" disabled>${crop.unlock}</button>`;
      else action = `<button class="retro-btn" data-action="buy-seed" data-id="${crop.id}">MUA 3 · ${crop.seedPrice * 3} XU</button>`;
      return `<div class="recipe-row"><span>${crop.stages[3]}</span><div style="flex:1"><strong>${crop.name} · đang có ${count} hạt</strong><small>${crop.days} ngày · thu ${crop.yield} · giá gốc ${crop.price} xu · ${crop.season}</small><small>${locked ? `🔒 ${crop.unlock}` : crop.group}</small></div>${action}</div>`;
    }).join('')}`;
  }

  function orderMarket() {
    return `<div class="modal-note">Giao đúng đơn được trả 1,5 lần giá chợ và tăng thân thiết. Món dân làng yêu thích được trả 1,8 lần.</div>${state.orders.map((order) => {
      const villager = data.villagers.find((item) => item.id === order.villager);
      const crop = getCrop(order.crop);
      const have = state.inventory.produce[order.crop] || 0;
      const favorite = villager.favorite === order.crop;
      const reward = Math.round(getMarketPrice(order.crop) * order.quantity * (favorite ? 1.8 : 1.5));
      return `<div class="order-row"><span>${villager.icon}</span><div style="flex:1"><strong>${villager.name} · ${order.quantity} ${crop.name}</strong><small>${villager.role} · có ${have}/${order.quantity} · ${favorite ? 'MÓN YÊU THÍCH ×1,8' : 'THƯỞNG ×1,5'} · +${reward} xu</small></div><button class="retro-btn" data-action="fulfill-order" data-id="${order.id}" ${order.fulfilled || have < order.quantity ? 'disabled' : ''}>${order.fulfilled ? 'ĐÃ GIAO' : 'GIAO'}</button></div>`;
    }).join('')}`;
  }

  function buySeed(id) {
    const crop = getCrop(id);
    if (!crop || !isCropUnlocked(crop)) return;
    const amount = 3;
    const cost = crop.seedPrice * amount;
    if (state.coins < cost) return notify('Chưa đủ xu mua hạt giống.');
    state.coins -= cost;
    state.inventory.seeds[id] = (state.inventory.seeds[id] || 0) + amount;
    renderAll(); marketMenu('hatgiong');
    notify(`Đã mua ${amount} hạt ${crop.name}.`);
  }

  function unlockCrop(id) {
    const crop = getCrop(id);
    if (!crop || isCropUnlocked(crop) || !crop.unlock.startsWith('Giấy phép')) return;
    const cost = Number(crop.unlock.match(/\d+/)?.[0] || 0);
    if (state.coins < cost) return notify('Chưa đủ xu mua giấy phép giống.');
    state.coins -= cost;
    state.unlockedCrops[id] = true;
    state.inventory.seeds[id] = (state.inventory.seeds[id] || 0) + 3;
    addFeed('THƯƠNG NHÂN', `Đã mở giấy phép trồng ${crop.name}.`);
    renderAll(); marketMenu('hatgiong');
  }

  function isCropUnlocked(crop) {
    if (!crop) return false;
    if (state.unlockedCrops[crop.id]) return true;
    if (crop.unlock === 'Mở đầu') return true;
    const level = crop.unlock.match(/Cấp (\d+)/);
    if (level && state.level >= Number(level[1])) { state.unlockedCrops[crop.id] = true; return true; }
    const harvest = crop.unlock.match(/Thu hoạch (\d+)/);
    if (harvest && state.totalHarvests >= Number(harvest[1])) { state.unlockedCrops[crop.id] = true; return true; }
    return false;
  }

  function sellItem(id, kind, all = false) {
    const collection = kind === 'crop' ? state.inventory.produce : state.inventory.goods;
    const quantity = all ? collection[id] || 0 : Math.min(1, collection[id] || 0);
    if (!quantity) return notify('Không có món này trong túi.');
    const total = quantity * getResourcePrice(id);
    collection[id] -= quantity;
    state.coins += total;
    state.seasonEarnings += total;
    addXp(Math.max(1, Math.floor(total / 18)));
    completeTutorial('sell');
    showFloating({ x: worldWidth() * .64, y: data.meta.world.height * .64 }, `+${total} xu`);
    addFeed('THƯƠNG NHÂN', `Đã bán ${quantity} ${resourceName(id)} được ${total} xu.`);
    renderAll(); marketMenu('nongsan');
  }

  function sellAll() {
    let total = 0;
    let count = 0;
    for (const crop of data.crops) {
      const amount = state.inventory.produce[crop.id] || 0;
      total += amount * getMarketPrice(crop.id); count += amount; state.inventory.produce[crop.id] = 0;
    }
    for (const [id, amount] of Object.entries(state.inventory.goods)) {
      if (!amount) continue;
      total += amount * getResourcePrice(id); count += amount; state.inventory.goods[id] = 0;
    }
    if (!count) return notify('Chưa có nông sản để bán.');
    state.coins += total; state.seasonEarnings += total; addXp(Math.max(1, Math.floor(total / 18)));
    completeTutorial('sell'); addFeed('THƯƠNG NHÂN', `Đã bán tất cả ${count} nông sản và hàng chế biến · +${total} xu.`);
    renderAll(); marketMenu('nongsan');
  }

  function fulfillOrder(orderId) {
    const order = state.orders.find((item) => item.id === orderId);
    if (!order || order.fulfilled) return;
    const villager = data.villagers.find((item) => item.id === order.villager);
    if ((state.inventory.produce[order.crop] || 0) < order.quantity) return notify('Chưa gom đủ nông sản cho đơn này.');
    const favorite = villager.favorite === order.crop;
    const multiplier = favorite ? 1.8 : 1.5;
    const reward = Math.round(getMarketPrice(order.crop) * order.quantity * multiplier);
    state.inventory.produce[order.crop] -= order.quantity;
    state.coins += reward; state.seasonEarnings += reward; state.deliveredOrders++;
    state.friendship[villager.id] = (state.friendship[villager.id] || 0) + (favorite ? 2 : 1);
    order.fulfilled = true;
    addXp(8 + order.quantity * 2);
    completeTutorial('sell');
    addFeed('LÀNG', `${villager.name}: Cảm ơn Arthur! +${reward} xu · thân thiết ${state.friendship[villager.id]} ♥.`);
    renderAll(); marketMenu('donhang');
  }

  function watchAd() {
    if (state.dailyRewardCount >= 2) return notify('Đã dùng hết lượt quảng cáo thưởng hôm nay.');
    const button = $('modalRoot').querySelector('[data-action="watch-ad"]');
    if (button) { button.disabled = true; button.textContent = 'ĐANG PHÁT QUẢNG CÁO MẪU…'; }
    setTimeout(() => {
      state.dailyRewardCount++;
      state.coins += 40; state.seasonEarnings += 40;
      addFeed('HỆ THỐNG', 'Đã xem hết quảng cáo mô phỏng · +40 xu. Bản demo chưa nối SDK quảng cáo.');
      renderAll(); marketMenu(currentMarketTab); notify('Thưởng quảng cáo mô phỏng · +40 xu.');
    }, 1400);
  }

  function villagerMenu(id) {
    currentVillager = data.villagers.find((item) => item.id === id);
    if (!currentVillager) return;
    const order = state.orders.find((item) => item.villager === id && !item.fulfilled);
    const friendship = state.friendship[id] || 0;
    const orderText = order ? `${order.quantity} ${getCrop(order.crop).name} · thưởng ${Math.round(getMarketPrice(order.crop) * order.quantity * (currentVillager.favorite === order.crop ? 1.8 : 1.5))} xu` : 'Hôm nay đã nhận đủ đơn từ người này.';
    showModal(currentVillager.name.toLocaleUpperCase('vi-VN'), `<p>“${currentVillager.greeting}”</p><div class="data-card"><span class="emoji">${currentVillager.icon}</span><div class="info"><strong>${currentVillager.role}</strong><small>Thân thiết: ${friendship}/3 ♥</small><small>Món yêu thích: ${resourceName(currentVillager.favorite)}</small></div></div><div class="modal-note">Đơn hôm nay: ${orderText}</div>${order ? `<div class="modal-actions"><button class="retro-btn" data-action="fulfill-order" data-id="${order.id}" ${(state.inventory.produce[order.crop] || 0) < order.quantity ? 'disabled' : ''}>GIAO ĐƠN</button><button class="retro-btn" data-action="market-tab" data-tab="donhang">BẢNG ĐƠN LÀNG</button></div>` : ''}`);
    addFeed('LÀNG', `${currentVillager.name}: ${currentVillager.greeting}`);
  }

  function villageMenu() {
    const cards = data.villagers.map((villager) => `<div class="data-card"><span class="emoji">${villager.icon}</span><div class="info"><strong>${villager.name}</strong><small>${villager.role}</small><small>Thân thiết: ${state.friendship[villager.id] || 0}/3</small></div><button class="retro-btn" data-action="villager-talk" data-id="${villager.id}">TRÒ CHUYỆN</button></div>`).join('');
    showModal('DÂN LÀNG OAKSHIRE', `<p>Dân làng ở quanh nông trại. Mở hồ sơ tại đây để xem lời chào, món yêu thích và đơn hàng trong ngày.</p><div class="data-grid">${cards}</div><div class="modal-actions"><button class="retro-btn" data-action="market-tab" data-tab="donhang">BẢNG ĐƠN HÀNG</button></div>`);
  }

  function fishingMenu() {
    if (!state.buildings.rod && !state.tools.fishingRod) state.tools.fishingRod = 1;
    closeSeedDock();
    $('fishDock').classList.add('open');
    $('fishDock').setAttribute('aria-hidden', 'false');
    $('gameViewport').classList.add('fishing-mode', 'game-pond-selected');
    const cast = $('fishDock').querySelector('[data-action="fish-cast"]');
    if (cast) cast.disabled = !fishing;
    save();
  }

  function closeFishDock() {
    const dock = $('fishDock');
    if (!dock) return;
    stopFishing();
    dock.classList.remove('open');
    dock.setAttribute('aria-hidden', 'true');
    $('gameViewport').classList.remove('fishing-mode', 'game-pond-selected');
  }
  function startFishing() {
    if (fishing) return;
    if (!ensureEnergy(1)) return;
    state.energy--; fishing = true; fishPhase = 0;
    const cast = $('fishDock').querySelector('[data-action="fish-cast"]');
    if (cast) cast.disabled = false;
    fishTimer = setInterval(() => {
      fishPhase = (fishPhase + 3.5) % 100;
      const marker = $('fishMarker');
      if (marker) marker.style.left = `${fishPhase}%`;
    }, 45);
    renderAll();
  }

  function castFish() {
    if (!fishing) return;
    stopFishing();
    if (fishPhase >= 40 && fishPhase <= 60) {
      const roll = Math.random() * 100;
      let total = 0;
      let caught = data.fish[data.fish.length - 1];
      for (const fish of data.fish) { total += fish.chance; if (roll < total) { caught = fish; break; } }
      state.inventory.goods[caught.id] = (state.inventory.goods[caught.id] || 0) + 1;
      addXp(8);
      addFeed('HỆ THỐNG', `Câu được ${caught.name}! Giá chợ hiện tại ${caught.price} xu.`);
      renderAll(); fishingMenu(); notify(`🎣 Câu được ${caught.name}!`);
    } else {
      renderAll(); fishingMenu(); notify('Cá tuột mất rồi. Canh vạch vàng trong vùng xanh nhé.');
    }
  }

  function stopFishing() { clearInterval(fishTimer); fishing = false; }

  function inventoryMenu() {
    const seedRows = data.crops.filter((crop) => state.inventory.seeds[crop.id] > 0).map((crop) => `<div class="inventory-row"><span>${crop.stages[1]} ${crop.name}</span><b>${state.inventory.seeds[crop.id]} h&#7841;t</b></div>`).join('') || '<p>Kho ch&#432;a c&oacute; h&#7841;t gi&#7889;ng.</p>';
    const produceRows = [...data.crops.map((crop) => [crop.id, crop.name, crop.stages[3], state.inventory.produce[crop.id] || 0]), ...Object.entries(state.inventory.goods).map(([id, amount]) => [id, resourceName(id), resourceIcon(id), amount])].filter((item) => item[3] > 0).map((item) => `<div class="inventory-row"><span>${item[2]} ${item[1]}</span><b>x${item[3]}</b></div>`).join('') || '<p>Kho n&ocirc;ng s&#7843;n &#273;ang tr&#7889;ng.</p>';
    const toolRows = data.hotbar.filter((item) => item.id !== 'seeds').map((item) => `<div class="inventory-row"><span>${item.icon} ${item.name}</span><b>${slotCount(item.id)}</b></div>`).join('');
    showModal('KHO N&Ocirc;NG TR&#7840;I', `<div class="storage-grid"><section class="storage-section"><h3>H&#7841;t gi&#7889;ng</h3><p>B&#7845;m v&agrave;o lu&#7889;ng &#273;&#7845;t &#273;&#7875; ch&#7885;n gi&#7889;ng gieo.</p>${seedRows}</section><section class="storage-section"><h3>N&ocirc;ng s&#7843;n v&agrave; v&#7853;t ph&#7849;m</h3>${produceRows}</section><section class="storage-section"><h3>D&#7909;ng c&#7909;</h3>${toolRows}<div class="modal-note">Th&#7875; l&#7921;c ${state.energy}/${data.meta.maxEnergy} &middot; N&#432;&#7899;c ${state.water}/10 &middot; Ph&acirc;n b&oacute;n ${state.fertilizer}</div></section></div><div class="modal-actions"><button class="retro-btn" data-action="export-save">T&#7840;O M&Atilde; &#272;&#7890;NG B&#7896;</button><button class="retro-btn" data-action="market-tab" data-tab="nongsan">T&#7898;I CH&#7906;</button></div>`);
  }

  function seedPickerMenu(plotIndex) {
    const crops = data.crops.filter((crop) => isCropUnlocked(crop));
    const rows = crops.map((crop) => {
      const count = state.inventory.seeds[crop.id] || 0;
      return `<button class="data-card seed-choice" data-action="select-seed" data-id="${crop.id}" data-plot="${plotIndex}" ${count < 1 ? 'disabled' : ''}><span class="emoji">${crop.stages[1]}</span><span class="info"><strong>${crop.name}</strong><small>${count} h&#7841;t &middot; ${crop.days} ng&agrave;y &middot; ${crop.season}</small></span><span class="seed-choice-count">x${count}</span></button>`;
    }).join('');
    const ready = crops.some((crop) => (state.inventory.seeds[crop.id] || 0) > 0);
    $('seedDockTitle').textContent = `CHỌN HẠT · LUỐNG ${plotIndex + 1}`;
    $('seedDockChoices').innerHTML = `${rows || '<span class="seed-empty">Chưa mở khóa hạt giống.</span>'}${ready ? '' : '<span class="seed-empty">Kho hết hạt. Mua thêm ở chợ.</span>'}`;
    $('seedDock').classList.add('open');
    $('seedDock').setAttribute('aria-hidden', 'false');
    $('gameViewport').classList.add('seed-choosing');
    $('gameViewport').focus({ preventScroll: true });
  }

  function closeSeedDock() {
    const dock = $('seedDock');
    if (!dock) return;
    dock.classList.remove('open');
    dock.setAttribute('aria-hidden', 'true');
    $('gameViewport').classList.remove('seed-choosing');
  }

  function handbookMenu() {
    const tabs = `<div class="modal-tabs"><button data-action="book-tab" data-tab="cay" class="${currentHandbookTab === 'cay' ? 'active' : ''}">CÂY TRỒNG</button><button data-action="book-tab" data-tab="congthuc" class="${currentHandbookTab === 'congthuc' ? 'active' : ''}">CÔNG THỨC</button><button data-action="book-tab" data-tab="lang" class="${currentHandbookTab === 'lang' ? 'active' : ''}">LỊCH LÀNG</button></div>`;
    let content;
    if (currentHandbookTab === 'congthuc') content = data.recipes.map((recipe) => `<div class="recipe-row"><span>${recipe.icon}</span><div style="flex:1"><strong>${recipe.name}</strong><small>${Object.entries(recipe.inputs).map(([id, n]) => `${n} ${resourceName(id)}`).join(' + ')} · ${recipe.days ? `Ủ ${recipe.days} ngày` : 'Làm ngay'} · ${recipe.value} xu · lời +${recipe.profit}%</small><small>${getWorkshopName(recipe.workshop)} · ${recipe.unlock}</small></div></div>`).join('');
    else if (currentHandbookTab === 'lang') content = data.events.map((event) => `<div class="recipe-row"><span>📅</span><div style="flex:1"><strong>Ngày ${event.day} · ${event.name}</strong><small>${event.description}</small></div></div>`).join('');
    else content = data.crops.map((crop) => `<div class="recipe-row"><span>${crop.stages[3]}</span><div style="flex:1"><strong>${crop.name}</strong><small>${crop.group} · ${crop.days} ngày · ${crop.yield} nông sản · giá gốc ${crop.price} xu</small><small>${crop.season} · cần ${crop.water} gáo nước · ${crop.unlock}</small></div></div>`).join('');
    showModal('SỔ TAY NÔNG DÂN', `<p>Mùa đầu có ${data.meta.seasonLength} ngày. Mục tiêu là kiếm ${data.meta.seasonGoal} xu. Chế biến, đơn làng và thời tiết giúp tăng giá trị mùa vụ.</p>${tabs}<div id="bookContent">${content}</div><div class="modal-actions"><button class="retro-btn" data-action="save-menu">TÀI KHOẢN & MÃ LƯU</button></div>`);
  }

  function saveMenu() {
    const code = exportCode();
    showModal('LƯU GAME & ĐỒNG BỘ', `<p>Game tự lưu trên trình duyệt sau mỗi thao tác. Mã dưới đây có thể dùng để chuyển tiến trình sang thiết bị khác.</p><label for="saveCodeInput">MÃ NÔNG TRẠI</label><input id="saveCodeInput" value="${code}" spellcheck="false"><div class="modal-actions"><button class="retro-btn" data-action="copy-save">SAO CHÉP MÃ</button><button class="retro-btn" data-action="import-save">NHẬP MÃ</button><button class="retro-btn" data-action="save-now">LƯU NGAY</button></div><div class="modal-note">Đăng nhập Google / lưu đám mây chưa nối trong bản web demo.</div>`);
  }

  function exportCode() {
    const bytes = new TextEncoder().encode(JSON.stringify(state));
    let binary = '';
    bytes.forEach((b) => { binary += String.fromCharCode(b); });
    return `OAK1-${btoa(binary)}`;
  }

  function importCode(code) {
    try {
      const raw = code.replace(/^OAK1-/, '');
      const binary = atob(raw);
      const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
      const parsed = JSON.parse(new TextDecoder().decode(bytes));
      if (!parsed || !Array.isArray(parsed.plots) || typeof parsed.coins !== 'number') throw new Error('invalid');
      localStorage.setItem(SAVE_KEY, JSON.stringify(parsed));
      location.reload();
    } catch { notify('Mã lưu không hợp lệ.'); }
  }

  function showModal(title, html) {
    closeSeedDock();
    closeFishDock();
    direction = { x: 0, y: 0 };
    destination = null;
    walkPath = [];
    walkPathIndex = 0;
    pendingAction = null;
    state.running = false;
    $('arthur').classList.remove('walking');
    const root = $('modalRoot');
    root.innerHTML = `<section class="modal" role="dialog" aria-modal="true"><div class="modal-header"><h2>${title}</h2><button class="modal-close" data-action="modal-close" aria-label="Đóng">×</button></div><div class="modal-content">${html}</div></section>`;
    root.classList.add('open');
    const close = root.querySelector('.modal-close');
    if (close) close.focus({ preventScroll: true });
    root.onclick = (event) => { if (event.target === root) closeModal(); };
    save();
  }

  function closeModal() {
    if (fishing) stopFishing();
    $('modalRoot').classList.remove('open');
    $('modalRoot').innerHTML = '';
    $('modalRoot').onclick = null;
    $('gameViewport').focus?.({ preventScroll: true });
  }

  function isModalOpen() { return $('modalRoot').classList.contains('open'); }

  function onModalClick(event) {
    const button = event.target.closest('[data-action]');
    if (!button || button.disabled) return;
    const action = button.dataset.action;
    const id = button.dataset.id;
    if (action === 'modal-close') closeModal();
    if (action === 'market-tab') marketMenu(button.dataset.tab);
    if (action === 'orders-open') marketMenu('donhang');
    if (action === 'buy-seed') buySeed(id);
    if (action === 'unlock-crop') unlockCrop(id);
    if (action === 'sell-item') sellItem(id, button.dataset.kind, button.dataset.all === 'true');
    if (action === 'buy-item') buyMarketItem(id, button.dataset.kind, Number(button.dataset.price));
    if (action === 'sell-all') sellAll();
    if (action === 'fulfill-order') fulfillOrder(id);
    if (action === 'watch-ad') watchAd();
    if (action === 'build-workshop') buildWorkshop(id);
    if (action === 'open-workshop') openWorkshop(id);
    if (action === 'workshop-home') workshopMenu();
    if (action === 'craft') craft(id);
    if (action === 'build-building') buildAnimalHouse(id);
    if (action === 'buy-animal') buyAnimal(id);
    if (action === 'hire-worker') hireWorker(id);
    if (action === 'villager-talk') villagerMenu(id);
    if (action === 'fish-start') startFishing();
    if (action === 'fish-cast') castFish();
    if (action === 'rest-confirm') endDay();
    if (action === 'next-season') nextSeason();
    if (action === 'select-seed') { state.selectedSeed = id; state.selectedSlot = 2; const plotIndex = button.dataset.plot; closeModal(); renderAll(); if (plotIndex !== undefined) plant(Number(plotIndex)); else notify('Seed selected.'); }
    if (action === 'book-tab') { currentHandbookTab = button.dataset.tab; handbookMenu(); }
    if (action === 'save-menu') saveMenu();
    if (action === 'export-save') saveMenu();
    if (action === 'save-now') { save(); notify('Đã lưu nông trại trên trình duyệt.'); }
    if (action === 'copy-save') copySaveCode();
    if (action === 'import-save') importCode($('saveCodeInput')?.value || '');
    if (action === 'toggle-auto') toggleAuto();
  }

  async function copySaveCode() {
    const input = $('saveCodeInput');
    if (!input) return;
    try { await navigator.clipboard.writeText(input.value); notify('Đã sao chép mã nông trại.'); }
    catch { input.select(); document.execCommand('copy'); notify('Đã sao chép mã nông trại.'); }
  }

  function confirmReset() {
    showModal('BẮT ĐẦU LẠI?', '<p>Xóa bản lưu trên trình duyệt và mở một nông trại mới? Thao tác này không thể hoàn tác.</p><div class="modal-actions"><button class="retro-btn" data-action="reset-save">XÓA BẢN LƯU</button><button class="retro-btn" data-action="modal-close">HỦY</button></div>');
  }

  function sendChat(event) {
    event.preventDefault();
    const input = $('chatInput');
    const message = input.value.trim();
    if (!message) return;
    addFeed('LÀNG', `Arthur: ${escapeHtml(message)}`);
    input.value = '';
    renderFeed(); save();
  }

  function addFeed(channel, text) {
    state.chat.push({ channel, text: String(text), day: state.day, time: gameMinute });
    state.chat = state.chat.slice(-80);
    renderFeed();
  }

  function renderFeed() {
    const root = $('feedMessages');
    if (!root) return;
    const filtered = state.chat.filter((entry) => currentFeed === 'LÀNG' ? entry.channel === 'LÀNG' : currentFeed === 'HỆ THỐNG' ? entry.channel === 'HỆ THỐNG' : entry.channel === 'THƯƠNG NHÂN');
    root.innerHTML = filtered.slice(-5).map((entry) => `<div class="feed-line ${entry.channel === 'HỆ THỐNG' ? 'system' : entry.channel === 'THƯƠNG NHÂN' ? 'market' : ''}"><b>[${entry.channel}]</b> ${entry.text}</div>`).join('');
    root.scrollTop = root.scrollHeight;
  }

  function showFloating(point, message) {
    const fx = document.createElement('span');
    fx.className = 'floating-text';
    fx.textContent = message;
    fx.style.left = `${point.x / worldWidth() * 100}%`;
    fx.style.top = `${point.y / data.meta.world.height * 100}%`;
    $('worldFx').appendChild(fx);
    setTimeout(() => fx.remove(), 1200);
  }

  function notify(message) {
    const toast = $('toast');
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
  }

  function getCrop(id) { return data.crops.find((crop) => crop.id === id); }
  function weatherFor(id) { return data.weather.find((weather) => weather.id === id) || data.weather[0]; }
  function format(value) { return Math.floor(value).toLocaleString('vi-VN'); }
  function getMarketPrice(id) { return state.prices[id] || getCrop(id)?.price || 10; }
  function getResourcePrice(id) {
    const crop = data.crops.find((item) => item.id === id);
    if (crop) return getMarketPrice(id);
    const fish = data.fish.find((item) => item.id === id);
    if (fish) return fish.price;
    const recipe = data.recipes.find((item) => item.output === id);
    if (recipe) return recipe.value;
    return ({ egg: 18, milk: 32, honey: 44, wool: 35 })[id] || 10;
  }
  function resourceCount(id) { return state.inventory.produce[id] ?? state.inventory.goods[id] ?? 0; }
  function takeResource(id, amount) {
    if (state.inventory.produce[id] !== undefined) state.inventory.produce[id] -= amount;
    else state.inventory.goods[id] = Math.max(0, (state.inventory.goods[id] || 0) - amount);
  }
  function resourceName(id) {
    const crop = data.crops.find((item) => item.id === id);
    if (crop) return crop.name;
    const fish = data.fish.find((item) => item.id === id);
    if (fish) return fish.name;
    const recipe = data.recipes.find((item) => item.output === id);
    if (recipe) return recipe.name;
    return ({ egg: 'Trứng', milk: 'Sữa', honey: 'Mật ong', wool: 'Len' })[id] || id;
  }
  function resourceIcon(id) {
    const crop = data.crops.find((item) => item.id === id);
    if (crop) return crop.stages[3];
    const fish = data.fish.find((item) => item.id === id);
    if (fish) return fish.icon;
    const recipe = data.recipes.find((item) => item.output === id);
    if (recipe) return recipe.icon;
    return ({ egg: '🥚', milk: '🥛', honey: '🍯', wool: '🧶' })[id] || '📦';
  }
  function getWorkshopName(id) { return data.workshops.find((item) => item.id === id)?.name || id; }
  function escapeHtml(value) { const d = document.createElement('div'); d.textContent = value; return d.innerHTML; }

  $('modalRoot').addEventListener('click', (event) => {
    const button = event.target.closest('[data-action="reset-save"]');
    if (!button) return;
    localStorage.removeItem(SAVE_KEY);
    location.reload();
  });


  boot();
})();
