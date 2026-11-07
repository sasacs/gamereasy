import {
  signalGameReady, signalGameplayStart, signalGameplayStop, showRewardedVideo
} from "../systems/YandexSDK.js";

const SAVE_KEY = "mini-factory-tycoon-save-v01";
const WORLD = { width: 1200, height: 800 };
const BORDER = 22;            // толщина стен цеха
const PLAYER_SPEED = 185;
const INTERACT_DISTANCE = 40; // расстояние от края станции, на котором работает «E»
const SELL_PRICE = 35;
const MAX_RAW = 3;

export class GameScene extends Phaser.Scene {
  constructor() {
    super("GameScene");
    this.money = 0;
    this.raw = 0;
    this.cargo = 0;
    this.capacity = 3;
    this.machineLevel = 1;
    this.machineBusy = false;
    this.machineReady = false;
    this.produced = 0;
    this.delivered = 0;
    this.toastTimer = null;
    this.lastHint = "";
    this.hiddenPause = false;   // вкладка скрыта
    this.adPause = false;       // идёт реклама
    this.touch = { up: false, down: false, left: false, right: false };
  }

  get isPaused() {
    return this.hiddenPause || this.adPause;
  }

  create() {
    this.loadSave();
    this.drawWorld();
    this.createPlayer();
    this.createStations();
    this.createCollisions();
    this.createKeyboard();
    this.createWorldLabels();
    this.createHudBindings();
    this.updateHud();
    this.updateObjective();
    this.updateHint();

    const cam = this.cameras.main;
    cam.setBounds(0, 0, WORLD.width, WORLD.height);
    cam.startFollow(this.player, true, 0.08, 0.08);
    cam.setZoom(this.getZoom());

    const onResize = () => cam.setZoom(this.getZoom());
    this.scale.on("resize", onResize);
    this.events.once("shutdown", () => this.scale.off("resize", onResize));

    this.bindTouchControls();
    this.bindYandexLifecycle();
    this.events.once("shutdown", () => this.saveGame(true));

    signalGameReady();
    signalGameplayStart();
    this.showToast("Добро пожаловать! Возьми сырьё на складе.");
  }

  getZoom() {
    const w = this.scale.width || 960;
    const h = this.scale.height || 640;
    return Math.max(0.5, Math.min(1, w / 960, h / 640));
  }

  /* ---------- Мир ---------- */

  drawWorld() {
    const g = this.add.graphics();
    g.fillStyle(0x29433b, 1);
    g.fillRect(0, 0, WORLD.width, WORLD.height);

    for (let y = 0; y < WORLD.height; y += 64) {
      for (let x = 0; x < WORLD.width; x += 64) {
        g.fillStyle(((x / 64 + y / 64) % 2) ? 0x304c42 : 0x2d483f, 1);
        g.fillRect(x, y, 64, 64);
        g.lineStyle(1, 0x3b5a4e, 0.35);
        g.strokeRect(x, y, 64, 64);
      }
    }

    g.fillStyle(0x172a2b, 1);
    g.fillRect(0, 0, WORLD.width, BORDER);
    g.fillRect(0, WORLD.height - BORDER, WORLD.width, BORDER);
    g.fillRect(0, 0, BORDER, WORLD.height);
    g.fillRect(WORLD.width - BORDER, 0, BORDER, WORLD.height);
    g.lineStyle(3, 0x7e9a83, 0.6);
    g.strokeRect(BORDER, BORDER, WORLD.width - BORDER * 2, WORLD.height - BORDER * 2);

    g.fillStyle(0x263d38, 1);
    g.fillRoundedRect(70, 355, 1060, 90, 12);
    g.lineStyle(2, 0x8ca18a, 0.22);
    g.strokeRoundedRect(70, 355, 1060, 90, 12);

    for (let i = 0; i < 5; i++) this.drawCrate(g, 85 + i * 48, 95, 0x9a7046);
    this.drawCrate(g, 1040, 130, 0x9a7046);
    this.drawCrate(g, 1090, 130, 0x9a7046);
    this.drawCrate(g, 1040, 185, 0x9a7046);
  }

