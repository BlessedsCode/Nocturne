const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');
const {execFile} = require('node:child_process');
const {promisify} = require('node:util');
const execFileAsync = promisify(execFile);

function crxToZip(buffer) {
  if (buffer.slice(0, 4).toString() === 'Cr24') {
    const version = buffer.readUInt32LE(4);
    if (version === 3) {
      const headerLength = buffer.readUInt32LE(8);
      return buffer.slice(12 + headerLength);
    } else if (version === 2) {
      const keyLength = buffer.readUInt32LE(8);
      const sigLength = buffer.readUInt32LE(12);
      return buffer.slice(16 + keyLength + sigLength);
    }
  }
  const pk = buffer.indexOf(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  if (pk !== -1) return buffer.slice(pk);
  return buffer;
}

function normalizeKey(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9а-яё]/gi, '');
}

const POPULAR_EXTENSIONS = [
  {
    id: 'ublock-origin',
    name: 'uBlock Origin',
    summary: 'Быстрый и эффективный блокировщик рекламы и трекеров с низким потреблением памяти.',
    chromeId: 'cjpalhdlnbpafiamejdnhcphjbkeiagm',
    amoSlug: 'ublock-origin',
    downloadUrl: 'https://addons.mozilla.org/firefox/downloads/file/5034826/ublock_origin-1.75.0.xpi',
    icon: 'https://addons.mozilla.org/user-media/addon_icons/607/607454-64.png',
    sources: ['chrome', 'firefox'],
    rating: 4.8
  },
  {
    id: 'dark-reader',
    name: 'Dark Reader',
    summary: 'Тёмная тема для каждого сайта с плавной инверсией и регулировкой контрастности.',
    chromeId: 'eimadpbcbfnmbkopoojfekhnkhdbieeh',
    amoSlug: 'darkreader',
    icon: 'https://addons.mozilla.org/user-media/addon_icons/929/929532-64.png',
    sources: ['chrome', 'firefox'],
    rating: 4.7
  },
  {
    id: 'bitwarden',
    name: 'Bitwarden',
    summary: 'Защищённый менеджер паролей со сквозным шифрованием и автозаполнением.',
    chromeId: 'nngceckbapebfimnlniiiahkandclblb',
    amoSlug: 'bitwarden-password-manager',
    icon: 'https://addons.mozilla.org/user-media/addon_icons/837/837890-64.png',
    sources: ['chrome', 'firefox'],
    rating: 4.8
  },
  {
    id: 'sponsorblock',
    name: 'SponsorBlock',
    summary: 'Автоматический пропуск рекламных интеграций и заставок в видео на YouTube.',
    chromeId: 'mnjggcdmjocbbbhaepdhchncahnbgone',
    amoSlug: 'sponsorblock',
    icon: 'https://addons.mozilla.org/user-media/addon_icons/2281/2281781-64.png',
    sources: ['chrome', 'firefox'],
    rating: 4.9
  },
  {
    id: 'return-youtube-dislike',
    name: 'Return YouTube Dislike',
    summary: 'Возвращает отображение реального счётчика дизлайков на YouTube.',
    chromeId: 'gebbhagfogifgggkldgodflihgfeippi',
    amoSlug: 'return-youtube-dislikes',
    icon: 'https://addons.mozilla.org/user-media/addon_icons/2691/2691456-64.png',
    sources: ['chrome', 'firefox'],
    rating: 4.8
  },
  {
    id: 'adguard',
    name: 'AdGuard AdBlocker',
    summary: 'Блокировка баннеров, всплывающих окон и защита от слежки веб-сайтов.',
    chromeId: 'bgnkhhnnamicmpeenaelnjfhikgbkllg',
    amoSlug: 'adguard-adblocker',
    icon: 'https://addons.mozilla.org/user-media/addon_icons/493/493638-64.png',
    sources: ['chrome', 'firefox'],
    rating: 4.7
  },
  {
    id: 'twp-translate',
    name: 'TWP - Translate Web Pages',
    summary: 'Мгновенный перевод страниц в реальном времени с поддержкой переводчиков Google и Yandex.',
    chromeId: 'cpooptikmflhhgkgapfcbnbghlhjkjam',
    amoSlug: 'traduzir-paginas-web',
    icon: 'https://addons.mozilla.org/user-media/addon_icons/2422/2422071-64.png',
    sources: ['chrome', 'firefox'],
    rating: 4.9
  },
  {
    id: 'tampermonkey',
    name: 'Tampermonkey',
    summary: 'Менеджер пользовательских скриптов для модификации и улучшения страниц.',
    chromeId: 'dhdgffkkebhmkfjojejmpbldmpobfkfo',
    amoSlug: 'tampermonkey',
    icon: 'https://addons.mozilla.org/user-media/addon_icons/655/655858-64.png',
    sources: ['chrome', 'firefox'],
    rating: 4.7
  },
  {
    id: 'buster-captcha',
    name: 'Buster: Captcha Solver',
    summary: 'Автоматическое прохождение капчи через аудиораспознавание.',
    chromeId: 'mpbjkejclgikkgldflakfdikbggdidfc',
    amoSlug: 'buster-captcha-solver',
    icon: 'https://addons.mozilla.org/user-media/addon_icons/989/989502-64.png',
    sources: ['chrome', 'firefox'],
    rating: 4.6
  },
  {
    id: 'single-file',
    name: 'SingleFile',
    summary: 'Сохранение всей веб-страницы со стилями и картинками в один лёгкий HTML-файл.',
    chromeId: 'mpiodijhokgodhhsofbcddgglkggaldm',
    amoSlug: 'single-file',
    icon: 'https://addons.mozilla.org/user-media/addon_icons/892/892418-64.png',
    sources: ['chrome', 'firefox'],
    rating: 4.8
  }
];

