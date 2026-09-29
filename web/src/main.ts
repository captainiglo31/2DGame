import '@fontsource/pixelify-sans/400.css';
import '@fontsource/pixelify-sans/600.css';
import '@fontsource/silkscreen/400.css';
import './ui/styles.css';
import wasmUrl from './sim/sim.wasm?url';
import { audio } from './audio/audio';
import { WORLD } from './data/balance';
import { Game } from './game/Game';
import { setLang, t } from './i18n';
import { validate, type SaveFile } from './save/save';
import { loadSettings } from './settings';
import { Sim } from './sim/Sim';
import { h } from './ui/dom';
import { Hud } from './ui/hud';
import { Menus } from './ui/menus';

async function boot() {
  const settings = loadSettings();
  setLang(settings.lang);
  const loading = document.getElementById('loading');
  if (loading) loading.textContent = t('ui.loading');

  const canvases = {
    bg: document.getElementById('bg') as HTMLCanvasElement,
    world: document.getElementById('world') as HTMLCanvasElement,
    fx: document.getElementById('game') as HTMLCanvasElement,
  };
  const uiRoot = document.getElementById('ui')!;
  const sim = await Sim.load(
    // The single-file build inlines the wasm as a data: URL; decode it directly
    // because some sandboxed hosts block fetch() of data: URLs.
    wasmUrl.startsWith('data:')
      ? Uint8Array.from(atob(wasmUrl.slice(wasmUrl.indexOf(',') + 1)), (c) => c.charCodeAt(0))
      : fetch(wasmUrl).then((r) => r.arrayBuffer()),
    WORLD.width,
    WORLD.height,
    Date.now(),
  );

  let hud: Hud | null = null;
  let menus: Menus;
  const toast = (msg: string, kind?: 'info' | 'good' | 'warn') => hud?.toast(msg, kind);

  const game = new Game(canvases, sim, settings, {
    toast,
    contractDone: (id) => toast(t('contract.done', { name: t(`contract.${id}.title`) }), 'good'),
    researchDone: (id) => toast(t('research.unlocked', { name: t(`research.${id}.name`) }), 'good'),
    alphaComplete: () => menus.showEnd(),
    pause: () => menus.escape(),
    openResearch: () => menus.showResearch(),
    toggleContracts: () => hud?.toggleContract(),
  });

  const hudLayer = h('div');
  uiRoot.append(hudLayer);

  const rebuildHud = () => {
    hudLayer.replaceChildren();
    hud = new Hud(game, { openResearch: () => menus.showResearch(), openMenu: () => menus.showPause() });
    hudLayer.append(hud.root);
    hudLayer.style.display = menus?.inGame ? '' : 'none';
  };

  const applySettings = () => {
    document.documentElement.style.setProperty('--ui-scale', String(settings.uiScale));
    document.documentElement.classList.toggle('reduced-motion', settings.reducedMotion);
    audio.setVolumes(settings.master, settings.sfx, settings.music);
  };

  menus = new Menus(
    {
      game,
      settings,
      newGame: (creative) => {
        game.newGame((Math.random() * 2 ** 31) | 0, creative);
      },
      loadFile: (f: SaveFile) => {
        if (!validate(f)) return false;
        try {
          game.load(f);
          return true;
        } catch (e) {
          console.error(e);
          return false;
        }
      },
      applySettings,
      rebuildHud,
      toast,
    },
    uiRoot,
  );

  rebuildHud();
  applySettings();

  // Title background: a generated coast.
  game.attract = true;
  game.newGame(12345);
  game.camera.zoom = 2.5;
  game.snapCamera();
  menus.showTitle();

  // HUD visibility follows the menu state
  setInterval(() => {
    hudLayer.style.display = menus.inGame ? '' : 'none';
    if (menus.inGame) hud?.update();
  }, 100);

  window.addEventListener('beforeunload', () => {
    if (menus.inGame && settings.autosaveMin > 0) game.save('auto');
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && menus.inGame && !menus.open) menus.showPause();
  });

  game.start();
  document.getElementById('loading')?.remove();

  // Automation hook for the e2e smoke test & debugging in the console.
  (window as unknown as { abyssal: unknown }).abyssal = { game, menus, sim };
}

boot().catch((e) => {
  console.error(e);
  const el = document.getElementById('loading');
  if (el) el.textContent = `${t('ui.loadError')}: ${e?.message ?? e}`;
});