  drawCrate(g, x, y, color) {
    g.fillStyle(0x17231e, 0.35);
    g.fillRoundedRect(x + 4, y + 6, 34, 28, 4);
    g.fillStyle(color, 1);
    g.fillRoundedRect(x, y, 34, 28, 4);
    g.lineStyle(2, 0x5d432d, 1);
    g.strokeRoundedRect(x, y, 34, 28, 4);
    g.lineBetween(x + 4, y + 4, x + 30, y + 24);
    g.lineBetween(x + 30, y + 4, x + 4, y + 24);
  }

  createPlayer() {
    // Физическое тело — на внешнем контейнере (без отражения),
    // а картинку для разворота влево/вправо отражаем во внутреннем контейнере.
    this.player = this.add.container(210, 505);
    this.player.setSize(26, 26);

    const shadow = this.add.ellipse(0, 15, 34, 13, 0x101a16, 0.35);
    const body = this.add.circle(0, 0, 13, 0x4b9de8).setStrokeStyle(3, 0xd9efff);
    const cap = this.add.rectangle(0, -8, 18, 7, 0xf4c95d, 0.95).setOrigin(0.5);
    const face = this.add.circle(4, -2, 3, 0x152332);
    this.playerVisual = this.add.container(0, 0, [shadow, body, cap, face]);
    this.player.add(this.playerVisual);

    this.physics.add.existing(this.player);
    this.player.body.setCircle(13);
    this.player.body.setMaxVelocity(PLAYER_SPEED, PLAYER_SPEED);
    this.physics.world.setBounds(
      BORDER, BORDER, WORLD.width - BORDER * 2, WORLD.height - BORDER * 2
    );
    this.player.body.setCollideWorldBounds(true);
    this.player.setDepth(20);
  }

  createStations() {
    this.stations = [
      this.makeStation(190, 235, 150, 112, 0x8d6843, "СКЛАД СЫРЬЯ", "🪵", "storage"),
      this.makeStation(510, 235, 178, 126, 0x477c78, "СТАНОК №1", "⚙", "machine"),
      this.makeStation(930, 500, 174, 126, 0x567c55, "ОТГРУЗКА", "📦", "shipping"),
      this.makeStation(820, 235, 140, 110, 0x7562a1, "МАСТЕРСКАЯ", "⬆", "upgrade")
    ];
    const byType = (t) => this.stations.find((s) => s.getData("type") === t);
    this.storage = byType("storage");
    this.machine = byType("machine");
    this.shipping = byType("shipping");
    this.upgradeStation = byType("upgrade");

    this.machineProgress = this.add.graphics().setDepth(8);
    this.machineStatus = this.add.text(510, 330, "ГОТОВ", {
      fontFamily: "Arial", fontSize: "12px", color: "#d9fff0", fontStyle: "bold",
      backgroundColor: "#1b3a35", padding: { x: 8, y: 4 }
    }).setOrigin(0.5).setDepth(9);
  }

  makeStation(x, y, w, h, color, title, symbol, type) {
    const group = this.add.container(x, y).setDepth(5);
    const shadow = this.add.rectangle(5, 8, w, h, 0x0b1713, 0.28).setOrigin(0.5);
    const base = this.add.rectangle(0, 0, w, h, color).setStrokeStyle(4, 0x1c302c);
    const top = this.add.rectangle(0, -h / 2 + 13, w - 12, 22, 0xffffff, 0.12);
    const icon = this.add.text(0, -13, symbol, { fontFamily: "Arial", fontSize: "32px", color: "#ffffff" }).setOrigin(0.5);
    const label = this.add.text(0, h / 2 - 20, title, {
      fontFamily: "Arial", fontSize: "12px", color: "#ffffff", fontStyle: "bold",
      stroke: "#15251f", strokeThickness: 3
    }).setOrigin(0.5);
    group.add([shadow, base, top, icon, label]);
    group.setSize(w, h);
    group.setData("type", type);
    group.setData("w", w);
    group.setData("h", h);
    return group;
  }

  createCollisions() {
    // Станции — твёрдые объекты: их нужно обходить.
    const obstacles = this.physics.add.staticGroup();
    for (const s of this.stations) {
      const w = s.getData("w") - 8;
      const h = s.getData("h") - 8;
      const wall = this.add.rectangle(s.x, s.y, w, h, 0x000000, 0);
      this.physics.add.existing(wall, true);
      obstacles.add(wall);
    }
    this.physics.add.collider(this.player, obstacles);
  }