class ExtensionsManager {
  constructor({directory, session, fetch}) {
    this.directory = directory;
    this.session = session;
    this.fetch = fetch || globalThis.fetch;
    this.configFile = path.join(this.directory, 'installed.json');
    this.installed = [];
  }

  async initialize() {
    await fs.mkdir(this.directory, {recursive: true});
    try {
      const content = await fs.readFile(this.configFile, 'utf8');
      this.installed = JSON.parse(content);
    } catch {
      this.installed = [];
    }
    // Load enabled extensions into session
    for (const ext of this.installed) {
      if (ext.enabled && ext.unpackedPath && fsSync.existsSync(ext.unpackedPath)) {
        try {
          await this._loadIntoSession(ext.unpackedPath);
        } catch (e) {
          console.error('Failed to load extension:', ext.name, e);
        }
      }
    }
  }

  async _loadIntoSession(unpackedPath) {
    if (this.session.extensions?.loadExtension) {
      return await this.session.extensions.loadExtension(unpackedPath, {allowFileAccess: false});
    }
    return await this.session.loadExtension(unpackedPath, {allowFileAccess: false});
  }

  async _removeFromSession(extensionId) {
    if (this.session.extensions?.removeExtension) {
      return this.session.extensions.removeExtension(extensionId);
    }
    return this.session.removeExtension(extensionId);
  }

  async saveConfig() {
    await fs.mkdir(this.directory, {recursive: true});
    await fs.writeFile(this.configFile, JSON.stringify(this.installed, null, 2), 'utf8');
  }

  listInstalled() {
    return this.installed.map(e => ({
      id: e.id,
      name: e.name,
      version: e.version,
      summary: e.summary,
      icon: e.icon,
      enabled: !!e.enabled,
      sources: e.sources || ['catalog'],
      installedDate: e.installedDate
    }));
  }

  async toggle(id, enabled) {
    if (typeof id === 'object' && id !== null) {
      enabled = id.enabled;
      id = id.id;
    }
    const ext = this.installed.find(e => e.id === id);
    if (!ext) throw new Error('Расширение не найдено.');
    ext.enabled = !!enabled;
    if (ext.enabled) {
      try {
        await this._loadIntoSession(ext.unpackedPath);
      } catch (e) {
        ext.enabled = false;
        throw new Error('Не удалось активировать расширение: ' + e.message);
      }
    } else {
      try {
        if (ext.runtimeId) await this._removeFromSession(ext.runtimeId);
      } catch {}
    }
    await this.saveConfig();
    return this.listInstalled();
  }

  async remove(id) {
    if (typeof id === 'object' && id !== null) {
      id = id.id;
    }
    const index = this.installed.findIndex(e => e.id === id);
    if (index === -1) throw new Error('Расширение не найдено.');
    const [ext] = this.installed.splice(index, 1);
    try {
      if (ext.runtimeId) await this._removeFromSession(ext.runtimeId);
    } catch {}
    if (ext.unpackedPath && fsSync.existsSync(ext.unpackedPath)) {
      try {
        await fs.rm(ext.unpackedPath, {recursive: true, force: true});
      } catch {}
    }
    await this.saveConfig();
    return this.listInstalled();
  }

