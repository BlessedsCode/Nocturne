// Home-screen layout lives in this profile. Coordinates use the content area,
// so layouts remain usable when the window is resized or moved to another screen.
(() => {
  const home = document.getElementById('home-page');
  const key = 'home-layout-v1';
  const copy = value => JSON.parse(JSON.stringify(value));
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const widgets = [];
  let saved = readLayout(), draft = copy(saved), editing = false, drag = null;

  function readLayout() {
    let raw;
    try { raw = JSON.parse(localStorage.getItem(key)); } catch {}
    const result = {};
    for (const id of ['search', 'links']) {
      const value = raw?.[id];
      if (value && ['x', 'y', 'width'].every(name => Number.isFinite(value[name]))) {
        result[id] = {x: clamp(value.x, 0, 1), y: clamp(value.y, 0, 1), width: clamp(value.width, 220, 900)};
      }
    }
    return result;
  }

  const toolbar = document.createElement('div');
  toolbar.id = 'layout-toolbar';
  toolbar.hidden = true;
  toolbar.setAttribute('role', 'region');
  toolbar.setAttribute('aria-label', 'Редактирование главной страницы');
  const heading = document.createElement('span');
  heading.textContent = 'Раскладка';
  const hint = document.createElement('span');
  hint.className = 'layout-hint';
  hint.textContent = 'Тяни за заголовок · угол меняет ширину';
  const snapLabel = document.createElement('label');
  const snap = document.createElement('input');
  snap.type = 'checkbox'; snap.checked = true; snap.id = 'layout-snap';
  snapLabel.append(snap, document.createTextNode('Привязка'));
  const reset = makeButton('Сбросить', 'layout-reset', () => { draft = {}; apply(); });
  const cancel = makeButton('Отмена', 'layout-cancel', () => finish(false));
  const done = makeButton('Готово', 'layout-done', () => finish(true));
  done.className = 'primary';
  toolbar.append(heading, hint, snapLabel, reset, cancel, done);
  const entry = makeButton('Изменить раскладку', 'edit-home-layout', begin);
  entry.prepend(createIcon('edit'));
  home.append(toolbar, entry);
  const vertical = document.createElement('div'), horizontal = document.createElement('div');
  vertical.className = 'layout-guide vertical'; horizontal.className = 'layout-guide horizontal';
  vertical.hidden = horizontal.hidden = true;
  home.append(vertical, horizontal);

  for (const [id, selector, label, minWidth] of [
    ['search', '#search-form', 'Поиск', 280],
    ['links', '#quick-links', 'Быстрые ссылки', 220]
  ]) {
    const content = document.querySelector(selector);
    const wrap = document.createElement('div');
    wrap.className = 'home-widget'; wrap.dataset.widget = id;
    content.before(wrap); wrap.append(content);
    const handle = makeButton(label, 'move-home-' + id, () => {});
    handle.className = 'layout-handle';
    handle.title = 'Переместить. Стрелки — 1 пиксель, Shift + стрелки — 10.';
    handle.setAttribute('aria-label', 'Переместить: ' + label);
    handle.prepend(createIcon('move'));
    const resize = makeButton('', 'resize-home-' + id, () => {});
    resize.className = 'layout-resize';
    resize.title = 'Изменить ширину. Стрелки влево и вправо — 10 пикселей.';
    resize.setAttribute('aria-label', 'Изменить ширину: ' + label);
    resize.append(createIcon('resize'));
    wrap.append(handle, resize);
    const widget = {id, content, wrap, handle, resize, minWidth};
    widgets.push(widget);
    handle.addEventListener('pointerdown', event => startDrag(event, widget, false));
    resize.addEventListener('pointerdown', event => startDrag(event, widget, true));
    handle.addEventListener('keydown', event => keyboardMove(event, widget, false));
    resize.addEventListener('keydown', event => keyboardMove(event, widget, true));
    // Editing never submits a search or follows a link underneath a drag.
    wrap.addEventListener('click', event => { if (editing) { event.preventDefault(); event.stopPropagation(); } }, true);
    new ResizeObserver(() => apply()).observe(content);
  }
  home.classList.add('movable-home');
  new ResizeObserver(() => { stopDrag(); apply(); }).observe(home);
  new MutationObserver(() => apply()).observe(document.getElementById('quick-links'), {attributes:true, attributeFilter:['hidden']});

  function makeButton(label, id, click) {
    const el = document.createElement('button');
    el.type = 'button'; el.textContent = label; el.id = id; el.addEventListener('click', click);
    return el;
  }

  function begin() {
    if (editing || document.body.classList.contains('error') || document.body.classList.contains('security-warning-open')) return;
    draft = copy(saved); editing = true;
    document.activeElement?.blur();
    home.classList.add('editing-layout'); toolbar.hidden = false; entry.hidden = true;
    for (const widget of widgets) {
      // Keep the real inputs out of the keyboard sequence while moving widgets.
      widget.inertBefore = widget.content.inert;
      widget.content.inert = true;
    }
    apply(); done.focus();
  }

  function finish(commit) {
    if (!editing) return;
    stopDrag();
    if (commit) {
      try { localStorage.setItem(key, JSON.stringify(draft)); saved = copy(draft); }
      catch { toast('Не удалось сохранить раскладку. Попробуй ещё раз.'); return; }
    }
    draft = copy(saved); editing = false;
    home.classList.remove('editing-layout'); toolbar.hidden = true; entry.hidden = false;
    for (const widget of widgets) widget.content.inert = widget.inertBefore;
    apply(); entry.focus();
    if (commit) toast('Раскладка сохранена');
  }

  function defaultPosition(widget) {
    const h = home.clientHeight, w = home.clientWidth;
    const searchHeight = widgets[0].wrap.offsetHeight, linkHeight = widgets[1].wrap.offsetHeight;
    const bottom = h * (w < 1024 ? .08 : .09);
    return {x: w / 2, y: widget.id === 'search' ? h - bottom - linkHeight - 17 - searchHeight / 2 : h - bottom - linkHeight / 2};
  }

  function apply() {
    const w = home.clientWidth, h = home.clientHeight;
    if (!w || !h) return;
    for (const widget of widgets) {
      widget.wrap.hidden = widget.content.hidden;
      const position = draft[widget.id];
      widget.wrap.style.width = Math.min(position?.width || 550, Math.max(0, w - 48)) + 'px';
    }
    for (const widget of widgets) {
      const p = draft[widget.id];
      const center = p ? {x: p.x * w, y: p.y * h} : defaultPosition(widget);
      const halfWidth = widget.wrap.offsetWidth / 2, halfHeight = widget.wrap.offsetHeight / 2;
      const topMargin = editing ? Math.min(100, h / 3) : 12;
      widget.wrap.style.left = clamp(center.x, halfWidth + 12, Math.max(halfWidth + 12, w - halfWidth - 12)) + 'px';
      widget.wrap.style.top = clamp(center.y, halfHeight + topMargin, Math.max(halfHeight + topMargin, h - halfHeight - 16)) + 'px';
    }
  }

  function positionFor(widget) {
    const a = widget.wrap.getBoundingClientRect(), b = home.getBoundingClientRect();
    return {x: (a.left + a.width / 2 - b.left - home.clientLeft) / home.clientWidth,
      y: (a.top + a.height / 2 - b.top - home.clientTop) / home.clientHeight, width: a.width};
  }

  function startDrag(event, widget, resizing) {
    if (!editing || event.button !== 0) return;
    event.preventDefault();
    const target = event.currentTarget;
    const initial = positionFor(widget);
    draft[widget.id] = {...initial};
    drag = {widget, resizing, initial, pointer: event.pointerId, target, x: event.clientX, y: event.clientY};
    target.setPointerCapture(event.pointerId); widget.wrap.classList.add('dragging');
  }
  function stopDrag() {
    if (drag) {
      if (drag.target.hasPointerCapture(drag.pointer)) drag.target.releasePointerCapture(drag.pointer);
      drag.widget.wrap.classList.remove('dragging');
      drag = null;
    }
    vertical.hidden = horizontal.hidden = true;
  }
  document.addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.pointer) return;
    const {widget, initial} = drag;
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    const w = home.clientWidth, h = home.clientHeight;
    if (drag.resizing) {
      draft[widget.id].width = clamp(initial.width + dx * 2, Math.min(widget.minWidth, w - 48), Math.min(900, w - 48));
    } else {
      let x = initial.x * w + dx, y = initial.y * h + dy;
      const grid = snap.checked && !event.altKey;
      if (grid) { x = Math.round(x / 8) * 8; y = Math.round(y / 8) * 8; }
      const centerX = grid && Math.abs(x - w / 2) < 10, centerY = grid && Math.abs(y - h / 2) < 10;
      if (centerX) x = w / 2;
      if (centerY) y = h / 2;
      vertical.hidden = !centerX; horizontal.hidden = !centerY;
      draft[widget.id] = {...draft[widget.id], x: clamp(x / w, 0, 1), y: clamp(y / h, 0, 1)};
    }
    apply();
  });
  document.addEventListener('pointerup', stopDrag);
  document.addEventListener('pointercancel', stopDrag);
  window.addEventListener('blur', stopDrag);
  function keyboardMove(event, widget, resizing) {
    if (!editing || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const p = positionFor(widget), step = event.shiftKey ? 10 : 1;
    if (resizing) {
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      p.width = clamp(p.width + (event.key === 'ArrowLeft' ? -10 : 10), Math.min(widget.minWidth, home.clientWidth - 48), Math.min(900, home.clientWidth - 48));
    } else {
      if (event.key === 'ArrowLeft') p.x -= step / home.clientWidth;
      if (event.key === 'ArrowRight') p.x += step / home.clientWidth;
      if (event.key === 'ArrowUp') p.y -= step / home.clientHeight;
      if (event.key === 'ArrowDown') p.y += step / home.clientHeight;
      p.x = clamp(p.x, 0, 1); p.y = clamp(p.y, 0, 1);
    }
    draft[widget.id] = p; apply();
  }
  document.addEventListener('keydown', event => {
    if (editing && event.key === 'Escape') { event.preventDefault(); finish(false); }
  });
  window.browser?.onState(state => {
    const tab = state.tabs.find(tab => tab.id === state.active);
    if (editing && (tab?.url || tab?.error || tab?.security)) finish(false);
  });
  document.getElementById('settings-edit-layout').onclick = async () => {
    await go('nocturne://home'); begin();
  };
  apply();
})();