  createKeyboard() {
    const K = Phaser.Input.Keyboard.KeyCodes;
    this.keys = this.input.keyboard.addKeys({
      up: K.W, down: K.S, left: K.A, right: K.D,
      up2: K.UP, down2: K.DOWN, left2: K.LEFT, right2: K.RIGHT
    });
    // event.repeat — чтобы удержание клавиши не спамило действием
    const onAction = (event) => { if (!event.repeat) this.interact(); };
    this.input.keyboard.on("keydown-E", onAction);
    this.input.keyboard.on("keydown-SPACE", onAction);
    this.input.keyboard.on("keydown-ESC", (event) => { if (!event.repeat) this.saveGame(); });
  }

  createWorldLabels() {
    const style = { fontFamily: "Arial", fontSize: "14px", color: "#d5e6dc", fontStyle: "bold", stroke: "#172923", strokeThickness: 4 };
    this.add.text(190, 145, "ЗАПАСЫ", style).setOrigin(0.5).setDepth(10);
    this.add.text(510, 145, "ПРОИЗВОДСТВО", style).setOrigin(0.5).setDepth(10);
    this.add.text(930, 410, "ГОТОВАЯ ПРОДУКЦИЯ", style).setOrigin(0.5).setDepth(10);
    this.add.text(820, 145, "УЛУЧШЕНИЯ", style).setOrigin(0.5).setDepth(10);
    this.add.text(600, 700, "MINI FACTORY · ЦЕХ № 01", {
      fontFamily: "Arial", fontSize: "18px", color: "#6e8d7d", fontStyle: "bold", letterSpacing: 3
    }).setOrigin(0.5).setDepth(1);
  }

  /* ---------- HTML-интерфейс ---------- */