  async search(query = '') {
    query = String(query || '').trim().toLowerCase();
    const installedIds = new Set(this.installed.map(e => e.id));
    const installedNames = new Set(this.installed.map(e => normalizeKey(e.name)));

    const merged = new Map();

    // 1. Add popular curated items
    for (const item of POPULAR_EXTENSIONS) {
      const key = normalizeKey(item.name);
      merged.set(key, {
        ...item,
        installed: installedIds.has(item.id) || installedNames.has(key)
      });
    }

    // 2. If query provided, query Firefox AMO search API
    if (query) {
      try {
        const amoUrl = `https://addons.mozilla.org/api/v5/addons/search/?q=${encodeURIComponent(query)}&type=extension&page_size=15`;
        const res = await this.fetch(amoUrl, {headers: {'User-Agent': 'NocturneBrowser/0.10.2'}});
        if (res.ok) {
          const data = await res.json();
          for (const r of (data.results || [])) {
            const rawName = typeof r.name === 'object' ? (r.name.ru || r.name['en-US'] || Object.values(r.name)[0]) : r.name;
            const name = String(rawName || r.slug || '').trim();
            const key = normalizeKey(name);
            const summaryObj = r.summary || {};
            const summary = typeof summaryObj === 'object' ? (summaryObj.ru || summaryObj['en-US'] || Object.values(summaryObj)[0] || '') : String(summaryObj);
            const fileUrl = r.current_version?.file?.url;
            const icon = r.icon_url || '';
            const rating = r.ratings?.average ? Number(r.ratings.average.toFixed(1)) : null;

            if (merged.has(key)) {
              const existing = merged.get(key);
              if (!existing.sources.includes('firefox')) existing.sources.push('firefox');
              if (!existing.downloadUrl && fileUrl) existing.downloadUrl = fileUrl;
              if (!existing.icon && icon) existing.icon = icon;
            } else {
              merged.set(key, {
                id: r.slug || ('amo-' + r.id),
                name,
                summary,
                icon,
                amoSlug: r.slug,
                downloadUrl: fileUrl,
                sources: ['firefox'],
                rating,
                installed: installedIds.has(r.slug) || installedNames.has(key)
              });
            }
          }
        }
      } catch (e) {
        console.error('AMO search error:', e);
      }
    }

    // Filter by query if query exists
    let results = Array.from(merged.values());
    if (query) {
      results = results.filter(item => {
        return item.name.toLowerCase().includes(query) || (item.summary && item.summary.toLowerCase().includes(query));
      });
    }

    return results;
  }

  async install(item) {
    if (!item || !item.name) throw new Error('Некорректные данные расширения.');
    const safeId = String(item.id || item.chromeId || item.amoSlug || normalizeKey(item.name)).slice(0, 48);
    const installDir = path.join(this.directory, safeId);
    await fs.mkdir(installDir, {recursive: true});

    let downloadUrl = item.downloadUrl;
    if (!downloadUrl && item.chromeId) {
      downloadUrl = `https://clients2.google.com/service/update2/crx?response=redirect&prodversion=130.0&acceptformat=crx2,crx3&x=id%3D${encodeURIComponent(item.chromeId)}%26uc`;
    }
    if (!downloadUrl && item.amoSlug) {
      try {
        const amoInfoUrl = `https://addons.mozilla.org/api/v5/addons/addon/${encodeURIComponent(item.amoSlug)}/`;
        const res = await this.fetch(amoInfoUrl);
        if (res.ok) {
          const data = await res.json();
          downloadUrl = data.current_version?.file?.url;
        }
      } catch {}
    }

    if (!downloadUrl) throw new Error('Не удалось найти ссылку для загрузки расширения.');

    // Download package
    const res = await this.fetch(downloadUrl, {
      headers: {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'}
    });
    if (!res.ok) throw new Error(`Ошибка скачивания: HTTP ${res.status}`);

    const rawBuffer = Buffer.from(await res.arrayBuffer());
    const zipBuffer = crxToZip(rawBuffer);

    const tempZip = path.join(installDir, 'package.zip');
    await fs.writeFile(tempZip, zipBuffer);

    // Unpack using tar.exe
    const unpackedDir = path.join(installDir, 'unpacked');
    await fs.mkdir(unpackedDir, {recursive: true});
    try {
      await execFileAsync('tar.exe', ['-xf', tempZip, '-C', unpackedDir]);
    } finally {
      await fs.rm(tempZip, {force: true});
    }

    // Verify manifest
    const manifestPath = path.join(unpackedDir, 'manifest.json');
    if (!fsSync.existsSync(manifestPath)) {
      throw new Error('Архив расширения повреждён или не содержит manifest.json');
    }

    const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));

    // Load into Electron session
    const loaded = await this._loadIntoSession(unpackedDir);

    const record = {
      id: safeId,
      runtimeId: loaded?.id || safeId,
      name: manifest.name || item.name,
      version: manifest.version || '1.0',
      summary: manifest.description || item.summary || '',
      icon: item.icon || '',
      unpackedPath: unpackedDir,
      enabled: true,
      sources: item.sources || ['catalog'],
      installedDate: new Date().toISOString()
    };

    // Remove if previously installed with same id
    this.installed = this.installed.filter(e => e.id !== safeId);
    this.installed.unshift(record);
    await this.saveConfig();

    return {success: true, installed: this.listInstalled()};
  }
}

module.exports = {ExtensionsManager, crxToZip, POPULAR_EXTENSIONS, normalizeKey};