  createHudBindings() {
    this.moneyEl = document.getElementById("money");
    this.rawEl = document.getElementById("raw");
    this.cargoEl = document.getElementById("cargo");
    this.hintEl = document.getElementById("hint");
    this.toastEl = document.getElementById("toast");
    this.objectiveEl = document.getElementById("objective");

    // Обработчики вешаем через AbortController, чтобы не копились при перезапуске сцены.
    this.domAbort = new AbortController();
    const opts = { signal: this.domAbort.signal };
    this.events.once("shutdown", () => this.domAbort.abort());

    // blur() — чтобы пробел после клика по кнопке не «нажимал» её повторно
    const onClick = (id, handler) => {
      document.getElementById(id)?.addEventListener("click", (e) => {
        e.currentTarget.blur();
        handler();
      }, opts);
    };
    onClick("upgrade-btn", () => this.buyUpgrade());
    onClick("bonus-btn", () => this.requestBonus());
    onClick("save-btn", () => this.saveGame());

    document.getElementById("touch-action")?.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      this.interact();
    }, opts);
  }

  bindTouchControls() {
    const opts = { signal: this.domAbort.signal };
    document.querySelectorAll("[data-dir]").forEach((button) => {
      const dir = button.dataset.dir;
      const set = (value) => { this.touch[dir] = value; };
      button.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        button.setPointerCapture?.(e.pointerId);
        set(true);
      }, opts);
      ["pointerup", "pointercancel", "lostpointercapture"].forEach((name) =>
        button.addEventListener(name, () => set(false), opts)
      );
    });
  }

  bindYandexLifecycle() {
    const onVisibility = () => {
      if (document.hidden) {
        this.hiddenPause = true;
        signalGameplayStop();
        this.saveGame(true);
      } else {
        this.hiddenPause = false;
        if (!this.adPause) signalGameplayStart();
      }
    };
    document.addEventListener("visibilitychange", onVisibility, { signal: this.domAbort.signal });
  }

  /* ---------- Игровой цикл ---------- */

  update() {
    if (!this.player?.body) return;

    if (this.isPaused) {
      this.player.body.setVelocity(0, 0);
      return;
    }

    const left = this.keys.left.isDown || this.keys.left2.isDown || this.touch.left;
    const right = this.keys.right.isDown || this.keys.right2.isDown || this.touch.right;
    const up = this.keys.up.isDown || this.keys.up2.isDown || this.touch.up;
    const down = this.keys.down.isDown || this.keys.down2.isDown || this.touch.down;

    const dir = new Phaser.Math.Vector2((right ? 1 : 0) - (left ? 1 : 0), (down ? 1 : 0) - (up ? 1 : 0));
    if (dir.lengthSq() > 0) dir.normalize().scale(PLAYER_SPEED);
    this.player.body.setVelocity(dir.x, dir.y);

    if (dir.x < 0) this.playerVisual.scaleX = -1;
    if (dir.x > 0) this.playerVisual.scaleX = 1;

    this.updateHint();
    this.drawMachineProgress();
  }

  distanceToStation(station) {
    const hw = station.getData("w") / 2;
    const hh = station.getData("h") / 2;
    const dx = Math.max(Math.abs(this.player.x - station.x) - hw, 0);
    const dy = Math.max(Math.abs(this.player.y - station.y) - hh, 0);
    return Math.hypot(dx, dy);
  }

  getNearbyStation() {
    let best = null;
    let bestDistance = Infinity;
    for (const station of this.stations) {
      const d = this.distanceToStation(station);
      if (d <= INTERACT_DISTANCE && d < bestDistance) {
        best = station;
        bestDistance = d;
      }
    }
    return best;
  }

  updateHint() {
    const station = this.getNearbyStation();
    let message = "WASD / стрелки — движение · E — действие";
    if (station) {
      const type = station.getData("type");
      if (type === "storage") message = this.raw < MAX_RAW ? "E — взять сырьё со склада" : "Сырья достаточно · отнеси его к станку";
      if (type === "machine") {
        if (this.machineBusy) message = "Станок работает · подожди немного";
        else if (this.machineReady) message = this.cargo < this.capacity ? "E — забрать готовую коробку" : "Сначала освободи руки: доставь груз";
        else message = this.raw > 0 ? "E — запустить производство" : "Нужно сырьё со склада";
      }
      if (type === "shipping") message = this.cargo > 0 ? "E — отгрузить коробки и получить оплату" : "Здесь принимают готовые коробки";
      if (type === "upgrade") message = `Мастерская · E — улучшить станок за ₽${this.upgradeCost()}`;
    }
    if (this.hintEl && message !== this.lastHint) {
      this.hintEl.textContent = message;
      this.lastHint = message;
    }
  }

  /* ---------- Игровая логика ---------- */

  interact() {
    if (this.isPaused) return;
    const station = this.getNearbyStation();
    if (!station) {
      this.showToast("Подойди ближе к объекту.");
      return;
    }
    const type = station.getData("type");
    if (type === "storage") this.takeRaw();
    if (type === "machine") this.useMachine();
    if (type === "shipping") this.deliverCargo();
    if (type === "upgrade") this.buyUpgrade();
    this.updateHud();
    this.updateObjective();
    this.updateHint();
  }

  takeRaw() {
    const amount = MAX_RAW - this.raw;
    if (amount <= 0) return this.showToast("Ты уже несёшь максимум сырья.");
    this.raw += amount;
    this.showToast(`Взято сырьё: +${amount}. Отнеси его к станку.`);
  }

  machineDuration() {
    return Math.max(1000, 3200 - (this.machineLevel - 1) * 350);
  }

  useMachine() {
    if (this.machineBusy) return this.showToast("Станок ещё работает.");

    if (this.machineReady) {
      if (this.cargo >= this.capacity) return this.showToast("Нет места для готовой коробки.");
      this.machineReady = false;
      this.cargo += 1;
      this.machineStatus.setText("ГОТОВ");
      return this.showToast("Коробка добавлена в груз. Отнеси её на отгрузку!");
    }

    if (this.raw <= 0) return this.showToast("Сначала возьми сырьё на складе.");

    this.raw -= 1;
    this.machineBusy = true;
    this.machineStatus.setText("РАБОТАЕТ…");
    this.showToast("Производство запущено!");

    this.time.delayedCall(this.machineDuration(), () => {
      this.machineBusy = false;
      this.machineReady = true;
      this.produced += 1;
      this.machineStatus.setText("ГОТОВО!");
      this.machineProgress.clear();
      this.showToast("Готово! Подойди к станку и забери коробку.");
      this.updateHud();
      this.updateObjective();
      this.updateHint();
    });
  }

  deliverCargo() {
    if (this.cargo <= 0) return this.showToast("У тебя пока нет готовых коробок.");
    const count = this.cargo;
    const earned = count * SELL_PRICE;
    this.cargo = 0;
    this.money += earned;
    this.delivered += count;
    this.showToast(`Отгружено ${count} шт. Получено ₽${earned}!`);
  }

  upgradeCost() {
    return 100 * this.machineLevel;
  }

  buyUpgrade() {
    if (this.isPaused) return;
    const cost = this.upgradeCost();
    if (this.money < cost) return this.showToast(`Нужно ещё ₽${cost - this.money}. Продай продукцию!`);
    this.money -= cost;
    this.machineLevel += 1;
    this.showToast(`Станок улучшен до уровня ${this.machineLevel}! Производство быстрее.`);
    this.updateHud();
    this.updateObjective();
  }

  requestBonus() {
    if (this.adPause) return;
    if (!window.ysdk?.adv?.showRewardedVideo) {
      this.showToast("Бонусная реклама включится после публикации на Яндекс Играх.");
      return;
    }

    let finished = false;
    const finish = () => {          // вызывается один раз, даже если сработают и onClose, и onError
      if (finished) return;
      finished = true;
      this.adPause = false;
      if (!this.hiddenPause) signalGameplayStart();
      this.updateHud();
    };

    this.adPause = true;
    signalGameplayStop();

    showRewardedVideo({
      onReward: () => {
        this.money += 50;
        this.updateHud();
        this.updateObjective();
        this.showToast("Бонус за просмотр: +₽50!");
      },
      onClose: finish,
      onError: () => {
        finish();
        this.showToast("Не удалось загрузить рекламу. Попробуй позже.");
      }
    });
  }

  drawMachineProgress() {
    if (!this.machineProgress) return;
    this.machineProgress.clear();
    if (this.machineBusy) {
      const pulse = (Math.sin(this.time.now / 130) + 1) / 2;
      this.machineProgress.fillStyle(0x8ce6ba, 0.9);
      this.machineProgress.fillRoundedRect(460, 322, Math.max(4, 100 * pulse), 5, 3);
    }
  }

  updateHud() {
    if (this.moneyEl) this.moneyEl.textContent = `₽ ${this.money}`;
    if (this.rawEl) this.rawEl.textContent = `${this.raw} / ${MAX_RAW}`;
    if (this.cargoEl) this.cargoEl.textContent = `${this.cargo} / ${this.capacity}`;
    const upgradeBtn = document.getElementById("upgrade-btn");
    if (upgradeBtn) upgradeBtn.textContent = `Улучшить станок · ₽${this.upgradeCost()}`;
  }

  updateObjective() {
    let text = "Задача: произведи и доставь первую коробку";
    if (this.money >= this.upgradeCost()) text = "Цель: улучши станок в мастерской";
    else if (this.delivered > 0) text = `Отлично! Доставлено коробок: ${this.delivered}. Накопи ₽${this.upgradeCost()} на улучшение.`;
    else if (this.cargo > 0) text = "Коробка у тебя — отнеси её на отгрузку";
    else if (this.machineReady) text = "Коробка готова — забери её у станка";
    else if (this.machineBusy) text = "Производство запущено — дождись готовой коробки";
    else if (this.raw > 0) text = "Отнеси сырьё к станку и запусти производство";
    if (this.objectiveEl) this.objectiveEl.textContent = text;
  }

  showToast(message) {
    if (!this.toastEl) return;
    this.toastEl.textContent = message;
    this.toastEl.classList.add("show");
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toastEl?.classList.remove("show"), 2200);
  }

  /* ---------- Сохранение ---------- */

  saveGame(silent = false) {
    const data = {
      money: this.money, raw: this.raw, cargo: this.cargo, capacity: this.capacity,
      machineLevel: this.machineLevel, produced: this.produced, delivered: this.delivered,
      savedAt: Date.now()
    };
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
      if (!silent) this.showToast("Прогресс сохранён на этом устройстве.");
    } catch (error) {
      console.warn("Save failed:", error);
      if (!silent) this.showToast("Не удалось сохранить прогресс.");
    }
  }

  loadSave() {
    try {
      const data = JSON.parse(localStorage.getItem(SAVE_KEY) || "null");
      if (!data) return;
      this.money = Math.max(0, Number(data.money) || 0);
      this.raw = Phaser.Math.Clamp(Number(data.raw) || 0, 0, MAX_RAW);
      this.cargo = Phaser.Math.Clamp(Number(data.cargo) || 0, 0, 3);
      this.capacity = 3;
      this.machineLevel = Math.max(1, Number(data.machineLevel) || 1);
      this.produced = Number(data.produced) || 0;
      this.delivered = Number(data.delivered) || 0;
    } catch (error) {
      console.warn("Could not load save:", error);
    }
  }
}
